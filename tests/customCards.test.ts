import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { customDeck, formatCustomCards, parseCustomCardLines, sanitizeCustomCards } from '../shared/customCards.ts'
import { deckFor, getCardById } from '../shared/cards/index.ts'
import { isDeckPlayable, pickCard, roomViewFor, sanitizeSettings, validateClue } from '../shared/gameLogic.ts'
import { CUSTOM_PACK, DEFAULT_SETTINGS, LIMITS, type CustomCard } from '../shared/types.ts'
import { makeHarness, makeRoom, startGame } from './helpers.ts'

const pairs = (n: number, prefix = 'Lado'): CustomCard[] =>
    Array.from({ length: n }, (_, i) => ({ left: `${prefix} A${i}`, right: `${prefix} B${i}` }))

const FIVE: CustomCard[] = [
    { left: 'Quente', right: 'Frio' },
    { left: 'Cachorro', right: 'Gato' },
    { left: 'Praia', right: 'Montanha' },
    { left: 'Segunda-feira', right: 'Sexta-feira' },
    { left: 'Café', right: 'Chá' },
]

describe('custom cards: sanitizing', () => {
    test('normalizes spaces, drops invalid sides and duplicates (case, spacing and side order)', () => {
        const cards = sanitizeCustomCards([
            { left: '  Quente  ', right: 'Frio\n' },
            { left: 'quente', right: 'FRIO' }, // duplicate (case)
            { left: 'Frio', right: 'Quente' }, // duplicate (sides swapped)
            { left: 'Muito   bom', right: 'Muito ruim' },
            { left: 'A', right: 'Bem longo' }, // too short
            { left: 'x'.repeat(LIMITS.CUSTOM_CARD_TEXT_MAX + 1), right: 'Ok' }, // too long
            { left: 'Com | barra', right: 'Sem barra' }, // separator inside
            { left: 'Igual', right: 'igual' }, // same on both sides
            { left: 42, right: 'Número' },
            'Quente | Frio',
            null,
        ])
        assert.deepEqual(cards, [
            { left: 'Quente', right: 'Frio' },
            { left: 'Muito bom', right: 'Muito ruim' },
        ])
        assert.equal(sanitizeCustomCards('nope'), null)
        assert.deepEqual(sanitizeCustomCards([]), [])
    })

    test('keeps at most CUSTOM_CARDS_MAX pairs; the length limits are inclusive', () => {
        assert.equal(sanitizeCustomCards(pairs(LIMITS.CUSTOM_CARDS_MAX + 10))!.length, LIMITS.CUSTOM_CARDS_MAX)
        const edge = { left: 'ab', right: 'y'.repeat(LIMITS.CUSTOM_CARD_TEXT_MAX) }
        assert.deepEqual(sanitizeCustomCards([edge]), [edge])
    })

    test('parses the textarea line by line and says why a line was refused', () => {
        const text = ['Quente | Frio', '', '  Cachorro|Gato  ', 'sem separador', 'a | b | c', 'X | Longe', 'quente | frio', 'Sol | sol'].join('\n')
        const parsed = parseCustomCardLines(text, [{ left: 'Praia', right: 'Montanha' }])
        assert.deepEqual(parsed.added, [{ left: 'Quente', right: 'Frio' }, { left: 'Cachorro', right: 'Gato' }])
        assert.deepEqual(parsed.rejected.map(r => [r.line, r.problem]), [[4, 'format'], [5, 'format'], [6, 'length'], [7, 'duplicate'], [8, 'same_sides']])
        assert.deepEqual(parseCustomCardLines('Praia | Montanha', [{ left: 'Praia', right: 'Montanha' }]).rejected[0].problem, 'duplicate')
    })

    test('the textarea refuses lines over the limit, and the list round-trips through the text format', () => {
        const parsed = parseCustomCardLines('Novo | Velho\nAlto | Baixo', pairs(LIMITS.CUSTOM_CARDS_MAX - 1))
        assert.equal(parsed.added.length, 1)
        assert.deepEqual(parsed.rejected.map(r => r.problem), ['limit'])
        assert.deepEqual(parseCustomCardLines(formatCustomCards(FIVE)).added, FIVE)
    })

    test('sanitizeSettings: custom cards go through, and every pack off needs at least 5 of them', () => {
        const withCards = sanitizeSettings({ customCards: [...FIVE, { left: 'Ok', right: 'Ok' }] }, DEFAULT_SETTINGS)
        assert.deepEqual(withCards.customCards, FIVE)
        assert.deepEqual(withCards.packs, ['classic'])

        const onlyCustom = sanitizeSettings({ packs: [] }, withCards)
        assert.deepEqual(onlyCustom.packs, [])
        assert.equal(isDeckPlayable(onlyCustom), true)

        // Below the minimum with no pack on: the change is ignored.
        assert.deepEqual(sanitizeSettings({ customCards: FIVE.slice(0, 4) }, onlyCustom).customCards, FIVE)
        assert.deepEqual(sanitizeSettings({ packs: [] }, DEFAULT_SETTINGS).packs, ['classic'])
        assert.deepEqual(sanitizeSettings({ packs: [], customCards: FIVE.slice(0, 4) }, DEFAULT_SETTINGS).packs, ['classic'])
        assert.deepEqual(sanitizeSettings({ customCards: 'Quente | Frio' as unknown as CustomCard[] }, withCards).customCards, FIVE)
    })
})

