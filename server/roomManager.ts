// RoomManager - all the multiplayer orchestration, with no socket.io inside.
// The transport (server/index.ts) forwards socket events here and the
// manager pushes updates back through the `Transport` interface. Keeping it
// transport-free makes every use case testable with plain node:test.

import type {
    Room,
    Player,
    RoomSettings,
    RoomInfo,
    ServerToClientEvents,
    TimerPhase,
    Notice,
    TeamId,
    ChatMessage,
    ChatSystemCode,
} from '../shared/types.ts'
import {
    generateRoomCode,
    createRoom,
    createPlayer,
    addPlayerToRoom,
    removePlayerFromRoom,
    ensureHost,
    nextColorIndex,
    normalizeNickname,
    validateNickname,
    normalizeRoomCode,
    validateClue,
    sanitizeSettings,
    canJoinRoom,
    canStartGame,
    startNewRound,
    submitGuess as applyGuess,
    allGuessersDone,
    allReady,
    processRoundResults,
    finishGame,
    resetGameState,
    roomViewFor,
    setPlayerTeam,
    moveTeamNeedle,
    lockTeamGuess,
    submitSideGuess,
    activeTeamHasGuessers,
    opposingTeamPresent,
    teamMembers,
    validateChatInput,
    canSendChatText,
    LIMITS,
    TEAM_RULES,
    CHAT_LIMITS,
} from '../shared/index.ts'

// ============================================
// DEPENDENCIES (injectable for tests)
// ============================================

export type TimerHandle = unknown

export interface Clock {
    now(): number
    setTimeout(fn: () => void, ms: number): TimerHandle
    clearTimeout(handle: TimerHandle): void
}

