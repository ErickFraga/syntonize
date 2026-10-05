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
    Message,
    SkipReason,
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
    deckSettingsFrom,
    isDeckPlayable,
    canJoinRoom,
    canStartGame,
    startNewRound,
    recordSkippedRound,
    historyViewFor,
    submitGuess as applyGuess,
    allGuessersDone,
    allReady,
    processRoundResults,
    finishGame,
    resetGameState,
    roomViewFor,
    setPlayerTeam,
    shuffleTeams,
    moveTeamNeedle,
    lockTeamGuess,
    submitSideGuess,
    activeTeamHasGuessers,
    opposingTeamPresent,
    teamMembers,
    isCoop,
    validateChatInput,
    canSendChatText,
    LIMITS,
    TEAM_RULES,
    CHAT_LIMITS,
    msg,
} from '../shared/index.ts'
import { DEFAULT_ROOM_TTL_MS, SNAPSHOT_VERSION, type RoomSnapshot, type RoomStore, type StoredTimer } from './roomStore.ts'

/** Why a player left the game flow (also picks the notice the room gets). */
type GoneReason = 'left' | 'kicked' | 'disconnected'

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
    /**
     * Where rooms are written through so they survive a restart. Without it
     * rooms only live in this process (the tests use it that way).
     */
    store?: RoomStore
    /** Debounce of store writes per room (bursts of mutations become one save). */
    persistDebounceMs?: number
    /** Delay before retrying a failed store write. */
    persistRetryMs?: number
    /** Rooms whose last save is older than this are not restored. */
    roomTtlMs?: number
    /**
     * After a restart, how long players who were online keep counting as
     * connected while their clients reconnect with the session token.
     */
    restoreGraceMs?: number
    /**
     * A session token stops working after this long without being used
     * (issued, reconnected with, or its socket dropping). Players still
     * connected never expire.
     */
    sessionTtlMs?: number
    log?: (message: string) => void
}

export interface Result<T = void> {
    success: boolean
    error?: Message
    data?: T
}

export interface SessionData {
    room: Room
    playerId: string
    sessionToken: string
}

interface SessionEntry {
    playerId: string
    roomCode: string
    lastUsedAt: number
}

