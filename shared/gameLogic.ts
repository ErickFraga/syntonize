// Game logic - pure functions shared between client and server.
// Nothing in here talks to sockets or timers; the server orchestrates.

import type { Room, Player, GameRound, SpectrumCard, RoomSettings, Zone } from './types.ts'
import { SCORING, LIMITS, DEFAULT_SETTINGS, SETTINGS_OPTIONS, PLAYER_COLORS } from './types.ts'
import { spectrumCards } from './cards.ts'

// ============================================
// RANDOM HELPERS
// ============================================

export function pickCard(usedIds: number[], rng: () => number = Math.random): SpectrumCard {
    const unused = spectrumCards.filter(c => !usedIds.includes(c.id))
    const pool = unused.length > 0 ? unused : spectrumCards
    return pool[Math.floor(rng() * pool.length)]
}

export function getRandomTarget(rng: () => number = Math.random): number {
    const span = LIMITS.TARGET_MAX - LIMITS.TARGET_MIN
    return LIMITS.TARGET_MIN + Math.floor(rng() * (span + 1))
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateRoomCode(existingCodes: Set<string>, rng: () => number = Math.random): string {
    for (let attempt = 0; attempt < 100; attempt++) {
        let code = ''
        for (let i = 0; i < 6; i++) {
            code += CODE_CHARS.charAt(Math.floor(rng() * CODE_CHARS.length))
        }
        if (!existingCodes.has(code)) return code
    }
    // Practically unreachable: 32^6 combinations. Fallback keeps uniqueness.
    return Date.now().toString(36).toUpperCase().slice(-6).padStart(6, 'X')
}

// ============================================
// VALIDATION
// ============================================

export function normalizeNickname(raw: unknown): string {
    if (typeof raw !== 'string') return ''
    return raw.replace(/\s+/g, ' ').trim().slice(0, LIMITS.NICKNAME_MAX)
}

export function validateNickname(nickname: string): { ok: boolean; error?: string } {
    if (nickname.length < LIMITS.NICKNAME_MIN) return { ok: false, error: 'Digite um apelido' }
    if (nickname.length > LIMITS.NICKNAME_MAX) return { ok: false, error: `Apelido com no máximo ${LIMITS.NICKNAME_MAX} letras` }
    return { ok: true }
}

export function normalizeRoomCode(raw: unknown): string {
    if (typeof raw !== 'string') return ''
    return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

function stripAccents(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * The one real rule of the game: the clue cannot contain the words printed
 * on the card. We compare accent- and case-insensitively, word by word.
 */
export function validateClue(rawClue: unknown, card: SpectrumCard): { ok: boolean; clue: string; error?: string } {
    const clue = typeof rawClue === 'string' ? rawClue.replace(/\s+/g, ' ').trim() : ''
    if (!clue) return { ok: false, clue, error: 'A dica não pode ficar vazia' }
    if (clue.length > LIMITS.CLUE_MAX) return { ok: false, clue, error: `A dica pode ter no máximo ${LIMITS.CLUE_MAX} caracteres` }

    const clueWords = new Set(stripAccents(clue).split(/[^a-z0-9]+/).filter(w => w.length > 2))
    const forbidden = [card.leftConcept, card.rightConcept]
        .flatMap(c => stripAccents(c).split(/[^a-z0-9]+/))
        .filter(w => w.length > 2 && !STOP_WORDS.has(w))

    const hit = forbidden.find(w => clueWords.has(w))
    if (hit) return { ok: false, clue, error: `A dica não pode usar palavras da carta ("${hit}")` }

    return { ok: true, clue }
}

const STOP_WORDS = new Set(['para', 'com', 'que', 'nao', 'sem', 'dos', 'das', 'uma', 'por', 'mais', 'muito', 'todo', 'tem', 'faz', 'se', 'de', 'em'])

export function sanitizeSettings(partial: Partial<RoomSettings>, current: RoomSettings = DEFAULT_SETTINGS): RoomSettings {
    const next: RoomSettings = { ...current }
    for (const key of Object.keys(SETTINGS_OPTIONS) as Array<keyof RoomSettings>) {
        const value = partial[key]
        if (typeof value !== 'number' || !Number.isFinite(value)) continue
        const allowed = SETTINGS_OPTIONS[key] as readonly number[]
        if (allowed.includes(value)) next[key] = value
    }
    return next
}

// ============================================
// SCORING
// ============================================

export function zoneForDistance(distance: number): Zone {
    const d = Math.abs(distance)
    if (d <= SCORING.BULLSEYE_RANGE) return 4
    if (d <= SCORING.CLOSE_RANGE) return 3
    if (d <= SCORING.ACCEPTABLE_RANGE) return 2
    return 0
}

export function calculateScore(guess: number, target: number): number {
    return zoneForDistance(guess - target)
}

/**
 * Seer score: the rounded average of the guessers' base points.
 * A clue that puts everyone in the 4 earns 4; a clue nobody understood
 * earns 0. Keeps the seer's maximum in line with a guesser's.
 */
export function calculateSeerScore(zones: Zone[]): number {
    if (zones.length === 0) return 0
    const total = zones.reduce<number>((sum, z) => sum + z, 0)
    return Math.round(total / zones.length)
}

// ============================================
// ROOM & PLAYERS
// ============================================

export function nextColorIndex(players: Player[]): number {
    const used = new Set(players.map(p => p.colorIndex))
    for (let i = 0; i < PLAYER_COLORS.length; i++) {
        if (!used.has(i)) return i
    }
    return players.length % PLAYER_COLORS.length
}

export function createPlayer(id: string, nickname: string, colorIndex: number, isHost = false): Player {
    return {
        id,
        nickname,
        score: 0,
        isHost,
        isConnected: true,
        colorIndex,
        hasGuessed: false,
        isReady: false,
        disconnectedAt: null,
    }
}

export function createRoom(code: string, host: Player, now: number = Date.now()): Room {
    return {
        code,
        players: [host],
        status: 'waiting',
        settings: { ...DEFAULT_SETTINGS },
        currentRound: null,
        roundHistory: [],
        seerOrder: [host.id],
        currentSeerIndex: 0,
        usedCardIds: [],
        winnerId: null,
        nextRoundAt: null,
        createdAt: now,
    }
}

export function addPlayerToRoom(room: Room, player: Player): void {
    room.players.push(player)
    room.seerOrder.push(player.id)
}

export function removePlayerFromRoom(room: Room, playerId: string): void {
    const removedIndex = room.seerOrder.indexOf(playerId)
    room.players = room.players.filter(p => p.id !== playerId)
    room.seerOrder = room.seerOrder.filter(id => id !== playerId)

    // Keep the rotation pointing at the same "next" player.
    if (removedIndex !== -1 && removedIndex < room.currentSeerIndex) {
        room.currentSeerIndex -= 1
    }
    if (room.seerOrder.length === 0) {
        room.currentSeerIndex = 0
    } else {
        room.currentSeerIndex = room.currentSeerIndex % room.seerOrder.length
    }

    ensureHost(room)
}

/** Guarantees exactly one host, preferring a connected player. */
export function ensureHost(room: Room): Player | null {
    if (room.players.length === 0) return null
    const hosts = room.players.filter(p => p.isHost)
    if (hosts.length === 1 && hosts[0].isConnected) return hosts[0]

    room.players.forEach(p => { p.isHost = false })
    const candidate = room.players.find(p => p.isConnected) ?? room.players[0]
    candidate.isHost = true
    return candidate
}

export function canJoinRoom(room: Room, nickname: string): { ok: boolean; error?: string } {
    if (room.status === 'finished') {
        return { ok: false, error: 'Essa partida já terminou' }
    }
    if (room.players.length >= LIMITS.MAX_PLAYERS) {
        return { ok: false, error: `Sala cheia (máximo ${LIMITS.MAX_PLAYERS} jogadores)` }
    }
    if (room.players.some(p => p.nickname.toLowerCase() === nickname.toLowerCase())) {
        return { ok: false, error: 'Já existe alguém com esse apelido na sala' }
    }
    return { ok: true }
}

export function canStartGame(room: Room): { ok: boolean; error?: string } {
    const connected = room.players.filter(p => p.isConnected)
    if (connected.length < LIMITS.MIN_PLAYERS) {
        return { ok: false, error: `Precisa de pelo menos ${LIMITS.MIN_PLAYERS} jogadores conectados` }
    }
    return { ok: true }
}

// ============================================
// ROUNDS
// ============================================

export function getSeer(room: Room): Player | undefined {
    return room.currentRound ? room.players.find(p => p.id === room.currentRound!.seerId) : undefined
}

export function getGuessers(room: Room): Player[] {
    const seerId = room.currentRound?.seerId
    return room.players.filter(p => p.id !== seerId)
}

/**
 * Advances the rotation to the next connected player and returns their id.
 * Returns null when nobody is connected.
 */
export function pickNextSeer(room: Room): string | null {
    const n = room.seerOrder.length
    if (n === 0) return null
    for (let step = 0; step < n; step++) {
        const idx = (room.currentSeerIndex + step) % n
        const id = room.seerOrder[idx]
        const player = room.players.find(p => p.id === id)
        if (player && player.isConnected) {
            room.currentSeerIndex = idx
            return id
        }
    }
    return null
}

export function startNewRound(room: Room, now: number = Date.now(), rng: () => number = Math.random): GameRound | null {
    const seerId = pickNextSeer(room)
    if (!seerId) return null

    const card = pickCard(room.usedCardIds, rng)
    if (!room.usedCardIds.includes(card.id)) room.usedCardIds.push(card.id)
    if (room.usedCardIds.length >= spectrumCards.length) room.usedCardIds = []

    room.players.forEach(p => {
        p.hasGuessed = false
        p.isReady = false
    })

    const round: GameRound = {
        roundNumber: room.roundHistory.length + 1,
        seerId,
        spectrumCard: card,
        targetPosition: getRandomTarget(rng),
        clue: null,
        phase: 'waiting_clue',
        guesses: {},
        scores: {},
        zones: {},
        closestIds: [],
        startedAt: now,
        clueAt: null,
        revealedAt: null,
    }

    room.currentRound = round
    room.status = 'playing'
    room.nextRoundAt = null
    // Rotation moves on as soon as the round starts, so a seer who leaves
    // mid-round does not get picked again.
    room.currentSeerIndex = (room.currentSeerIndex + 1) % Math.max(1, room.seerOrder.length)
    return round
}

export function submitGuess(room: Room, playerId: string, position: number): { ok: boolean; error?: string } {
    const round = room.currentRound
    if (!round || round.phase !== 'guessing') return { ok: false, error: 'Não é hora de palpitar' }
    if (round.seerId === playerId) return { ok: false, error: 'O Vidente não dá palpite' }
    const player = room.players.find(p => p.id === playerId)
    if (!player) return { ok: false, error: 'Jogador não está na sala' }
    if (player.hasGuessed) return { ok: false, error: 'Você já travou seu palpite' }
    if (typeof position !== 'number' || !Number.isFinite(position)) return { ok: false, error: 'Palpite inválido' }

    const clamped = Math.round(Math.max(0, Math.min(100, position)))
    player.hasGuessed = true
    round.guesses[playerId] = clamped
    return { ok: true }
}

export function allGuessersDone(room: Room): boolean {
    const round = room.currentRound
    if (!round || round.phase !== 'guessing') return false
    const pending = getGuessers(room).filter(p => p.isConnected && !p.hasGuessed)
    return pending.length === 0
}

export function processRoundResults(room: Room, now: number = Date.now()): GameRound | null {
    const round = room.currentRound
    if (!round || round.phase === 'revealed') return null
    const target = round.targetPosition ?? 50

    let bestDistance = Infinity
    const zones: Zone[] = []

    for (const [playerId, position] of Object.entries(round.guesses)) {
        const distance = Math.abs(position - target)
        const zone = zoneForDistance(distance)
        round.zones[playerId] = zone
        round.scores[playerId] = zone
        zones.push(zone)
        if (zone > 0 && distance < bestDistance) bestDistance = distance
    }

    // Closest-guesser bonus only counts inside the wedge: missing the whole
    // target "by less than the others" is still a miss.
    round.closestIds = Object.entries(round.guesses)
        .filter(([, position]) => Math.abs(position - target) === bestDistance)
        .map(([playerId]) => playerId)

    for (const id of round.closestIds) {
        round.scores[id] += SCORING.CLOSEST_BONUS
    }

    round.scores[round.seerId] = calculateSeerScore(zones)

    for (const [playerId, points] of Object.entries(round.scores)) {
        const player = room.players.find(p => p.id === playerId)
        if (player) player.score += points
    }

    round.phase = 'revealed'
    round.revealedAt = now
    room.players.forEach(p => { p.isReady = false })
    room.roundHistory.push(round)
    room.nextRoundAt = now + room.settings.timeBetweenRounds * 1000

    const { targetScore, maxRounds } = room.settings
    const reachedScore = room.players.some(p => p.score >= targetScore)
    const reachedRounds = maxRounds > 0 && room.roundHistory.length >= maxRounds
    if (reachedScore || reachedRounds) {
        finishGame(room)
    }

    return round
}

export function finishGame(room: Room): void {
    room.status = 'finished'
    room.nextRoundAt = null
    const top = [...room.players].sort((a, b) => b.score - a.score)[0]
    room.winnerId = top ? top.id : null
}

export function allReady(room: Room): boolean {
    const connected = room.players.filter(p => p.isConnected)
    return connected.length > 0 && connected.every(p => p.isReady)
}

export function resetGameState(room: Room): void {
    room.players.forEach(p => {
        p.score = 0
        p.hasGuessed = false
        p.isReady = false
    })
    room.roundHistory = []
    room.usedCardIds = []
    room.currentSeerIndex = 0
    room.winnerId = null
    room.currentRound = null
    room.nextRoundAt = null
    room.status = 'waiting'
}

// ============================================
// CLIENT VIEW
// ============================================

/**
 * What a given player is allowed to see. The target is hidden from everyone
 * but the seer until the reveal, and so are the other players' guesses.
 */
export function roomViewFor(room: Room, viewerId: string | null): Room {
    const round = room.currentRound
    if (!round) return room

    const revealed = round.phase === 'revealed'
    const isSeer = viewerId === round.seerId

    const visibleRound: GameRound = {
        ...round,
        targetPosition: revealed || isSeer ? round.targetPosition : null,
        guesses: revealed
            ? round.guesses
            : viewerId && round.guesses[viewerId] !== undefined
                ? { [viewerId]: round.guesses[viewerId] }
                : {},
    }

    return { ...room, currentRound: visibleRound }
}

// ============================================
// STATS (for the results screen)
// ============================================

export interface PlayerStats {
    playerId: string
    bullseyes: number
    closest: number
    bestRound: number
    roundsAsSeer: number
    seerPoints: number
}

export function computeStats(room: Room): PlayerStats[] {
    return room.players.map(p => {
        const stats: PlayerStats = { playerId: p.id, bullseyes: 0, closest: 0, bestRound: 0, roundsAsSeer: 0, seerPoints: 0 }
        for (const r of room.roundHistory) {
            if (r.zones[p.id] === 4) stats.bullseyes++
            if (r.closestIds.includes(p.id)) stats.closest++
            if (r.seerId === p.id) {
                stats.roundsAsSeer++
                stats.seerPoints += r.scores[p.id] ?? 0
            }
            stats.bestRound = Math.max(stats.bestRound, r.scores[p.id] ?? 0)
        }
        return stats
    })
}