describe('custom cards: deck', () => {
    test('custom cards join the deck with negative ids and the custom pack', () => {
        const deck = deckFor('pt-BR', ['food'], FIVE)
        const custom = deck.filter(c => c.pack === CUSTOM_PACK)
        assert.equal(custom.length, 5)
        assert.deepEqual(custom.map(c => c.id), [-1, -2, -3, -4, -5])
        assert.equal(deck.length, deckFor('pt-BR', ['food']).length + 5)
        assert.ok(deckFor('pt-BR', ['classic', 'food', 'pop', 'people', 'spicy']).every(c => c.id > 0), 'printed ids are positive')
        assert.deepEqual(getCardById(-2, 'en', FIVE), { id: -2, pack: CUSTOM_PACK, leftConcept: 'Cachorro', rightConcept: 'Gato' })
        assert.equal(getCardById(-6, 'pt-BR', FIVE), undefined)
        assert.equal(getCardById(-1), undefined)
    })

    test('pickCard draws custom cards along with the packs, and only them when no pack is on', () => {
        let n = 0
        const rng = () => ((n++ * 0.37) % 1)
        const seen = new Set<string>()
        for (let i = 0; i < 300; i++) seen.add(String(pickCard([], rng, { cardLocale: 'pt-BR', packs: ['food'], customCards: FIVE }).pack))
        assert.deepEqual([...seen].sort(), [CUSTOM_PACK, 'food'].sort())

        const used: number[] = []
        for (let i = 0; i < 5; i++) {
            const card = pickCard(used, rng, { cardLocale: 'pt-BR', packs: [], customCards: FIVE })
            assert.equal(card.pack, CUSTOM_PACK)
            assert.ok(!used.includes(card.id), 'no repeats until the deck runs out')
            used.push(card.id)
        }
        // Exhausted: any custom card is fair game again.
        assert.equal(pickCard(used, rng, { cardLocale: 'pt-BR', packs: [], customCards: FIVE }).pack, CUSTOM_PACK)
    })

    test('the clue rule applies to the words of a custom card', () => {
        const [card] = customDeck([{ left: 'Pizza fria', right: 'Lasanha quente' }])
        assert.equal(validateClue('pizza de ontem', card).ok, false)
        assert.deepEqual(validateClue('LASANHA congelada', card).error, { code: 'clue_uses_card_word', params: { word: 'lasanha' } })
        assert.equal(validateClue('restos do jantar', card).ok, true)
    })
})

