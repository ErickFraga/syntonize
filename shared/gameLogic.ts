// Game Logic - Shared between client and server

import { Room, Player, GameRound, SpectrumCard, SCORING } from './types'

// ============================================
// SPECTRUM CARDS - Full collection
// ============================================

export const spectrumCards: SpectrumCard[] = [
    { id: 1, leftConcept: "Quente", rightConcept: "Frio" },
    { id: 2, leftConcept: "Bom", rightConcept: "Ruim" },
    { id: 3, leftConcept: "Famoso", rightConcept: "Desconhecido" },
    { id: 4, leftConcept: "Saudável", rightConcept: "Não saudável" },
    { id: 5, leftConcept: "Redondo", rightConcept: "Pontudo" },
    { id: 6, leftConcept: "Normal", rightConcept: "Estranho" },
    { id: 7, leftConcept: "Útil", rightConcept: "Inútil" },
    { id: 8, leftConcept: "Barato", rightConcept: "Caro" },
    { id: 9, leftConcept: "Lento", rightConcept: "Rápido" },
    { id: 10, leftConcept: "Pequeno", rightConcept: "Grande" },
    { id: 11, leftConcept: "Leve", rightConcept: "Pesado" },
    { id: 12, leftConcept: "Suave", rightConcept: "Áspero" },
    { id: 13, leftConcept: "Silencioso", rightConcept: "Barulhento" },
    { id: 14, leftConcept: "Simples", rightConcept: "Complexo" },
    { id: 15, leftConcept: "Velho", rightConcept: "Novo" },
    { id: 16, leftConcept: "Seguro", rightConcept: "Perigoso" },
    { id: 17, leftConcept: "Limpo", rightConcept: "Sujo" },
    { id: 18, leftConcept: "Bonito", rightConcept: "Feio" },
    { id: 19, leftConcept: "Fácil", rightConcept: "Difícil" },
    { id: 20, leftConcept: "Divertido", rightConcept: "Chato" },
    { id: 21, leftConcept: "Doce", rightConcept: "Amargo" },
    { id: 22, leftConcept: "Molhado", rightConcept: "Seco" },
    { id: 23, leftConcept: "Macio", rightConcept: "Duro" },
    { id: 24, leftConcept: "Alto", rightConcept: "Baixo" },
    { id: 25, leftConcept: "Largo", rightConcept: "Estreito" },
    { id: 26, leftConcept: "Grosso", rightConcept: "Fino" },
    { id: 27, leftConcept: "Forte", rightConcept: "Fraco" },
    { id: 28, leftConcept: "Rico", rightConcept: "Pobre" },
    { id: 29, leftConcept: "Calmo", rightConcept: "Agitado" },
    { id: 30, leftConcept: "Inteligente", rightConcept: "Burro" },
    { id: 31, leftConcept: "Corajoso", rightConcept: "Covarde" },
    { id: 32, leftConcept: "Honesto", rightConcept: "Desonesto" },
    { id: 33, leftConcept: "Generoso", rightConcept: "Egoísta" },
    { id: 34, leftConcept: "Paciente", rightConcept: "Impaciente" },
    { id: 35, leftConcept: "Otimista", rightConcept: "Pessimista" },
    { id: 36, leftConcept: "Extrovertido", rightConcept: "Introvertido" },
    { id: 37, leftConcept: "Moderno", rightConcept: "Antigo" },
    { id: 38, leftConcept: "Civilizado", rightConcept: "Selvagem" },
    { id: 39, leftConcept: "Urbano", rightConcept: "Rural" },
    { id: 40, leftConcept: "Natural", rightConcept: "Artificial" },
]

// ============================================
// RANDOM GENERATORS
// ============================================

export function getRandomCard(): SpectrumCard {
    return spectrumCards[Math.floor(Math.random() * spectrumCards.length)]
}

export function getRandomTarget(): number {
    // Returns value between 10-90 to avoid edge positions
    return Math.floor(Math.random() * 81) + 10
}

// Generate unique room code with collision check
export function generateRoomCode(existingCodes: Set<string>): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code: string
    let attempts = 0
    const maxAttempts = 100

    do {
        code = ''
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length))
        }
        attempts++
    } while (existingCodes.has(code) && attempts < maxAttempts)

    if (attempts >= maxAttempts) {
        // Fallback: use timestamp-based code
        const timestamp = Date.now().toString(36).toUpperCase()
        code = timestamp.slice(-6).padStart(6, '0')
    }

    return code
}

// ============================================
// SCORING FUNCTIONS
// ============================================

export function calculateScore(guess: number, target: number): number {
    const distance = Math.abs(guess - target)

    if (distance <= SCORING.BULLSEYE_RANGE) {
        return SCORING.BULLSEYE_POINTS
    } else if (distance <= SCORING.CLOSE_RANGE) {
        return SCORING.CLOSE_POINTS
    } else if (distance <= SCORING.ACCEPTABLE_RANGE) {
        return SCORING.ACCEPTABLE_POINTS
    }
    return SCORING.MISS_POINTS
}

export function calculateSeerBonus(guesses: Record<string, number>, target: number, seerId: string): number {
    const otherGuesses = Object.entries(guesses)
        .filter(([playerId]) => playerId !== seerId)
        .map(([, position]) => position)

    if (otherGuesses.length === 0) return 0

    let totalBonus = 0
    for (const guess of otherGuesses) {
        const distance = Math.abs(guess - target)
        if (distance <= SCORING.BULLSEYE_RANGE) {
            totalBonus += SCORING.SEER_BULLSEYE_BONUS
        } else if (distance <= SCORING.CLOSE_RANGE) {
            totalBonus += SCORING.SEER_CLOSE_BONUS
        } else if (distance <= SCORING.ACCEPTABLE_RANGE) {
            totalBonus += SCORING.SEER_ACCEPTABLE_BONUS
        }
    }

    return totalBonus
}

