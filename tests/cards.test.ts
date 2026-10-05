import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { CARDS_BY_LOCALE, PACK_SIZES, deckFor, getCardById, spectrumCards } from '../shared/cards/index.ts'
import { pickCard, sanitizeSettings, validateClue, startNewRound, createRoom, createPlayer, addPlayerToRoom } from '../shared/gameLogic.ts'
import { CARD_LOCALES, CARD_PACKS, DEFAULT_SETTINGS, type SpectrumCard } from '../shared/types.ts'
import { makeHarness, makeRoom, startGame } from './helpers.ts'

const signature = (cards: SpectrumCard[]) => cards.map(c => `${c.id}:${c.pack}`)

describe('card decks', () => {
    test('every language has the same ids in the same packs', () => {
        const reference = signature(CARDS_BY_LOCALE['pt-BR'])
        for (const locale of CARD_LOCALES) {
            assert.deepEqual(signature(CARDS_BY_LOCALE[locale]), reference, `${locale} ids/packs`)
        }
    })

    test('the classic pack keeps the original 142 cards and every pack has at least 40', () => {
        assert.equal(PACK_SIZES.classic, 142)
        for (const pack of CARD_PACKS) {
            assert.ok(PACK_SIZES[pack] >= 40, `${pack} has ${PACK_SIZES[pack]} cards`)
            for (const locale of CARD_LOCALES) {
                assert.equal(deckFor(locale, [pack]).length, PACK_SIZES[pack])
            }
        }
        assert.equal(spectrumCards.length, Object.values(PACK_SIZES).reduce((a, b) => a + b, 0))
    })

    test('no duplicate ids, no empty or repeated texts', () => {
        for (const locale of CARD_LOCALES) {
            const cards = CARDS_BY_LOCALE[locale]
            assert.equal(new Set(cards.map(c => c.id)).size, cards.length, `${locale} duplicate id`)
            const pairs = new Set<string>()
            for (const c of cards) {
                assert.ok(c.leftConcept.trim() && c.rightConcept.trim(), `${locale} #${c.id} empty`)
                assert.notEqual(c.leftConcept.toLowerCase(), c.rightConcept.toLowerCase(), `${locale} #${c.id} same on both sides`)
                const key = [c.leftConcept, c.rightConcept].map(s => s.toLowerCase()).sort().join('|')
                assert.ok(!pairs.has(key), `${locale} #${c.id} repeats another card`)
                pairs.add(key)
            }
        }
    })

    test('cards are found by id in each language', () => {
        assert.equal(getCardById(19)!.rightConcept, 'Maneiro')
        assert.equal(getCardById(86, 'en')!.leftConcept, 'Red flag')
        assert.equal(getCardById(1001, 'es')!.pack, 'food')
        assert.equal(getCardById(99999), undefined)
    })
})

describe('pickCard', () => {
    test('draws only from the active packs, in the chosen language', () => {
        let n = 0
        const rng = () => ((n++ * 0.37) % 1)
        const es = new Set(deckFor('es', ['food', 'spicy']).map(c => c.leftConcept))
        for (let i = 0; i < 100; i++) {
            const card = pickCard([], rng, { cardLocale: 'es', packs: ['food', 'spicy'] })
            assert.ok(card.pack === 'food' || card.pack === 'spicy')
            assert.ok(es.has(card.leftConcept))
        }
    })

    test('does not repeat until the filtered deck runs out, then starts over', () => {
        const settings = { cardLocale: 'en' as const, packs: ['pop' as const] }
        const used: number[] = []
        for (let i = 0; i < PACK_SIZES.pop; i++) {
            const card = pickCard(used, Math.random, settings)
            assert.ok(!used.includes(card.id), 'repeated before the deck ran out')
            used.push(card.id)
        }
        assert.equal(new Set(used).size, PACK_SIZES.pop)
        assert.equal(pickCard(used, Math.random, settings).pack, 'pop', 'exhausted deck is reused')
    })

    test('startNewRound resets the used cards when the filtered deck is exhausted', () => {
        const room = createRoom('ABCDEF', createPlayer('a', 'Ana', 0, true))
        addPlayerToRoom(room, createPlayer('b', 'Bia', 1))
        room.settings = sanitizeSettings({ packs: ['people'] }, room.settings)
        const seen = new Set<number>()
        for (let i = 0; i < PACK_SIZES.people; i++) {
            startNewRound(room, 0, Math.random)
            seen.add(room.currentRound!.spectrumCard.id)
        }
        assert.equal(seen.size, PACK_SIZES.people, 'every card of the pack once')
        assert.deepEqual(room.usedCardIds, [], 'reset after a full pass')
        startNewRound(room, 0, Math.random)
        assert.equal(room.usedCardIds.length, 1)
    })
})

