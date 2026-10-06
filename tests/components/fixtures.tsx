import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { I18nContext, makeTranslator } from '@/i18n/I18nProvider'
import { DEFAULT_SETTINGS } from '@shared/types'
import type { ChatMessage, GameRound, Player, Room } from '@shared/types'

/** Tradutor em português: os testes montam o texto esperado pelas mesmas chaves do app. */
export const tr = makeTranslator('pt-BR')

// `wrapper` (e não um Provider em volta do `ui`) para o `rerender` manter o idioma e o estado.
function PtProvider({ children }: { children: ReactNode }) {
    return <I18nContext.Provider value={tr}>{children}</I18nContext.Provider>
}

export function renderPt(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
    return render(ui, { wrapper: PtProvider, ...options })
}

export function player(id: string, nickname: string, colorIndex: number, extra: Partial<Player> = {}): Player {
    return {
        id, nickname, score: 0, isHost: false, isConnected: true, colorIndex,
        hasGuessed: false, isReady: false, disconnectedAt: null, team: (colorIndex % 2) as 0 | 1, ...extra,
    }
}

export const ana = player('p1', 'Ana', 0, { isHost: true })
export const bia = player('p2', 'Bia', 1)
export const caio = player('p3', 'Caio', 2)
export const players = [ana, bia, caio]

export const card = { id: 34, pack: 'classic' as const, leftConcept: 'Comida de criança', rightConcept: 'Comida de adulto' }

export function round(phase: GameRound['phase'], extra: Partial<GameRound> = {}): GameRound {
    return {
        roundNumber: 4, seerId: 'p1', spectrumCard: card, targetPosition: 62, clue: null, phase,
        guesses: {}, scores: {}, zones: {}, closestIds: [], startedAt: 1000, clueAt: null, revealedAt: null,
        teamPlay: null, roster: [], ...extra,
    }
}

export function room(status: Room['status'], currentRound: GameRound | null, extra: Partial<Room> = {}): Room {
    return {
        code: 'K7PX2Q', players, status, settings: { ...DEFAULT_SETTINGS }, currentRound, roundHistory: [],
        skippedRounds: [], seerOrder: players.map(p => p.id), currentSeerIndex: 0, usedCardIds: [], winnerId: null,
        nextRoundAt: null, createdAt: 0, teamScores: [0, 0], teamSeerIndex: [0, 0], nextTeam: 0, winnerTeam: null,
        chat: [], ...extra,
    }
}

export const ok = async () => ({ success: true as const })

export function say(i: number, p: Player, text: string): ChatMessage {
    return { id: `m${i}`, at: i, kind: 'text', authorId: p.id, author: p.nickname, colorIndex: p.colorIndex, text }
}
