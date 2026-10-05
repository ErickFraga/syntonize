// Custom cards: pairs typed by the host in the lobby. Pure helpers used by
// the server (sanitizing what a client sends) and the lobby (parsing the
// textarea and showing why a line was refused).

import type { CustomCard, SpectrumCard } from './types.ts'
import { CUSTOM_PACK, LIMITS } from './types.ts'

/** Collapses whitespace and drops control characters. */
export function normalizeCustomText(raw: unknown): string {
    if (typeof raw !== 'string') return ''
    // eslint-disable-next-line no-control-regex
    return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Same card whatever the case, spacing or side order ("Quente | Frio" = "frio|quente"). */
export function customCardKey(card: CustomCard): string {
    return [card.left, card.right].map(s => normalizeCustomText(s).toLocaleLowerCase()).sort().join('\n')
}

export type CustomCardProblem = 'format' | 'length' | 'same_sides' | 'duplicate' | 'limit'

/** Why one side-normalized pair cannot be a card (null when it is fine). */
function problemOf(card: CustomCard): CustomCardProblem | null {
    for (const side of [card.left, card.right]) {
        if (side.includes(LIMITS.CUSTOM_CARD_SEPARATOR)) return 'format'
        const length = Array.from(side).length
        if (length < LIMITS.CUSTOM_CARD_TEXT_MIN || length > LIMITS.CUSTOM_CARD_TEXT_MAX) return 'length'
    }
    if (card.left.toLocaleLowerCase() === card.right.toLocaleLowerCase()) return 'same_sides'
    return null
}

/**
 * Untrusted list from a client: keeps the valid pairs, normalized, without
 * duplicates and up to LIMITS.CUSTOM_CARDS_MAX. Returns null when the input
 * is not a list at all.
 */
export function sanitizeCustomCards(raw: unknown): CustomCard[] | null {
    if (!Array.isArray(raw)) return null
    const cards: CustomCard[] = []
    const seen = new Set<string>()
    for (const item of raw) {
        if (cards.length >= LIMITS.CUSTOM_CARDS_MAX) break
        if (!item || typeof item !== 'object') continue
        const { left, right } = item as Record<string, unknown>
        const card = { left: normalizeCustomText(left), right: normalizeCustomText(right) }
        if (problemOf(card)) continue
        const key = customCardKey(card)
        if (seen.has(key)) continue
        seen.add(key)
        cards.push(card)
    }
    return cards
}

export interface ParsedCustomCards {
    /** Pairs to append to the current list. */
    added: CustomCard[]
    /** Refused lines (1-based line number in the text) and why. */
    rejected: Array<{ line: number; text: string; problem: CustomCardProblem }>
}

/**
 * Parses the lobby textarea: one pair per line, "left | right". Blank lines
 * are skipped; `existing` counts towards duplicates and the limit.
 */
export function parseCustomCardLines(text: string, existing: readonly CustomCard[] = []): ParsedCustomCards {
    const result: ParsedCustomCards = { added: [], rejected: [] }
    const seen = new Set(existing.map(customCardKey))
    text.split(/\r?\n/).forEach((rawLine, index) => {
        const line = normalizeCustomText(rawLine)
        if (!line) return
        const reject = (problem: CustomCardProblem) => result.rejected.push({ line: index + 1, text: line, problem })
        const parts = line.split(LIMITS.CUSTOM_CARD_SEPARATOR)
        if (parts.length !== 2) return reject('format')
        const card = { left: normalizeCustomText(parts[0]), right: normalizeCustomText(parts[1]) }
        const problem = problemOf(card)
        if (problem) return reject(problem)
        const key = customCardKey(card)
        if (seen.has(key)) return reject('duplicate')
        if (existing.length + result.added.length >= LIMITS.CUSTOM_CARDS_MAX) return reject('limit')
        seen.add(key)
        result.added.push(card)
    })
    return result
}

/** The textarea format of a list (copy it to share or reuse the cards). */
export function formatCustomCards(cards: readonly CustomCard[]): string {
    return cards.map(c => `${c.left} ${LIMITS.CUSTOM_CARD_SEPARATOR} ${c.right}`).join('\n')
}

/** Custom card id: negative, so it never collides with the printed deck. */
export function customCardId(index: number): number {
    return -(index + 1)
}

/** Custom pairs as spectrum cards (pack `custom`, ids -1, -2...). */
export function customDeck(cards: readonly CustomCard[]): SpectrumCard[] {
    return cards.map((c, index) => ({ id: customCardId(index), pack: CUSTOM_PACK, leftConcept: c.left, rightConcept: c.right }))
}
