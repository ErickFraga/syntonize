// Types for Syntonize game - shared between client and server

// ============================================
// PLAYERS
// ============================================

export interface Player {
    /** Stable id for the whole session (survives reconnects). */
    id: string
    nickname: string
    score: number
    isHost: boolean
    isConnected: boolean
    /** Index into the player palette, assigned on join and kept stable. */
    colorIndex: number
    /** Whether this player has locked a guess in the current round. */
    hasGuessed: boolean
    /** Whether this player pressed "ready" during the reveal phase. */
    isReady: boolean
    /** Unix ms of the last disconnect, null while connected. */
    disconnectedAt: number | null
}

// ============================================
// CARDS & ROUNDS
// ============================================

export interface SpectrumCard {
    id: number
    leftConcept: string
    rightConcept: string
}

export type RoundPhase = 'waiting_clue' | 'guessing' | 'revealed'

/** Points awarded by each wedge zone of the dial. */
export type Zone = 0 | 2 | 3 | 4

export interface GameRound {
    roundNumber: number
    seerId: string
    spectrumCard: SpectrumCard
    /**
     * Target 0-100. On the wire it is `null` for players who are not allowed
     * to see it yet (everyone except the seer until the reveal).
     */
    targetPosition: number | null
    clue: string | null
    phase: RoundPhase
    /** playerId -> locked position (0-100). Only sent once revealed. */
    guesses: Record<string, number>
    /** playerId -> points earned this round (guessers and seer). */
    scores: Record<string, number>
    /** playerId -> wedge zone hit (0, 2, 3 or 4). Guessers only. */
    zones: Record<string, Zone>
    /** Guessers who were closest to the target (bonus +1). */
    closestIds: string[]
    startedAt: number
    clueAt: number | null
    revealedAt: number | null
}

// ============================================
// ROOM
// ============================================

export interface RoomSettings {
    /** Points needed to win. */
    targetScore: number
    /** Game ends after this many rounds (0 = play until targetScore). */
    maxRounds: number
    /** Seconds the seer has to write a clue (0 = no limit). */
    timePerClue: number
    /** Seconds guessers have after the clue is given. */
    timePerGuess: number
    /** Seconds between the reveal and the next round (auto-advance). */
    timeBetweenRounds: number
}

export type RoomStatus = 'waiting' | 'playing' | 'finished'

export interface Room {
    code: string
    players: Player[]
    status: RoomStatus
    settings: RoomSettings
    currentRound: GameRound | null
    roundHistory: GameRound[]
    /** Player ids in seer rotation order. */
    seerOrder: string[]
    currentSeerIndex: number
    /** Card ids already played in this game (avoids repeats). */
    usedCardIds: number[]
    winnerId: string | null
    /** Server timestamp (ms) when the next round auto-starts, during reveal. */
    nextRoundAt: number | null
    createdAt: number
}

// ============================================
// REALTIME PAYLOADS
// ============================================

export type TimerPhase = 'clue' | 'guess' | 'next'

export interface TimerUpdate {
    phase: TimerPhase
    secondsLeft: number
    /** Server timestamp (ms) at which the timer ends. */
    endsAt: number
    serverTime: number
}

export interface Notice {
    kind: 'info' | 'success' | 'warning' | 'error'
    message: string
}

export interface RoomInfo {
    code: string
    hostName: string
    playerCount: number
    status: RoomStatus
}

export interface JoinResult {
    success: boolean
    code?: string
    playerId?: string
    sessionToken?: string
    error?: string
}

export interface SimpleResult {
    success: boolean
    error?: string
}

// ============================================
// SOCKET EVENTS
// ============================================

export interface ServerToClientEvents {
    'room:state': (room: Room) => void
    'room:restored': (data: { room: Room; playerId: string }) => void
    'room:notice': (notice: Notice) => void
    'room:error': (message: string) => void
    'room:kicked': () => void
    'game:roundStart': (roundNumber: number) => void
    'game:clueGiven': (clue: string) => void
    'game:reveal': (roundNumber: number) => void
    'game:finished': (winnerId: string | null) => void
    'game:timer': (timer: TimerUpdate) => void
}

export interface ClientToServerEvents {
    'room:create': (nickname: string, callback: (result: JoinResult) => void) => void
    'room:join': (code: string, nickname: string, callback: (result: JoinResult) => void) => void
    'room:info': (code: string, callback: (result: { success: boolean; info?: RoomInfo; error?: string }) => void) => void
    'room:leave': () => void
    'room:kick': (playerId: string, callback: (result: SimpleResult) => void) => void
    'room:updateSettings': (settings: Partial<RoomSettings>, callback: (result: SimpleResult) => void) => void
    'game:start': (callback?: (result: SimpleResult) => void) => void
    'game:giveClue': (clue: string, callback?: (result: SimpleResult) => void) => void
    'game:submitGuess': (position: number, callback?: (result: SimpleResult) => void) => void
    'game:ready': () => void
    'game:nextRound': () => void
    'game:skipRound': () => void
    'game:backToLobby': () => void
    'game:requestState': () => void
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Wedge layout, mirroring the physical dial: 2 | 3 | 4 | 3 | 2.
 * Distances are measured in dial units (0-100).
 */
export const SCORING = {
    BULLSEYE_RANGE: 3, // |d| <= 3  -> 4 points (center wedge, 7 units wide)
    CLOSE_RANGE: 8, // |d| <= 8  -> 3 points (5 units each side)
    ACCEPTABLE_RANGE: 13, // |d| <= 13 -> 2 points (5 units each side)
    BULLSEYE_POINTS: 4,
    CLOSE_POINTS: 3,
    ACCEPTABLE_POINTS: 2,
    MISS_POINTS: 0,
    /** Extra point for the guesser(s) closest to the target. */
    CLOSEST_BONUS: 1,
} as const

export const LIMITS = {
    MIN_PLAYERS: 2,
    MAX_PLAYERS: 16,
    NICKNAME_MIN: 1,
    NICKNAME_MAX: 16,
    CLUE_MAX: 60,
    /** Target is kept away from the edges so the whole wedge fits the dial. */
    TARGET_MIN: 14,
    TARGET_MAX: 86,
} as const

export const DEFAULT_SETTINGS: RoomSettings = {
    targetScore: 15,
    maxRounds: 0,
    timePerClue: 0,
    timePerGuess: 45,
    timeBetweenRounds: 15,
}

export const SETTINGS_OPTIONS = {
    targetScore: [10, 15, 20, 30],
    maxRounds: [0, 6, 10, 16],
    timePerClue: [0, 60, 90, 120],
    timePerGuess: [30, 45, 60, 90],
    timeBetweenRounds: [10, 15, 20, 30],
} as const

/** Colors assigned to players (index = Player.colorIndex). */
export const PLAYER_COLORS = [
    '#ff5d8f', // pink
    '#2ee6d6', // teal
    '#ffb347', // orange
    '#8f7bff', // violet
    '#5be37d', // green
    '#ff6b4a', // coral
    '#4cc9f0', // sky
    '#f9e547', // yellow
    '#c77dff', // lilac
    '#ff9ecd', // rose
    '#7bd389', // mint
    '#ffa0a0', // salmon
    '#6fa8ff', // blue
    '#e0c070', // sand
    '#a0e0ff', // ice
    '#ffd6a5', // peach
] as const
