import type { CardLocale, CardPack, CardTextDeck, SpectrumCard } from '../types.ts'
import { CARD_LOCALES, CARD_PACKS } from '../types.ts'
import { ptBRCards } from './pt-BR.ts'
import { enCards } from './en.ts'
import { esCards } from './es.ts'

/**
 * Spectrum cards, in the spirit of the physical SINTONIA / Wavelength deck.
 * The best cards are the ones where people disagree: a mix of objective
 * scales (quente/frio) and opinion scales (subestimado/superestimado).
 *
 * Every language has the same ids in the same packs, so a card is the same
 * card whatever language the room plays in.
 */
const SOURCES: Record<CardLocale, CardTextDeck> = { 'pt-BR': ptBRCards, en: enCards, es: esCards }

function flatten(deck: CardTextDeck): SpectrumCard[] {
    return CARD_PACKS.flatMap(pack => deck[pack].map(([id, leftConcept, rightConcept]) => ({ id, pack, leftConcept, rightConcept })))
}

export const CARDS_BY_LOCALE: Record<CardLocale, SpectrumCard[]> = Object.fromEntries(
    CARD_LOCALES.map(locale => [locale, flatten(SOURCES[locale])]),
) as Record<CardLocale, SpectrumCard[]>

/** The full pt-BR deck (every pack). */
export const spectrumCards: SpectrumCard[] = CARDS_BY_LOCALE['pt-BR']

/** Number of cards in each pack (the same in every language). */
export const PACK_SIZES: Record<CardPack, number> = Object.fromEntries(
    CARD_PACKS.map(pack => [pack, ptBRCards[pack].length]),
) as Record<CardPack, number>

/** Cards of the active packs, in the room's card language. */
export function deckFor(locale: CardLocale, packs: readonly CardPack[]): SpectrumCard[] {
    const cards = CARDS_BY_LOCALE[locale] ?? CARDS_BY_LOCALE['pt-BR']
    return cards.filter(c => packs.includes(c.pack))
}

export function getCardById(id: number, locale: CardLocale = 'pt-BR'): SpectrumCard | undefined {
    return (CARDS_BY_LOCALE[locale] ?? CARDS_BY_LOCALE['pt-BR']).find(c => c.id === id)
}
