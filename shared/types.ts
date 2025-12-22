// Types for Syntonize game - Shared between client and server

export interface Player {
    id: string
    nickname: string
    score: number
    isHost: boolean
    isConnected: boolean
    guessPosition: number | null
    hasGuessed: boolean
}

export interface SpectrumCard {
    id: number
    leftConcept: string
    rightConcept: string
}

export interface GameRound {
    roundNumber: number
    seerId: string
    spectrumCard: SpectrumCard
    targetPosition: number // 0-100
    clue: string | null
    phase: 'waiting_clue' | 'guessing' | 'revealed'
    guesses: Record<string, number> // playerId -> position
    scores: Record<string, number> // playerId -> score earned this round
    startTime: number | null
}

export interface Room {
    code: string
    players: Player[]
    status: 'waiting' | 'playing' | 'finished'
    currentRound: GameRound | null
    roundHistory: GameRound[]
    seerOrder: string[] // Player IDs in order
    currentSeerIndex: number
    targetScore: number
    maxRounds: number
    timePerClue: number // seconds
    timePerGuess: number // seconds
    winnerId: string | null
}

// Timer update with server timestamp for sync
export interface TimerUpdate {
    secondsLeft: number
    serverTime: number
    phase: 'clue' | 'guess'
}

// Socket.io event types
export interface ServerToClientEvents {
    'room:state': (room: Room) => void
    'room:playerJoined': (player: Player) => void
    'room:playerLeft': (playerId: string) => void
    'room:error': (message: string) => void
    'game:roundStart': (round: GameRound) => void
    'game:clueGiven': (clue: string) => void
    'game:playerGuessed': (playerId: string) => void
    'game:roundResult': (round: GameRound) => void
    'game:finished': (room: Room) => void
    'game:timerUpdate': (timer: TimerUpdate) => void
}

export interface ClientToServerEvents {
    'room:create': (nickname: string, callback: (result: { success: boolean; code?: string; error?: string }) => void) => void
    'room:join': (code: string, nickname: string, callback: (result: { success: boolean; error?: string }) => void) => void
    'room:leave': () => void
    'room:rejoin': (code: string, callback: (result: { success: boolean; error?: string }) => void) => void
    'game:start': () => void
    'game:giveClue': (clue: string) => void
    'game:submitGuess': (position: number) => void
    'game:requestState': () => void
}

// Scoring constants
export const SCORING = {
    BULLSEYE_RANGE: 5, // ±5 from target
    CLOSE_RANGE: 10, // ±10 from target
    ACCEPTABLE_RANGE: 20, // ±20 from target
    BULLSEYE_POINTS: 4,
    CLOSE_POINTS: 3,
    ACCEPTABLE_POINTS: 2,
    MISS_POINTS: 0,
    FIRST_BONUS: 1,
    SEER_BULLSEYE_BONUS: 2,
    SEER_CLOSE_BONUS: 1,
    SEER_ACCEPTABLE_BONUS: 1, // Changed from 0.5 to avoid Math.floor issues
} as const