/** Idle time after which a session token is refused. */
export const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60_000

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
    private sessions = new Map<string, SessionEntry>()
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
    private store: RoomStore | null
    private persistDebounceMs: number
    private persistRetryMs: number
    private roomTtlMs: number
    private restoreGraceMs: number
    private sessionTtlMs: number
    /** Pending debounced save per room code. */
    private persistTimers = new Map<string, TimerHandle>()
    /** Store writes not settled yet (awaited by `flush`). */
    private inFlight = new Set<Promise<void>>()
    /** Rooms loaded on boot that no player came back to yet (see `loadFromStore`). */
    private dormant = new Map<string, { timer: StoredTimer | null; loadedAt: number }>()
    private wakes = new Map<string, Promise<void>>()
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
        this.store = options.store ?? null
        this.persistDebounceMs = options.persistDebounceMs ?? 250
        this.persistRetryMs = options.persistRetryMs ?? 5_000
        this.roomTtlMs = options.roomTtlMs ?? DEFAULT_ROOM_TTL_MS
        this.restoreGraceMs = options.restoreGraceMs ?? 30_000
        this.sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS
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
        if (!room) return { success: false, error: msg('room_not_found') }
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
        if (this.dormant.has(code)) this.activate(code)
        const room = this.rooms.get(code)
        if (!room) return { success: false, error: msg('room_not_found') }

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
        this.notify(room, 'info', msg('player_joined', { name: nickname }))
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
        if (this.sessionExpired(session)) {
            this.sessions.delete(sessionToken)
            return null
        }

        // Callers should `wake` first for the freshest copy; this is the fallback.
        if (this.dormant.has(session.roomCode)) this.activate(session.roomCode)
        const room = this.rooms.get(session.roomCode)
        const player = room?.players.find(p => p.id === session.playerId)
        if (!room || !player) {
            this.sessions.delete(sessionToken)
            return null
        }

        this.cancelGone(player.id)
        session.lastUsedAt = this.clock.now()
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
        // The idle countdown of the token starts when the socket drops.
        for (const session of this.sessions.values()) {
            if (session.playerId === playerId) session.lastUsedAt = player.disconnectedAt
        }
        this.log(`${player.nickname} dropped from ${room.code}`)

        if (this.disconnectGraceMs <= 0) {
            this.markOffline(room.code, playerId)
            return
        }
        this.armGone(room.code, playerId, this.disconnectGraceMs)
        this.markDirty(room)
    }

    /** Counts the player as offline after `ms` unless they reconnect first. */
    private armGone(code: string, playerId: string, ms: number): void {
        this.cancelGone(playerId)
        this.goneTimers.set(playerId, this.clock.setTimeout(() => {
            this.goneTimers.delete(playerId)
            this.markOffline(code, playerId)
        }, ms))
    }

    private markOffline(code: string, playerId: string): void {
        const room = this.rooms.get(code)
        const player = room?.players.find(p => p.id === playerId)
        if (!room || !player || player.disconnectedAt === null) return

        player.isConnected = false
        this.log(`${player.nickname} is offline in ${room.code}`)
        this.afterPlayerGone(room, player, 'disconnected')
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

        this.removePlayer(room, player, 'left')
    }

    kickPlayer(hostId: string, targetId: string): Result {
        const room = this.getRoomOfPlayer(hostId)
        if (!room) return { success: false, error: msg('room_not_found') }
        const host = room.players.find(p => p.id === hostId)
        if (!host?.isHost) return { success: false, error: msg('host_only_kick') }
        const target = room.players.find(p => p.id === targetId)
        if (!target) return { success: false, error: msg('player_not_found') }
        if (target.id === hostId) return { success: false, error: msg('cannot_kick_self') }

        this.transport.toPlayer(target.id, 'room:kicked')
        this.removePlayer(room, target, 'kicked')
        return { success: true }
    }

    // ---------- lobby ----------

    updateSettings(hostId: string, partial: Partial<RoomSettings>): Result {
        const room = this.getRoomOfPlayer(hostId)
        if (!room) return { success: false, error: msg('room_not_found') }
        const host = room.players.find(p => p.id === hostId)
        if (!host?.isHost) return { success: false, error: msg('host_only_settings') }
        if (room.status !== 'waiting') return { success: false, error: msg('settings_lobby_only') }

        // Every pack off needs enough custom cards, or the deck would be (almost) empty.
        const touchesDeck = Array.isArray(partial?.packs) || Array.isArray(partial?.customCards)
        if (touchesDeck && !isDeckPlayable(deckSettingsFrom(partial, room.settings))) {
            return { success: false, error: msg('packs_empty', { min: LIMITS.CUSTOM_CARDS_MIN_DECK }) }
        }
        room.settings = sanitizeSettings(partial ?? {}, room.settings)
        this.broadcastState(room)
        return { success: true }
    }

    /** Lobby only: anyone can switch their own team, the host can move anyone. */
    setTeam(actorId: string, targetId: string, team: TeamId): Result {
        const room = this.getRoomOfPlayer(actorId)
        if (!room) return { success: false, error: msg('room_not_found') }
        const actor = room.players.find(p => p.id === actorId)
        if (actorId !== targetId && !actor?.isHost) return { success: false, error: msg('host_only_move') }
        if (room.status !== 'waiting') return { success: false, error: msg('teams_lobby_only') }
        if (team !== 0 && team !== 1) return { success: false, error: msg('invalid_team') }
        if (!setPlayerTeam(room, targetId, team)) return { success: false, error: msg('player_not_found') }
        this.broadcastState(room)
        return { success: true }
    }

    /** Lobby, team mode: the host reshuffles everyone into balanced teams. */
    shuffleTeams(hostId: string): Result {
        const room = this.getRoomOfPlayer(hostId)
        if (!room) return { success: false, error: msg('room_not_found') }
        const host = room.players.find(p => p.id === hostId)
        if (!host?.isHost) return { success: false, error: msg('host_only_move') }
        if (room.status !== 'waiting') return { success: false, error: msg('teams_lobby_only') }
        shuffleTeams(room, this.rng)
        this.broadcastState(room)
        return { success: true }
    }

    startGame(hostId: string): Result {
        const room = this.getRoomOfPlayer(hostId)
        if (!room) return { success: false, error: msg('room_not_found') }
        const host = room.players.find(p => p.id === hostId)
        if (!host?.isHost) return { success: false, error: msg('host_only_start') }
        if (room.status === 'playing') return { success: false, error: msg('game_already_started') }

        const can = canStartGame(room)
        if (!can.ok) return { success: false, error: can.error }

        resetGameState(room)
        this.broadcastHistory(room)
        this.beginRound(room)
        this.log(`game started in ${room.code}`)
        return { success: true }
    }

    backToLobby(hostId: string): Result {
        const room = this.getRoomOfPlayer(hostId)
        if (!room) return { success: false, error: msg('room_not_found') }
        const host = room.players.find(p => p.id === hostId)
        if (!host?.isHost) return { success: false, error: msg('host_only_lobby') }

        this.clearTimers(room.code)
        resetGameState(room)
        this.broadcastHistory(room)
        this.notify(room, 'info', msg('back_to_lobby'))
        this.broadcastState(room)
        return { success: true }
    }

    // ---------- round ----------

    giveClue(playerId: string, rawClue: unknown): Result {
        const room = this.getRoomOfPlayer(playerId)
        const round = room?.currentRound
        if (!room || !round) return { success: false, error: msg('no_round') }
        if (round.seerId !== playerId) return { success: false, error: msg('not_the_seer') }
        if (round.phase !== 'waiting_clue') return { success: false, error: msg('clue_already_given') }

        const valid = validateClue(rawClue, round.spectrumCard, room.settings.cardLocale)
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
        if (!room) return { success: false, error: msg('room_not_found') }

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
        if (!room) return { success: false, error: msg('room_not_found') }
        const now = this.clock.now()
        const last = this.lastNeedleAt.get(playerId)
        if (last !== undefined && now - last < TEAM_RULES.NEEDLE_THROTTLE_MS) return { success: false, error: msg('needle_throttled') }

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
        if (!room) return { success: false, error: msg('room_not_found') }
        const result = submitSideGuess(room, playerId, side)
        if (!result.ok) return { success: false, error: result.error }
        this.endRound(room)
        return { success: true }
    }

    setReady(playerId: string): Result {
        const room = this.getRoomOfPlayer(playerId)
        const player = room?.players.find(p => p.id === playerId)
        if (!room || !player) return { success: false, error: msg('room_not_found') }
        if (room.status !== 'playing' || room.currentRound?.phase !== 'revealed') {
            return { success: false, error: msg('not_next_round_time') }
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
        if (!room || !host?.isHost) return { success: false, error: msg('host_only_next') }
        if (room.status !== 'playing' || room.currentRound?.phase !== 'revealed') {
            return { success: false, error: msg('not_next_round_time') }
        }
        this.beginRound(room)
        return { success: true }
    }

    /** Host shortcut: skip a round whose seer is stuck or absent. */
    skipRound(hostId: string): Result {
        const room = this.getRoomOfPlayer(hostId)
        const host = room?.players.find(p => p.id === hostId)
        if (!room || !host?.isHost) return { success: false, error: msg('host_only_skip') }
        if (room.status !== 'playing' || room.currentRound?.phase !== 'waiting_clue') {
            return { success: false, error: msg('skip_only_waiting_clue') }
        }
        this.notify(room, 'warning', msg('round_skipped_by_host'))
        this.skipCurrentRound(room, 'host')
        return { success: true }
    }

    sendState(playerId: string): void {
        const room = this.getRoomOfPlayer(playerId)
        if (!room) return
        this.transport.toPlayer(playerId, 'room:state', roomViewFor(room, playerId))
        this.transport.toPlayer(playerId, 'game:history', historyViewFor(room))
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
        if (!room || !player) return { success: false, error: msg('room_not_found') }

        const valid = validateChatInput(raw)
        if (!valid.ok || !valid.input) return { success: false, error: valid.error }
        if (valid.input.kind === 'text' && !canSendChatText(room, playerId)) {
            return { success: false, error: msg('chat_seer_reactions_only') }
        }

        const now = this.clock.now()
        const recent = (this.chatSentAt.get(playerId) ?? []).filter(t => now - t < CHAT_LIMITS.RATE_WINDOW_MS)
        if (recent.length >= CHAT_LIMITS.RATE_COUNT) {
            this.chatSentAt.set(playerId, recent)
            return { success: false, error: msg('chat_rate_limited') }
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
        for (const [token, session] of Array.from(this.sessions.entries())) {
            if (this.sessionExpired(session)) this.sessions.delete(token)
        }
        for (const room of Array.from(this.rooms.values())) {
            const dormant = this.dormant.get(room.code)
            if (dormant) {
                // Nobody came back for it: same fate as any empty room.
                if (now - dormant.loadedAt >= this.emptyRoomMs) this.deleteRoom(room.code)
                continue
            }
            let changed = false

            if (room.status === 'waiting') {
                for (const player of [...room.players]) {
                    if (!player.isConnected && player.disconnectedAt !== null && now - player.disconnectedAt >= this.lobbyGraceMs) {
                        this.removePlayer(room, player, 'left', false)
                        changed = true
                    }
                }
                if (!this.rooms.has(room.code)) continue
            }

            const host = room.players.find(p => p.isHost)
            if (host && !host.isConnected && host.disconnectedAt !== null && now - host.disconnectedAt >= this.hostGraceMs) {
                const newHost = ensureHost(room)
                if (newHost && newHost.id !== host.id) {
                    this.notify(room, 'info', msg('new_host', { name: newHost.nickname }))
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

    /** Drops every room from memory (the store keeps them: this is a shutdown, not a cleanup). */
    destroy(): void {
        for (const code of Array.from(this.rooms.keys())) this.deleteRoom(code, false)
    }

    // ---------- persistence ----------

    /**
     * Server boot: indexes every saved room (codes, tokens) as *dormant*.
     * A dormant room is not written and runs no timers until a player comes
     * back (`wake`): during a zero-downtime deploy the old process is still
     * playing it, and only its final save is the truth. Returns the count.
     */
    async loadFromStore(): Promise<number> {
        if (!this.store) return 0
        const snapshots = await this.store.loadAll()
        let restored = 0
        for (const snapshot of snapshots) {
            try {
                if (this.restoreDormant(snapshot)) restored += 1
            } catch (error) {
                this.log(`could not restore room ${snapshot.room?.code}: ${(error as Error).message}`)
            }
        }
        return restored
    }

    isDormant(code: string): boolean {
        return this.dormant.has(normalizeRoomCode(code))
    }

    /**
     * Activates a dormant room with its latest saved state (re-read from the
     * store, so a save made by the previous process after our boot wins).
     * No-op for rooms already active or unknown.
     */
    wake(rawCode: string): Promise<void> {
        const code = normalizeRoomCode(rawCode)
        if (!this.dormant.has(code) || !this.store) return Promise.resolve()
        const pending = this.wakes.get(code)
        if (pending) return pending

        const store = this.store
        const wake = (async () => {
            let fresh: RoomSnapshot | null | undefined
            try {
                fresh = await store.load(code)
            } catch (error) {
                // Store unreachable: the copy loaded on boot is the best we have.
                this.log(`store load ${code} failed: ${(error as Error).message}`)
            }
            const loaded = this.dormant.get(code)
            if (!loaded) return // activated or deleted meanwhile
            if (fresh === null) {
                // The previous process deleted it after our boot (game over, everyone left).
                this.deleteRoom(code, false)
                return
            }
            // Nobody else writes a dormant room but the previous process, so
            // what the store holds now is the latest state.
            if (fresh && this.isRestorable(fresh)) {
                this.unindexRoom(code)
                this.indexRoom(fresh)
                this.dormant.set(code, { timer: fresh.timer, loadedAt: loaded.loadedAt })
            }
            this.activate(code)
        })().finally(() => this.wakes.delete(code))
        this.wakes.set(code, wake)
        return wake
    }

    /** `restoreSession` for a socket connecting with a token, waking its room first. */
    async resumeSession(sessionToken: string | undefined): Promise<SessionData | null> {
        const session = sessionToken ? this.sessions.get(sessionToken) : undefined
        if (session) await this.wake(session.roomCode)
        return this.restoreSession(sessionToken)
    }

    /** Writes every pending save right away and waits for all writes (graceful shutdown). */
    async flush(): Promise<void> {
        for (const code of Array.from(this.persistTimers.keys())) this.persistNow(code)
        while (this.inFlight.size > 0) await Promise.all(Array.from(this.inFlight))
    }

    private isRestorable(snapshot: RoomSnapshot): boolean {
        return snapshot.version === SNAPSHOT_VERSION
            && this.clock.now() - snapshot.savedAt < this.roomTtlMs
            && snapshot.room.players.length > 0
    }

    private restoreDormant(snapshot: RoomSnapshot): boolean {
        const code = snapshot.room.code
        if (!this.isRestorable(snapshot)) {
            this.track(this.store!.delete(code), `delete ${code}`)
            return false
        }
        if (this.rooms.has(code)) return false
        this.indexRoom(snapshot)
        this.dormant.set(code, { timer: snapshot.timer, loadedAt: this.clock.now() })
        this.log(`room ${code} loaded (${snapshot.room.players.length} players, ${snapshot.room.status})`)
        return true
    }

    /** Puts a snapshot's room, players and session tokens in the in-memory indexes. */
    private indexRoom(snapshot: RoomSnapshot): void {
        const { room } = snapshot
        room.chat ??= []
        this.rooms.set(room.code, room)
        for (const player of room.players) this.playerRooms.set(player.id, room.code)
        const playerIds = new Set(room.players.map(p => p.id))
        for (const session of snapshot.sessions) {
            if (playerIds.has(session.playerId)) this.sessions.set(session.token, { playerId: session.playerId, roomCode: room.code, lastUsedAt: session.lastUsedAt ?? snapshot.savedAt })
        }
    }

    private unindexRoom(code: string): void {
        const room = this.rooms.get(code)
        if (!room) return
        for (const player of room.players) this.playerRooms.delete(player.id)
        for (const [token, session] of Array.from(this.sessions.entries())) {
            if (session.roomCode === code) this.sessions.delete(token)
        }
        this.rooms.delete(code)
    }

    /**
     * Brings a dormant room back to life: players who were online count as
     * just dropped (`restoreGraceMs` to reconnect with their token) and the
     * phase timer is re-armed from its absolute end. A phase that ended while
     * nobody ran the room resolves now, as if its timer had fired.
     */
    private activate(code: string): void {
        const loaded = this.dormant.get(code)
        const room = this.rooms.get(code)
        this.dormant.delete(code)
        if (!loaded || !room) return

        const now = this.clock.now()
        for (const player of room.players) {
            player.disconnectedAt = now
            if (player.isConnected) this.armGone(code, player.id, this.restoreGraceMs)
        }
        this.log(`room ${code} restored (${room.players.length} players, ${room.status})`)

        const timer = loaded.timer
        if (timer && room.status === 'playing' && room.currentRound) {
            if (timer.endsAt > now) this.startPhaseTimerUntil(room, timer.phase, timer.endsAt)
            else this.onPhaseTimeout(code, timer.phase)
        }
        this.markDirty(room)
    }

    private snapshotOf(room: Room): RoomSnapshot {
        const sessions: RoomSnapshot['sessions'] = []
        for (const [token, session] of this.sessions) {
            if (session.roomCode === room.code) sessions.push({ token, playerId: session.playerId, lastUsedAt: session.lastUsedAt })
        }
        const timers = this.timers.get(room.code)
        return {
            version: SNAPSHOT_VERSION,
            savedAt: this.clock.now(),
            room,
            sessions,
            timer: timers?.phase ? { phase: timers.phase, endsAt: timers.endsAt } : null,
        }
    }

    /** Schedules a debounced save of the room (the save reads the state at that time). */
    private markDirty(room: Room, delay = this.persistDebounceMs): void {
        if (!this.store || this.persistTimers.has(room.code) || this.dormant.has(room.code)) return
        const code = room.code
        this.persistTimers.set(code, this.clock.setTimeout(() => this.persistNow(code), delay))
    }

    private persistNow(code: string): void {
        const handle = this.persistTimers.get(code)
        if (handle !== undefined) this.clock.clearTimeout(handle)
        this.persistTimers.delete(code)
        const room = this.rooms.get(code)
        if (!room || !this.store) return
        // Snapshot taken synchronously: later mutations go in the next save.
        this.track(this.store.save(this.snapshotOf(room)), `save ${code}`, () => {
            if (this.rooms.get(code) === room) this.markDirty(room, this.persistRetryMs)
        })
    }

    private track(write: Promise<void>, what: string, onError?: () => void): void {
        const tracked = write.then(
            () => {},
            (error: Error) => {
                this.log(`store ${what} failed: ${error?.message ?? error}`)
                onError?.()
            },
        ).finally(() => this.inFlight.delete(tracked))
        this.inFlight.add(tracked)
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
        this.sessions.set(token, { playerId, roomCode, lastUsedAt: this.clock.now() })
        return token
    }

    private sessionExpired(session: SessionEntry): boolean {
        // A dormant room's "connected" flags are from before the restart: nobody is really online.
        if (!this.dormant.has(session.roomCode) && this.getPlayer(session.playerId)?.isConnected) return false
        return this.clock.now() - session.lastUsedAt >= this.sessionTtlMs
    }

    private forgetSessions(playerId: string): void {
        for (const [token, session] of Array.from(this.sessions.entries())) {
            if (session.playerId === playerId) this.sessions.delete(token)
        }
    }

    private notify(room: Room, kind: Notice['kind'], message: Message): void {
        this.transport.toRoom(room.code, 'room:notice', { kind, ...message })
    }

    private pushChat(room: Room, message: ChatMessage): void {
        room.chat.push(message)
        if (room.chat.length > CHAT_LIMITS.HISTORY) room.chat.splice(0, room.chat.length - CHAT_LIMITS.HISTORY)
        this.markDirty(room)
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
            : room.settings.mode === 'coop'
                ? { won: room.winnerTeam !== null ? 1 : 0 }
                : (winner ? { name: winner.nickname } : {})
        this.systemChat(room, 'game_finished', params)
    }

    private broadcastState(room: Room): void {
        this.markDirty(room)
        for (const player of room.players) {
            this.transport.toPlayer(player.id, 'room:state', roomViewFor(room, player.id))
        }
    }

    private broadcastHistory(room: Room): void {
        this.transport.toRoom(room.code, 'game:history', historyViewFor(room))
    }

    private removePlayer(room: Room, player: Player, reason: GoneReason, broadcast = true): void {
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

        this.notify(room, 'info', msg(`player_${reason}`, { name: player.nickname }))
        this.systemChat(room, reason === 'kicked' ? 'kicked' : 'left', { name: player.nickname })
        if (wasHost) {
            const newHost = room.players.find(p => p.isHost)
            if (newHost) this.notify(room, 'info', msg('new_host', { name: newHost.nickname }))
        }

        this.afterPlayerGone(room, player, reason)
        if (broadcast && this.rooms.has(room.code)) this.broadcastState(room)
    }

    /** Shared follow-up for disconnects, leaves and kicks during a game. */
    private afterPlayerGone(room: Room, player: Player, reason: GoneReason): void {
        if (room.status !== 'playing' || !room.currentRound) return

        const connected = room.players.filter(p => p.isConnected)
        const teamEmptied = room.settings.mode === 'teams' && ([0, 1] as TeamId[]).some(t => !room.players.some(p => p.team === t))
        if (room.players.length < LIMITS.MIN_PLAYERS || teamEmptied) {
            this.notify(room, 'warning', msg('not_enough_players_end'))
            this.clearTimers(room.code)
            finishGame(room)
            this.announceFinished(room)
            return
        }
        if (connected.length === 0) return

        const round = room.currentRound
        if (round.phase === 'waiting_clue' && round.seerId === player.id) {
            this.notify(room, 'warning', msg(`seer_${reason}`, { name: player.nickname }))
            this.skipCurrentRound(room, `seer_${reason}`, player)
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
                this.notify(room, 'warning', msg('not_enough_players_end'))
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

    /** Logs the round in play as skipped (history panel) and deals the next one. */
    private skipCurrentRound(room: Room, reason: SkipReason, gone: Player | null = null): void {
        if (recordSkippedRound(room, reason, this.clock.now(), gone)) this.broadcastHistory(room)
        this.beginRound(room)
    }

    private endRound(room: Room): void {
        this.clearTimers(room.code)
        const round = processRoundResults(room, this.clock.now())
        if (!round) return

        // History first, so the state of the reveal never counts rounds the client does not have yet.
        this.broadcastHistory(room)
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
        // Cooperative has no left/right call: the locked needle is the answer.
        if (isCoop(room)) {
            this.endRound(room)
            return
        }
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
            this.notify(room, 'warning', msg('clue_timeout_skip'))
            this.skipCurrentRound(room, 'clue_timeout')
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
        this.startPhaseTimerUntil(room, phase, this.clock.now() + seconds * 1000)
    }

    /** Arms the phase timer to end at an absolute time (also used to re-arm after a restart). */
    private startPhaseTimerUntil(room: Room, phase: TimerPhase, endsAt: number): void {
        this.clearTimers(room.code)
        const timers: RoomTimers = { tick: null, phaseEnd: null, phase, endsAt }
        this.timers.set(room.code, timers)

        timers.phaseEnd = this.clock.setTimeout(() => {
            this.clearTimers(room.code)
            this.onPhaseTimeout(room.code, phase)
        }, Math.max(0, endsAt - this.clock.now()))
        // The timer's end is part of the snapshot.
        this.markDirty(room)

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

    private deleteRoom(code: string, fromStore = true): void {
        const room = this.rooms.get(code)
        if (!room) return
        this.clearTimers(code)
        const pending = this.persistTimers.get(code)
        if (pending !== undefined) this.clock.clearTimeout(pending)
        this.persistTimers.delete(code)
        this.dormant.delete(code)
        if (fromStore && this.store) this.track(this.store.delete(code), `delete ${code}`)
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