// ============================================
// ROOM MANAGEMENT
// ============================================

export function createRoom(hostId: string, hostNickname: string, code: string): Room {
    const host: Player = {
        id: hostId,
        nickname: hostNickname,
        score: 0,
        isHost: true,
        isConnected: true,
        guessPosition: null,
        hasGuessed: false
    }

    return {
        code,
        players: [host],
        status: 'waiting',
        currentRound: null,
        roundHistory: [],
        seerOrder: [hostId],
        currentSeerIndex: 0,
        targetScore: 100,
        maxRounds: 0, // 0 = unlimited
        timePerClue: 60,
        timePerGuess: 30,
        winnerId: null
    }
}

export function createPlayer(id: string, nickname: string): Player {
    return {
        id,
        nickname,
        score: 0,
        isHost: false,
        isConnected: true,
        guessPosition: null,
        hasGuessed: false
    }
}

export function addPlayerToRoom(room: Room, player: Player): void {
    room.players.push(player)
    room.seerOrder.push(player.id)
}

export function removePlayerFromRoom(room: Room, playerId: string): void {
    room.players = room.players.filter(p => p.id !== playerId)
    room.seerOrder = room.seerOrder.filter(id => id !== playerId)

    // Adjust seer index if needed
    if (room.currentSeerIndex >= room.seerOrder.length) {
        room.currentSeerIndex = 0
    }

    // If host left, assign new host
    if (!room.players.some(p => p.isHost) && room.players.length > 0) {
        room.players[0].isHost = true
    }
}

// ============================================
// ROUND MANAGEMENT
// ============================================

export function startNewRound(room: Room): GameRound {
    const seerId = room.seerOrder[room.currentSeerIndex]
    const card = getRandomCard()
    const target = getRandomTarget()

    // Reset player guesses
    room.players.forEach(p => {
        p.guessPosition = null
        p.hasGuessed = false
    })

    const round: GameRound = {
        roundNumber: room.roundHistory.length + 1,
        seerId,
        spectrumCard: card,
        targetPosition: target,
        clue: null,
        phase: 'waiting_clue',
        guesses: {},
        scores: {},
        startTime: null
    }

    room.currentRound = round
    room.status = 'playing'

    return round
}

export function processRoundResults(room: Room): void {
    const round = room.currentRound
    if (!round) return

    const target = round.targetPosition
    const guesses = round.guesses

    // Find best guesser for bonus
    let bestGuesserId: string | null = null
    let bestDistance = Infinity

    Object.entries(guesses).forEach(([playerId, position]) => {
        const distance = Math.abs(position - target)
        if (distance <= SCORING.ACCEPTABLE_RANGE && distance < bestDistance) {
            bestDistance = distance
            bestGuesserId = playerId
        }
    })

    // Calculate scores for each player
    Object.entries(guesses).forEach(([playerId, position]) => {
        let score = calculateScore(position, target)

        // Add first bonus
        if (playerId === bestGuesserId) {
            score += SCORING.FIRST_BONUS
        }

        round.scores[playerId] = score

        // Update player total score
        const player = room.players.find(p => p.id === playerId)
        if (player) {
            player.score += score
        }
    })

    // Calculate seer bonus
    const seerBonus = calculateSeerBonus(guesses, target, round.seerId)
    round.scores[round.seerId] = (round.scores[round.seerId] || 0) + seerBonus

    const seer = room.players.find(p => p.id === round.seerId)
    if (seer) {
        seer.score += seerBonus
    }

    round.phase = 'revealed'

    // Add to history
    room.roundHistory.push({ ...round })

    // Check for winner
    const winner = room.players.find(p => p.score >= room.targetScore)
    if (winner) {
        room.status = 'finished'
        room.winnerId = winner.id
    }

    // Move to next seer
    room.currentSeerIndex = (room.currentSeerIndex + 1) % room.seerOrder.length
}

export function allPlayersGuessed(room: Room): boolean {
    if (!room.currentRound) return false

    const guessers = room.players.filter(p => p.id !== room.currentRound?.seerId)
    return guessers.every(p => p.hasGuessed)
}

// ============================================
// VALIDATION HELPERS
// ============================================

export function canJoinRoom(room: Room, nickname: string): { ok: boolean; error?: string } {
    if (room.status !== 'waiting') {
        return { ok: false, error: 'Jogo já iniciado' }
    }

    if (room.players.length >= 20) {
        return { ok: false, error: 'Sala cheia' }
    }

    if (room.players.some(p => p.nickname.toLowerCase() === nickname.toLowerCase())) {
        return { ok: false, error: 'Nickname já em uso' }
    }

    return { ok: true }
}

export function canStartGame(room: Room): { ok: boolean; error?: string } {
    if (room.players.length < 2) {
        return { ok: false, error: 'Mínimo 2 jogadores para iniciar' }
    }

    return { ok: true }
}

export function resetGameState(room: Room): void {
    room.players.forEach(p => {
        p.score = 0
        p.guessPosition = null
        p.hasGuessed = false
    })
    room.roundHistory = []
    room.currentSeerIndex = 0
    room.winnerId = null
    room.currentRound = null
    room.status = 'waiting'
}
