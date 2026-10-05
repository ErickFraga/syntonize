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
    /** Team (only used in team mode, but always assigned so switching modes is instant). */
    team: TeamId
}

/** Team mode has exactly two teams: 0 and 1. */
export type TeamId = 0 | 1

export type GameMode = 'ffa' | 'teams'

/** Left/right call made by the opposing team in team mode. */
export type Side = 'left' | 'right'

// ============================================
// CARDS & ROUNDS
// ============================================

/** Themed card packs the host can mix. */
export const CARD_PACKS = ['classic', 'food', 'pop', 'people', 'spicy'] as const
export type CardPack = (typeof CARD_PACKS)[number]

/** Languages the deck is printed in (chosen by the host, independent of each player's UI). */
export const CARD_LOCALES = ['pt-BR', 'en', 'es'] as const
export type CardLocale = (typeof CARD_LOCALES)[number]

export interface SpectrumCard {
    /** Same id for the same card in every language. */
    id: number
    pack: CardPack
    leftConcept: string
    rightConcept: string
}

/** Raw deck of one language: [id, left, right] per card, grouped by pack. */
export type CardTextDeck = Record<CardPack, Array<[id: number, left: string, right: string]>>

/**
 * `side_guess` only exists in team mode: after the active team locks its
 * needle, the other team calls whether the target is left or right of it.
 */
export type RoundPhase = 'waiting_clue' | 'guessing' | 'side_guess' | 'revealed'

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
    /** Team-mode state of the round; null in free-for-all. */
    teamPlay: TeamRoundState | null
}

export interface TeamRoundState {
    /** Team whose turn it is (the seer belongs to it). */
    team: TeamId
    /**
     * Shared needle of the active team, moved live by any of its guessers.
     * Hidden (null) from the other team until it is locked.
     */
    needle: number | null
    /** Locked team guess (0-100), null until someone locks it. */
    guess: number | null
    lockedBy: string | null
    /** Opposing team's call: is the target left or right of the guess? */
    side: Side | null
    sideBy: string | null
    /** Filled on reveal. */
    zone: Zone | null
    /** Points earned this round by team 0 and team 1. */
    points: [number, number]
    /** Whether the side call was right (null when nobody called). */
    sideCorrect: boolean | null
    /** Bullseye while still behind: the same team plays again. */
    catchUp: boolean
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
    /** Free-for-all (default) or two teams, as in the original Wavelength. */
    mode: GameMode
    /** Team mode: a team that hits the bullseye while behind plays again. */
    catchUp: boolean
    /** Language of the cards, picked by the host for the whole room. */
    cardLocale: CardLocale
    /** Active card packs (at least one). */
    packs: CardPack[]
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
    /** Team mode: score of team 0 and team 1. */
    teamScores: [number, number]
    /** Team mode: next index in each team's seer rotation. */
    teamSeerIndex: [number, number]
    /** Team mode: team that plays the next round. */
    nextTeam: TeamId
    /** Team mode: winning team (null on a draw or in free-for-all). */
    winnerTeam: TeamId | null
}

// ============================================
// REALTIME PAYLOADS
// ============================================

export type TimerPhase = 'clue' | 'guess' | 'side' | 'next'

export interface TimerUpdate {
    phase: TimerPhase
    secondsLeft: number
    /** Server timestamp (ms) at which the timer ends. */
    endsAt: number
    serverTime: number
}

/**
 * Everything the server says to players is a code plus parameters; the
 * client translates it into the player's language (src/i18n).
 */
export const MESSAGE_CODES = [
    // validation and game errors
    'nickname_empty', 'nickname_too_long', 'nickname_taken', 'room_not_found', 'room_full',
    'game_already_finished', 'game_already_started', 'not_enough_players', 'team_needs_players',
    'clue_empty', 'clue_too_long', 'clue_uses_card_word', 'clue_already_given', 'not_the_seer', 'no_round',
    'not_guess_time', 'seer_cannot_guess', 'player_not_in_room', 'not_your_team_turn', 'invalid_guess',
    'guess_already_locked', 'not_side_time', 'side_is_other_team', 'invalid_side', 'side_already_called',
    'host_only_kick', 'player_not_found', 'cannot_kick_self', 'host_only_settings', 'settings_lobby_only',
    'host_only_move', 'teams_lobby_only', 'invalid_team', 'host_only_start', 'host_only_lobby',
    'needle_throttled', 'not_next_round_time', 'host_only_next', 'host_only_skip', 'skip_only_waiting_clue',
    'not_in_room', 'packs_empty',
    // room notices
    'player_joined', 'player_left', 'player_kicked', 'player_disconnected', 'new_host', 'back_to_lobby',
    'round_skipped_by_host', 'seer_left', 'seer_kicked', 'seer_disconnected', 'clue_timeout_skip',
    'not_enough_players_end',
] as const