describe('custom cards: room', () => {
    test('only the host edits them, and the deck minimum is enforced with an explanation', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia'])
        const room = h.manager.getRoomOfPlayer(seats[0].id)!

        assert.equal(h.manager.updateSettings(seats[1].id, { customCards: FIVE }).success, false)
        assert.deepEqual(h.manager.updateSettings(seats[0].id, { packs: [], customCards: FIVE.slice(0, 4) }).error, { code: 'packs_empty', params: { min: 5 } })
        assert.deepEqual(room.settings.customCards, [])

        assert.equal(h.manager.updateSettings(seats[0].id, { customCards: FIVE }).success, true)
        assert.equal(h.manager.updateSettings(seats[0].id, { packs: [] }).success, true)
        assert.deepEqual(h.manager.updateSettings(seats[0].id, { customCards: FIVE.slice(1) }).error?.code, 'packs_empty')
        assert.equal(room.settings.customCards.length, 5)
        assert.equal(h.manager.updateSettings(seats[0].id, { packs: ['pop'] }).success, true)
        assert.equal(h.manager.updateSettings(seats[0].id, { customCards: [] }).success, true, 'with a pack on, the list can be emptied')
    })

    test('guests only see how many custom cards there are, the host sees them all', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia', 'Caio'])
        h.manager.updateSettings(seats[0].id, { customCards: FIVE })

        const hostView = h.transport.lastStateFor(seats[0].id)!
        assert.deepEqual(hostView.settings.customCards, FIVE)
        assert.equal(hostView.customCardCount, 5)

        for (const guest of seats.slice(1)) {
            const view = h.transport.lastStateFor(guest.id)!
            assert.deepEqual(view.settings.customCards, [])
            assert.equal(view.customCardCount, 5)
            assert.ok(!JSON.stringify(view).includes('Cachorro'), 'no custom text anywhere in the guest view')
        }

        // Still hidden during the game (the drawn card travels in the round, as usual).
        const room = startGame(h, seats[0].id)
        const view = roomViewFor(room, seats[1].id)
        assert.deepEqual(view.settings.customCards, [])
        assert.equal(view.customCardCount, 5)
        assert.deepEqual(roomViewFor(room, null).settings.customCards, [])
        assert.deepEqual(room.settings.customCards, FIVE, 'the view never mutates the room')
    })

    test('a whole game with only custom cards: every round draws one, the deck reshuffles, clues follow the rule', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia'])
        h.manager.updateSettings(seats[0].id, { customCards: FIVE })
        h.manager.updateSettings(seats[0].id, { packs: [], maxRounds: 10, targetScore: 30 })
        const room = startGame(h, seats[0].id)

        const drawn: number[] = []
        for (let i = 0; i < 10; i++) {
            const round = room.currentRound!
            assert.equal(round.spectrumCard.pack, CUSTOM_PACK)
            assert.deepEqual(getCardById(round.spectrumCard.id, room.settings.cardLocale, room.settings.customCards), round.spectrumCard)
            drawn.push(round.spectrumCard.id)

            const word = round.spectrumCard.leftConcept.split(/[\s-]/)[0]
            const refused = h.manager.giveClue(round.seerId, `${word} demais`)
            assert.equal(refused.success, false, `clue with "${word}" must be refused`)
            assert.equal(refused.error?.code, 'clue_uses_card_word')
            assert.equal(h.manager.giveClue(round.seerId, `rodada ${i}`).success, true)

            const guesser = seats.find(s => s.id !== round.seerId)!
            h.manager.submitGuess(guesser.id, 0) // a miss, so nobody reaches the target score early
            if (room.status === 'playing') h.manager.forceNextRound(seats[0].id)
        }

        assert.equal(room.status, 'finished')
        assert.equal(room.roundHistory.length, 10)
        assert.deepEqual([...new Set(drawn.slice(0, 5))].sort((a, b) => a - b), [-5, -4, -3, -2, -1], 'all five before any repeat')
        assert.deepEqual([...new Set(drawn.slice(5))].sort((a, b) => a - b), [-5, -4, -3, -2, -1], 'reshuffled after the deck ran out')
    })
})