export const realClock: Clock = {
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

type EventArgs<E extends keyof ServerToClientEvents> = Parameters<ServerToClientEvents[E]>

export interface Transport {
    toRoom<E extends keyof ServerToClientEvents>(code: string, event: E, ...args: EventArgs<E>): void
    toPlayer<E extends keyof ServerToClientEvents>(playerId: string, event: E, ...args: EventArgs<E>): void
}

export interface RoomManagerOptions {
    clock?: Clock
    rng?: () => number
    /**
     * How long a dropped socket may come back (page refresh, flaky wifi)
     * before the player counts as offline for the game flow.
     */
    disconnectGraceMs?: number
    /** How long a disconnected player keeps their seat in the lobby. */
    lobbyGraceMs?: number
    /** How long a disconnected host keeps the crown before it moves on. */
    hostGraceMs?: number
    /** How long a room with nobody connected survives. */
    emptyRoomMs?: number
    log?: (message: string) => void
}

export interface Result<T = void> {
    success: boolean
    error?: string
    data?: T
}

export interface SessionData {
    room: Room
    playerId: string
    sessionToken: string
}

interface RoomTimers {
    tick: TimerHandle | null
    phaseEnd: TimerHandle | null
    phase: TimerPhase | null
    endsAt: number
}

// ============================================
// MANAGER
// ============================================

export class RoomManager {
    private rooms = new Map<string, Room>()
    private playerRooms = new Map<string, string>()
    private sessions = new Map<string, { playerId: string; roomCode: string }>()
    private timers = new Map<string, RoomTimers>()
    private goneTimers = new Map<string, TimerHandle>()
    /** Last accepted live-needle update per player (throttle). */
    private lastNeedleAt = new Map<string, number>()
    /** Timestamps of each player's recent chat messages (sliding-window rate limit). */
    private chatSentAt = new Map<string, number[]>()

    private clock: Clock
    private rng: () => number
    private disconnectGraceMs: number
    private lobbyGraceMs: number
    private hostGraceMs: number
    private emptyRoomMs: number
    private log: (message: string) => void
    private idCounter = 0
    private transport: Transport

    constructor(transport: Transport, options: RoomManagerOptions = {}) {
        this.transport = transport
        this.clock = options.clock ?? realClock
        this.rng = options.rng ?? Math.random
        this.disconnectGraceMs = options.disconnectGraceMs ?? 6_000
        this.lobbyGraceMs = options.lobbyGraceMs ?? 45_000
        this.hostGraceMs = options.hostGraceMs ?? 15_000
        this.emptyRoomMs = options.emptyRoomMs ?? 10 * 60_000
        this.log = options.log ?? (() => {})
    }

    // ---------- lookups ----------

    getRoom(code: string): Room | undefined {
        return this.rooms.get(normalizeRoomCode(code))
    }

    getRoomOfPlayer(playerId: string): Room | undefined {
        const code = this.playerRooms.get(playerId)
        return code ? this.rooms.get(code) : undefined
    }

    getPlayer(playerId: string): Player | undefined {
        return this.getRoomOfPlayer(playerId)?.players.find(p => p.id === playerId)
    }

    get roomCount(): number {
        return this.rooms.size
    }

    getRoomInfo(rawCode: string): Result<RoomInfo> {
        const room = this.getRoom(rawCode)
        if (!room) return { success: false, error: 'Sala não encontrada' }
        const host = room.players.find(p => p.isHost)
        return {
            success: true,
            data: {
                code: room.code,
                hostName: host?.nickname ?? 'Alguém',
                playerCount: room.players.length,
                status: room.status,
            },
        }
    }

    // ---------- sessions ----------

    createRoom(rawNickname: unknown): Result<SessionData> {
        const nickname = normalizeNickname(rawNickname)
        const valid = validateNickname(nickname)
        if (!valid.ok) return { success: false, error: valid.error }

        const code = generateRoomCode(new Set(this.rooms.keys()), this.rng)
        const host = createPlayer(this.newId('p'), nickname, 0, true)
        const room = createRoom(code, host, this.clock.now())

        this.rooms.set(code, room)
        this.playerRooms.set(host.id, code)
        const sessionToken = this.newSession(host.id, code)

        this.log(`room ${code} created by ${nickname}`)
        this.broadcastState(room)
        return { success: true, data: { room, playerId: host.id, sessionToken } }
    }

    joinRoom(rawCode: unknown, rawNickname: unknown): Result<SessionData> {
        const code = normalizeRoomCode(rawCode)
        const room = this.rooms.get(code)
        if (!room) return { success: false, error: 'Sala não encontrada. Confere o código?' }

        const nickname = normalizeNickname(rawNickname)
        const valid = validateNickname(nickname)
        if (!valid.ok) return { success: false, error: valid.error }

        const canJoin = canJoinRoom(room, nickname)
        if (!canJoin.ok) return { success: false, error: canJoin.error }

        const player = createPlayer(this.newId('p'), nickname, nextColorIndex(room.players))
        addPlayerToRoom(room, player)
        this.playerRooms.set(player.id, code)
        const sessionToken = this.newSession(player.id, code)

        this.log(`${nickname} joined ${code}`)
        this.notify(room, 'info', `${nickname} entrou na sala`)
        this.systemChat(room, 'joined', { name: nickname })
        this.broadcastState(room)
        this.resyncTimer(player.id)
        return { success: true, data: { room, playerId: player.id, sessionToken } }
    }

    /** Called when a socket connects carrying a session token. */
    restoreSession(sessionToken: string | undefined): SessionData | null {
        if (!sessionToken) return null
        const session = this.sessions.get(sessionToken)
        if (!session) return null

        const room = this.rooms.get(session.roomCode)
        const player = room?.players.find(p => p.id === session.playerId)
        if (!room || !player) {
            this.sessions.delete(sessionToken)
            return null
        }

        this.cancelGone(player.id)
        player.isConnected = true
        player.disconnectedAt = null
        this.log(`${player.nickname} reconnected to ${room.code}`)
        this.broadcastState(room)
        this.resyncTimer(player.id)
        return { room, playerId: player.id, sessionToken }
    }

    /**
     * Called when a player's socket drops (not an explicit leave). The player
     * only counts as offline after a short grace period, so a page refresh
     * does not skip their round or resolve it without them.
     */
    disconnect(playerId: string): void {
        const room = this.getRoomOfPlayer(playerId)
        const player = room?.players.find(p => p.id === playerId)
        if (!room || !player) return

        player.disconnectedAt = this.clock.now()
        this.log(`${player.nickname} dropped from ${room.code}`)

        if (this.disconnectGraceMs <= 0) {
            this.markOffline(room.code, playerId)
            return
        }
        this.cancelGone(playerId)
        this.goneTimers.set(playerId, this.clock.setTimeout(() => {
            this.goneTimers.delete(playerId)
            this.markOffline(room.code, playerId)
        }, this.disconnectGraceMs))
    }

    private markOffline(code: string, playerId: string): void {
        const room = this.rooms.get(code)
        const player = room?.players.find(p => p.id === playerId)
        if (!room || !player || player.disconnectedAt === null) return

        player.isConnected = false
        this.log(`${player.nickname} is offline in ${room.code}`)
        this.afterPlayerGone(room, player, 'desconectou')
        if (this.rooms.has(room.code)) this.broadcastState(room)
    }

    private cancelGone(playerId: string): void {
        const handle = this.goneTimers.get(playerId)
        if (handle !== undefined) {
            this.clock.clearTimeout(handle)
            this.goneTimers.delete(playerId)
        }
    }

    leaveRoom(playerId: string): void {
        const room = this.getRoomOfPlayer(playerId)
        const player = room?.players.find(p => p.id === playerId)
        if (!room || !player) return

        this.removePlayer(room, player, 'saiu da sala')
    }

    kickPlayer(hostId: string, targetId: string): Result {
        const room = this.getRoomOfPlayer(hostId)
        if (!room) return { success: false, error: 'Sala não encontrada' }
        const host = room.players.find(p => p.id === hostId)
        if (!host?.isHost) return { success: false, error: 'Só o anfitrião pode remover jogadores' }
        const target = room.players.find(p => p.id === targetId)
        if (!target) return { success: false, error: 'Jogador não encontrado' }
        if (target.id === hostId) return { success: false, error: 'Você não pode se remover' }

        this.transport.toPlayer(target.id, 'room:kicked')
        this.removePlayer(room, target, 'foi removido da sala', true, 'kicked')
        return { success: true }
    }

    // ---------- lobby ----------

    updateSettings(hostId: string, partial: Partial<RoomSettings>): Result {
        const room = this.getRoomOfPlayer(hostId)
        if (!room) return { success: false, error: 'Sala não encontrada' }
        const host = room.players.find(p => p.id === hostId)
        if (!host?.isHost) return { success: false, error: 'Só o anfitrião pode mudar as regras' }
        if (room.status !== 'waiting') return { success: false, error: 'As regras só mudam no lobby' }

        room.settings = sanitizeSettings(partial ?? {}, room.settings)
        this.broadcastState(room)
        return { success: true }
    }

    /** Lobby only: anyone can switch their own team, the host can move anyone. */
    setTeam(actorId: string, targetId: string, team: TeamId): Result {
        const room = this.getRoomOfPlayer(actorId)
        if (!room) return { success: false, error: 'Sala não encontrada' }
        const actor = room.players.find(p => p.id === actorId)
        if (actorId !== targetId && !actor?.isHost) return { success: false, error: 'Só o anfitrião pode mover outros jogadores' }
        if (room.status !== 'waiting') return { success: false, error: 'Os times só mudam no lobby' }
        if (team !== 0 && team !== 1) return { success: false, error: 'Time inválido' }
        if (!setPlayerTeam(room, targetId, team)) return { success: false, error: 'Jogador não encontrado' }
        this.broadcastState(room)
        return { success: true }
    }

    startGame(hostId: string): Result {
        const room = this.getRoomOfPlayer(hostId)
        if (!room) return { success: false, error: 'Sala não encontrada' }
        const host = room.players.find(p => p.id === hostId)
        if (!host?.isHost) return { success: false, error: 'Só o anfitrião pode iniciar' }
        if (room.status === 'playing') return { success: false, error: 'A partida já começou' }

        const can = canStartGame(room)
        if (!can.ok) return { success: false, error: can.error }

        resetGameState(room)
        this.beginRound(room)
        this.log(`game started in ${room.code}`)
        return { success: true }
    }

    backToLobby(hostId: string): Result {
        const room = this.getRoomOfPlayer(hostId)
        if (!room) return { success: false, error: 'Sala não encontrada' }
        const host = room.players.find(p => p.id === hostId)
        if (!host?.isHost) return { success: false, error: 'Só o anfitrião pode voltar ao lobby' }

        this.clearTimers(room.code)
        resetGameState(room)
        this.notify(room, 'info', 'De volta ao lobby')
        this.broadcastState(room)
        return { success: true }
    }

    // ---------- round ----------

    giveClue(playerId: string, rawClue: unknown): Result {
        const room = this.getRoomOfPlayer(playerId)
        const round = room?.currentRound
        if (!room || !round) return { success: false, error: 'Nenhuma rodada em andamento' }
        if (round.seerId !== playerId) return { success: false, error: 'Você não é o Vidente desta rodada' }
        if (round.phase !== 'waiting_clue') return { success: false, error: 'A dica já foi dada' }

        const valid = validateClue(rawClue, round.spectrumCard)
        if (!valid.ok) return { success: false, error: valid.error }

        round.clue = valid.clue
        round.phase = 'guessing'
        round.clueAt = this.clock.now()

        this.transport.toRoom(room.code, 'game:clueGiven', valid.clue)
        this.broadcastState(room)
        this.startPhaseTimer(room, 'guess', room.settings.timePerGuess)
        this.log(`clue in ${room.code}: ${valid.clue}`)

        // Nobody to guess (everyone else offline): resolve right away.
        if (round.teamPlay) {
            if (!activeTeamHasGuessers(room)) this.lockTeam(room)
        } else if (allGuessersDone(room)) {
            this.endRound(room)
        }
        return { success: true }
    }

    submitGuess(playerId: string, position: number): Result {
        const room = this.getRoomOfPlayer(playerId)
        if (!room) return { success: false, error: 'Sala não encontrada' }

        const result = applyGuess(room, playerId, position)
        if (!result.ok) return { success: false, error: result.error }

        if (room.currentRound?.teamPlay) {
            this.afterTeamLock(room)
            return { success: true }
        }
        this.broadcastState(room)
        if (allGuessersDone(room)) this.endRound(room)
        return { success: true }
    }

    /**
     * Team mode: a guesser drags the shared needle. Relayed only to the
     * active team (the other team must not see it before the lock), and
     * throttled per player so a fast drag cannot flood the room.
     */
    moveNeedle(playerId: string, position: number): Result {
        const room = this.getRoomOfPlayer(playerId)
        if (!room) return { success: false, error: 'Sala não encontrada' }
        const now = this.clock.now()
        const last = this.lastNeedleAt.get(playerId)
        if (last !== undefined && now - last < TEAM_RULES.NEEDLE_THROTTLE_MS) return { success: false, error: 'Devagar com o ponteiro' }

        const result = moveTeamNeedle(room, playerId, position)
        if (!result.ok) return { success: false, error: result.error }
        this.lastNeedleAt.set(playerId, now)

        const team = room.currentRound!.teamPlay!.team
        for (const member of teamMembers(room, team)) {
            this.transport.toPlayer(member.id, 'game:needle', { position: result.position!, by: playerId })
        }
        return { success: true }
    }

    /** Team mode: the opposing team calls left or right of the locked needle. */
    sideGuess(playerId: string, side: unknown): Result {
        const room = this.getRoomOfPlayer(playerId)
        if (!room) return { success: false, error: 'Sala não encontrada' }
        const result = submitSideGuess(room, playerId, side)
        if (!result.ok) return { success: false, error: result.error }
        this.endRound(room)
        return { success: true }
    }

    setReady(playerId: string): Result {
        const room = this.getRoomOfPlayer(playerId)
        const player = room?.players.find(p => p.id === playerId)
        if (!room || !player) return { success: false, error: 'Sala não encontrada' }
        if (room.status !== 'playing' || room.currentRound?.phase !== 'revealed') {
            return { success: false, error: 'Ainda não é hora da próxima rodada' }
        }

        player.isReady = true
        if (allReady(room)) {
            this.beginRound(room)
        } else {
            this.broadcastState(room)
        }
        return { success: true }
    }

    /** Host shortcut: start the next round without waiting for everyone. */
    forceNextRound(hostId: string): Result {
        const room = this.getRoomOfPlayer(hostId)
        const host = room?.players.find(p => p.id === hostId)
        if (!room || !host?.isHost) return { success: false, error: 'Só o anfitrião pode avançar' }
        if (room.status !== 'playing' || room.currentRound?.phase !== 'revealed') {
            return { success: false, error: 'Ainda não é hora da próxima rodada' }
        }
        this.beginRound(room)
        return { success: true }
    }

    /** Host shortcut: skip a round whose seer is stuck or absent. */
    skipRound(hostId: string): Result {
        const room = this.getRoomOfPlayer(hostId)
        const host = room?.players.find(p => p.id === hostId)
        if (!room || !host?.isHost) return { success: false, error: 'Só o anfitrião pode pular a rodada' }
        if (room.status !== 'playing' || room.currentRound?.phase !== 'waiting_clue') {
            return { success: false, error: 'Só dá para pular enquanto o Vidente pensa na dica' }
        }
        this.notify(room, 'warning', 'Rodada pulada pelo anfitrião')
        this.beginRound(room)
        return { success: true }
    }

    sendState(playerId: string): void {
        const room = this.getRoomOfPlayer(playerId)
        if (!room) return
        this.transport.toPlayer(playerId, 'room:state', roomViewFor(room, playerId))
        this.transport.toPlayer(playerId, 'chat:history', room.chat)
        this.resyncTimer(playerId)
    }

    // ---------- chat ----------

    /**
     * A text or a quick reaction from a player. Validated, rate limited
     * (CHAT_LIMITS.RATE_COUNT per RATE_WINDOW_MS, sliding window) and kept
     * in the room history. The seer may only react while their round is open.
     */
    sendChat(playerId: string, raw: unknown): Result<ChatMessage> {
        const room = this.getRoomOfPlayer(playerId)
        const player = room?.players.find(p => p.id === playerId)
        if (!room || !player) return { success: false, error: 'Sala não encontrada' }

        const valid = validateChatInput(raw)
        if (!valid.ok || !valid.input) return { success: false, error: valid.error }
        if (valid.input.kind === 'text' && !canSendChatText(room, playerId)) {
            return { success: false, error: 'Vidente só manda reações enquanto a rodada está aberta' }
        }

        const now = this.clock.now()
        const recent = (this.chatSentAt.get(playerId) ?? []).filter(t => now - t < CHAT_LIMITS.RATE_WINDOW_MS)
        if (recent.length >= CHAT_LIMITS.RATE_COUNT) {
            this.chatSentAt.set(playerId, recent)
            return { success: false, error: 'Calma! Espere uns segundos para mandar outra mensagem' }
        }
        recent.push(now)
        this.chatSentAt.set(playerId, recent)

        const author = { id: this.newId('m'), at: now, authorId: player.id, author: player.nickname, colorIndex: player.colorIndex }
        const message: ChatMessage = valid.input.kind === 'text'
            ? { ...author, kind: 'text', text: valid.input.text }
            : { ...author, kind: 'reaction', emoji: valid.input.emoji }
        this.pushChat(room, message)
        return { success: true, data: message }
    }

    // ---------- housekeeping ----------

    /**
     * Periodic cleanup: drops players who abandoned the lobby, moves the host
     * crown away from a long-gone host and deletes rooms nobody is in.
     */
    sweep(): void {
        const now = this.clock.now()
        for (const room of Array.from(this.rooms.values())) {
            let changed = false

            if (room.status === 'waiting') {
                for (const player of [...room.players]) {
                    if (!player.isConnected && player.disconnectedAt !== null && now - player.disconnectedAt >= this.lobbyGraceMs) {
                        this.removePlayer(room, player, 'saiu da sala', false)
                        changed = true
                    }
                }
                if (!this.rooms.has(room.code)) continue
            }

            const host = room.players.find(p => p.isHost)
            if (host && !host.isConnected && host.disconnectedAt !== null && now - host.disconnectedAt >= this.hostGraceMs) {
                const newHost = ensureHost(room)
                if (newHost && newHost.id !== host.id) {
                    this.notify(room, 'info', `${newHost.nickname} agora é o anfitrião`)
                    changed = true
                }
            }

            const anyoneConnected = room.players.some(p => p.isConnected)
            if (!anyoneConnected) {
                const lastSeen = Math.max(room.createdAt, ...room.players.map(p => p.disconnectedAt ?? 0))
                if (room.players.length === 0 || now - lastSeen >= this.emptyRoomMs) {
                    this.deleteRoom(room.code)
                    continue
                }
            }

            if (changed) this.broadcastState(room)
        }
    }

    destroy(): void {
        for (const code of Array.from(this.rooms.keys())) this.deleteRoom(code)
    }

    // ============================================
    // INTERNALS
    // ============================================

    private newId(prefix: string): string {
        this.idCounter += 1
        return `${prefix}_${this.clock.now().toString(36)}${this.idCounter.toString(36)}${Math.floor(this.rng() * 1e9).toString(36)}`
    }

    private newSession(playerId: string, roomCode: string): string {
        const token = this.newId('s') + Math.floor(this.rng() * 1e12).toString(36)
        this.sessions.set(token, { playerId, roomCode })
        return token
    }

    private forgetSessions(playerId: string): void {
        for (const [token, session] of Array.from(this.sessions.entries())) {
            if (session.playerId === playerId) this.sessions.delete(token)
        }
    }

    private notify(room: Room, kind: Notice['kind'], message: string): void {
        this.transport.toRoom(room.code, 'room:notice', { kind, message })
    }

    private pushChat(room: Room, message: ChatMessage): void {
        room.chat.push(message)
        if (room.chat.length > CHAT_LIMITS.HISTORY) room.chat.splice(0, room.chat.length - CHAT_LIMITS.HISTORY)
        this.transport.toRoom(room.code, 'chat:message', message)
    }

    private systemChat(room: Room, code: ChatSystemCode, params: Record<string, string | number> = {}): void {
        this.pushChat(room, { id: this.newId('m'), at: this.clock.now(), kind: 'system', code, params })
    }

    /** Ends the game for everyone: `game:finished` plus the chat line. */
    private announceFinished(room: Room): void {
        this.transport.toRoom(room.code, 'game:finished', room.winnerId)
        const winner = room.players.find(p => p.id === room.winnerId)
        const params: Record<string, string | number> = room.settings.mode === 'teams'
            ? (room.winnerTeam !== null ? { team: room.winnerTeam } : {})
            : (winner ? { name: winner.nickname } : {})
        this.systemChat(room, 'game_finished', params)
    }

    private broadcastState(room: Room): void {
        for (const player of room.players) {
            this.transport.toPlayer(player.id, 'room:state', roomViewFor(room, player.id))
        }
    }

    private removePlayer(room: Room, player: Player, reason: string, broadcast = true, chatCode: ChatSystemCode = 'left'): void {
        const wasHost = player.isHost
        this.cancelGone(player.id)
        this.lastNeedleAt.delete(player.id)
        this.chatSentAt.delete(player.id)
        removePlayerFromRoom(room, player.id)
        this.playerRooms.delete(player.id)
        this.forgetSessions(player.id)
        this.log(`${player.nickname} removed from ${room.code} (${reason})`)

        if (room.players.length === 0) {
            this.deleteRoom(room.code)
            return
        }

        this.notify(room, 'info', `${player.nickname} ${reason}`)
        this.systemChat(room, chatCode, { name: player.nickname })
        if (wasHost) {
            const newHost = room.players.find(p => p.isHost)
            if (newHost) this.notify(room, 'info', `${newHost.nickname} agora é o anfitrião`)
        }

        this.afterPlayerGone(room, player, reason)
        if (broadcast && this.rooms.has(room.code)) this.broadcastState(room)
    }

    /** Shared follow-up for disconnects, leaves and kicks during a game. */
    private afterPlayerGone(room: Room, player: Player, reason: string): void {
        if (room.status !== 'playing' || !room.currentRound) return

        const connected = room.players.filter(p => p.isConnected)
        const teamEmptied = room.settings.mode === 'teams' && ([0, 1] as TeamId[]).some(t => !room.players.some(p => p.team === t))
        if (room.players.length < LIMITS.MIN_PLAYERS || teamEmptied) {
            this.notify(room, 'warning', 'Jogadores insuficientes, a partida terminou')
            this.clearTimers(room.code)
            finishGame(room)
            this.announceFinished(room)
            return
        }
        if (connected.length === 0) return

        const round = room.currentRound
        if (round.phase === 'waiting_clue' && round.seerId === player.id) {
            this.notify(room, 'warning', `O Vidente ${player.nickname} ${reason}. Pulando a rodada.`)
            this.beginRound(room)
        } else if (round.teamPlay) {
            if (round.phase === 'guessing' && !activeTeamHasGuessers(room)) this.lockTeam(room)
            else if (round.phase === 'side_guess' && !opposingTeamPresent(room)) this.endRound(room)
            else if (round.phase === 'revealed' && allReady(room)) this.beginRound(room)
        } else if (round.phase === 'guessing' && allGuessersDone(room)) {
            this.endRound(room)
        } else if (round.phase === 'revealed' && allReady(room)) {
            this.beginRound(room)
        }
    }

    private beginRound(room: Room): void {
        this.clearTimers(room.code)
        const round = startNewRound(room, this.clock.now(), this.rng)
        if (!round) {
            if (room.settings.mode === 'teams' && room.status === 'playing') {
                // Neither team can field a seer and a guesser anymore.
                this.notify(room, 'warning', 'Jogadores insuficientes, a partida terminou')
                finishGame(room)
                this.announceFinished(room)
                this.broadcastState(room)
            }
            // FFA: nobody connected to be the seer; the sweep will clean up later.
            return
        }
        this.transport.toRoom(room.code, 'game:roundStart', round.roundNumber)
        this.broadcastState(room)
        if (room.settings.timePerClue > 0) {
            this.startPhaseTimer(room, 'clue', room.settings.timePerClue)
        }
    }

    private endRound(room: Room): void {
        this.clearTimers(room.code)
        const round = processRoundResults(room, this.clock.now())
        if (!round) return

        this.transport.toRoom(room.code, 'game:reveal', round.roundNumber)
        this.systemChat(room, 'round_revealed', { round: round.roundNumber })
        this.broadcastState(room)

        if (room.status === 'finished') {
            this.announceFinished(room)
            this.log(`game finished in ${room.code}, winner ${room.winnerId}`)
            return
        }
        this.startPhaseTimer(room, 'next', room.settings.timeBetweenRounds)
    }

    /** Team mode: locks the needle where the team left it (timer or nobody left to guess). */
    private lockTeam(room: Room): void {
        lockTeamGuess(room)
        this.afterTeamLock(room)
    }

    private afterTeamLock(room: Room): void {
        if (room.currentRound?.phase !== 'side_guess') return
        this.broadcastState(room)
        if (opposingTeamPresent(room)) {
            this.startPhaseTimer(room, 'side', TEAM_RULES.SIDE_GUESS_SECONDS)
        } else {
            this.endRound(room)
        }
    }

    private onPhaseTimeout(code: string, phase: TimerPhase): void {
        const room = this.rooms.get(code)
        const round = room?.currentRound
        if (!room || !round || room.status !== 'playing') return

        if (phase === 'clue' && round.phase === 'waiting_clue') {
            this.notify(room, 'warning', 'Tempo esgotado para a dica. Pulando a rodada.')
            this.beginRound(room)
        } else if (phase === 'guess' && round.phase === 'guessing') {
            if (round.teamPlay) this.lockTeam(room)
            else this.endRound(room)
        } else if (phase === 'side' && round.phase === 'side_guess') {
            this.endRound(room)
        } else if (phase === 'next' && round.phase === 'revealed') {
            this.beginRound(room)
        }
    }

    private startPhaseTimer(room: Room, phase: TimerPhase, seconds: number): void {
        this.clearTimers(room.code)
        if (seconds <= 0) return

        const endsAt = this.clock.now() + seconds * 1000
        const timers: RoomTimers = { tick: null, phaseEnd: null, phase, endsAt }
        this.timers.set(room.code, timers)

        timers.phaseEnd = this.clock.setTimeout(() => {
            this.clearTimers(room.code)
            this.onPhaseTimeout(room.code, phase)
        }, seconds * 1000)

        const tick = () => {
            const current = this.timers.get(room.code)
            if (!current || current !== timers) return
            this.transport.toRoom(room.code, 'game:timer', this.timerPayload(timers))
            timers.tick = this.clock.setTimeout(tick, 1000)
        }
        tick()
    }

    private timerPayload(timers: RoomTimers) {
        const now = this.clock.now()
        return {
            phase: timers.phase as TimerPhase,
            secondsLeft: Math.max(0, Math.ceil((timers.endsAt - now) / 1000)),
            endsAt: timers.endsAt,
            serverTime: now,
        }
    }

    private resyncTimer(playerId: string): void {
        const code = this.playerRooms.get(playerId)
        const timers = code ? this.timers.get(code) : undefined
        if (!timers || !timers.phase) return
        this.transport.toPlayer(playerId, 'game:timer', this.timerPayload(timers))
    }

    private clearTimers(code: string): void {
        const timers = this.timers.get(code)
        if (!timers) return
        if (timers.tick) this.clock.clearTimeout(timers.tick)
        if (timers.phaseEnd) this.clock.clearTimeout(timers.phaseEnd)
        this.timers.delete(code)
    }

    private deleteRoom(code: string): void {
        const room = this.rooms.get(code)
        if (!room) return
        this.clearTimers(code)
        for (const player of room.players) {
            this.cancelGone(player.id)
            this.playerRooms.delete(player.id)
            this.chatSentAt.delete(player.id)
            this.forgetSessions(player.id)
        }
        this.rooms.delete(code)
        this.log(`room ${code} deleted`)
    }
}