describe('sanitizeSettings: card language and packs', () => {
    test('defaults', () => {
        assert.equal(DEFAULT_SETTINGS.cardLocale, 'pt-BR')
        assert.deepEqual(DEFAULT_SETTINGS.packs, ['classic'])
    })

    test('known values are kept, unknown ignored, duplicates removed, empty refused', () => {
        let s = sanitizeSettings({ cardLocale: 'es' })
        assert.equal(s.cardLocale, 'es')
        s = sanitizeSettings({ cardLocale: 'fr' as never }, s)
        assert.equal(s.cardLocale, 'es')

        s = sanitizeSettings({ packs: ['spicy', 'food', 'food', 'nope' as never] }, s)
        assert.deepEqual(s.packs, ['food', 'spicy'])
        s = sanitizeSettings({ packs: [] }, s)
        assert.deepEqual(s.packs, ['food', 'spicy'], 'empty list refused')
        s = sanitizeSettings({ packs: ['nope' as never] }, s)
        assert.deepEqual(s.packs, ['food', 'spicy'], 'only unknown packs refused')
        s = sanitizeSettings({ packs: 'food' as never }, s)
        assert.deepEqual(s.packs, ['food', 'spicy'], 'not a list')
    })
})

describe('validateClue in every language', () => {
    const card = (left: string, right: string): SpectrumCard => ({ id: 1, pack: 'classic', leftConcept: left, rightConcept: right })

    test('english: card words are blocked, stop words are not', () => {
        const c = card('Bad first date', 'Great first date')
        assert.equal(validateClue('My first job', c, 'en').error?.code, 'clue_uses_card_word')
        assert.equal(validateClue('GREAT idea', c, 'en').error?.params?.word, 'great')
        assert.equal(validateClue('Movie night', c, 'en').ok, true)
        const way = card('Way too sweet', 'Way too bitter')
        assert.equal(validateClue('No way', way, 'en').ok, true, '"way" is a stop word in English')
    })

    test('spanish: accents and case do not matter, stop words are allowed', () => {
        const c = card('Canción para llorar', 'Canción para bailar')
        assert.equal(validateClue('una CANCION triste', c, 'es').error?.params?.word, 'cancion')
        assert.equal(validateClue('Para Elisa', c, 'es').ok, true, '"para" is a stop word in Spanish')
        assert.equal(validateClue('Bailando sola', c, 'es').ok, true)
        assert.equal(validateClue('Bailar pegados', c, 'es').ok, false)
    })
})

describe('room: host picks card language and packs', () => {
    test('the round draws a card of the chosen pack, in the chosen language', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia'])
        assert.equal(h.manager.updateSettings(seats[1].id, { cardLocale: 'en' }).success, false, 'host only')

        assert.equal(h.manager.updateSettings(seats[0].id, { cardLocale: 'en', packs: ['food'] }).success, true)
        const rejected = h.manager.updateSettings(seats[0].id, { packs: [] })
        assert.equal(rejected.success, false)
        assert.equal(rejected.error!.code, 'packs_empty')

        const room = startGame(h, seats[0].id)
        const card = room.currentRound!.spectrumCard
        assert.equal(card.pack, 'food')
        assert.deepEqual(card, deckFor('en', ['food']).find(c => c.id === card.id))
        assert.equal(h.manager.updateSettings(seats[0].id, { packs: ['classic'] }).success, false, 'lobby only')

        // The clue is checked against the English card.
        const word = card.leftConcept.split(' ').find(w => w.length > 3)!
        assert.equal(h.manager.giveClue(seats[0].id, word).success, false)
        assert.equal(h.manager.giveClue(seats[0].id, 'zzz').success, true)
    })
})