export type MessageCode = (typeof MESSAGE_CODES)[number]
export type MessageParams = Record<string, string | number>

export interface Message {
    code: MessageCode
    params?: MessageParams
}

export interface Notice extends Message {
    kind: 'info' | 'success' | 'warning' | 'error'
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
    error?: Message
}

export interface SimpleResult {
    success: boolean
    error?: Message
}

// ============================================
// SOCKET EVENTS
// ============================================

export interface ServerToClientEvents {
    'room:state': (room: Room) => void
    'room:restored': (data: { room: Room; playerId: string }) => void
    'room:notice': (notice: Notice) => void
    'room:error': (message: Message) => void
    'room:kicked': () => void
    'game:roundStart': (roundNumber: number) => void
    'game:clueGiven': (clue: string) => void
    'game:reveal': (roundNumber: number) => void
    'game:finished': (winnerId: string | null) => void
    'game:timer': (timer: TimerUpdate) => void
    /** Team mode: live needle of the active team (sent only to that team). */
    'game:needle': (data: { position: number; by: string }) => void
}

export interface ClientToServerEvents {
    'room:create': (nickname: string, callback: (result: JoinResult) => void) => void
    'room:join': (code: string, nickname: string, callback: (result: JoinResult) => void) => void
    'room:info': (code: string, callback: (result: { success: boolean; info?: RoomInfo; error?: Message }) => void) => void
    'room:leave': () => void
    'room:kick': (playerId: string, callback: (result: SimpleResult) => void) => void
    'room:updateSettings': (settings: Partial<RoomSettings>, callback: (result: SimpleResult) => void) => void
    'room:setTeam': (playerId: string, team: TeamId, callback: (result: SimpleResult) => void) => void
    'game:start': (callback?: (result: SimpleResult) => void) => void
    'game:giveClue': (clue: string, callback?: (result: SimpleResult) => void) => void
    'game:submitGuess': (position: number, callback?: (result: SimpleResult) => void) => void
    'game:needleMove': (position: number) => void
    'game:sideGuess': (side: Side, callback?: (result: SimpleResult) => void) => void
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
    mode: 'ffa',
    catchUp: true,
    cardLocale: 'pt-BR',
    packs: ['classic'],
}

/** Default and allowed target scores in team mode (team points add up slower). */
export const TEAM_DEFAULT_TARGET = 10
export const TEAM_TARGET_OPTIONS = [7, 10, 13, 15] as const

export const TEAM_RULES = {
    /** Each team needs a seer and at least one guesser. */
    MIN_PER_TEAM: 2,
    /** Seconds the opposing team has to call left or right. */
    SIDE_GUESS_SECONDS: 30,
    /** Points for a correct left/right call. */
    SIDE_POINTS: 1,
    /** Minimum gap between two needle updates from the same player. */
    NEEDLE_THROTTLE_MS: 50,
} as const

/** Team colors, taken from the player palette (sky and orange: distinct lightness). */
export const TEAM_COLORS = ['#8CCBFF', '#FFBE7D'] as const

/** Numeric settings and their allowed values (free-for-all). */
export const SETTINGS_OPTIONS = {
    targetScore: [10, 15, 20, 30],
    maxRounds: [0, 6, 10, 16],
    timePerClue: [0, 60, 90, 120],
    timePerGuess: [30, 45, 60, 90],
    timeBetweenRounds: [10, 15, 20, 30],
} as const

export type NumericSetting = keyof typeof SETTINGS_OPTIONS

/** Allowed values of a numeric setting for a game mode. */
export function settingOptionsFor(mode: GameMode, key: NumericSetting): readonly number[] {
    if (key === 'targetScore' && mode === 'teams') return TEAM_TARGET_OPTIONS
    return SETTINGS_OPTIONS[key]
}

/** Colors assigned to players (index = Player.colorIndex). Pastéis da família
 *  do design: sempre com texto e contorno ameixa por cima. */
export const PLAYER_COLORS = [
    '#8CCBFF', // céu
    '#9BE8AE', // verde
    '#FFBE7D', // laranja
    '#FFA8C5', // rosa
    '#FFD96A', // amarelo
    '#D9C8F0', // lilás
    '#A9DDFF', // gelo
    '#FFC9A8', // pêssego
    '#B8F2E6', // menta
    '#C8B6FF', // lavanda
    '#F3F6A5', // limão
    '#FFB4A2', // coral
    '#9EE5D9', // água
    '#F8C8DC', // rosa claro
    '#EAD9A6', // areia
    '#B5C7FF', // pervinca
] as const
