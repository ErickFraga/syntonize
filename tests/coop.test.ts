import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { makeHarness, makeRoom, startGame, type Harness, type Seat } from './helpers.ts'
import { COOP_DEFAULT_ROUNDS, COOP_DEFAULT_TARGET, DEFAULT_SETTINGS, type Room } from '../shared/types.ts'
import { roomViewFor } from '../shared/gameLogic.ts'

// Com fixedRng o alvo é sempre 50 (veja helpers.ts).

function setup(names = ['Ana', 'Bia', 'Caio']): { h: Harness; code: string; seats: Seat[]; ids: string[] } {
    const h = makeHarness()
    const { code, seats } = makeRoom(h, names)
    assert.equal(h.manager.updateSettings(seats[0].id, { mode: 'coop' }).success, true)
    return { h, code, seats, ids: seats.map(s => s.id) }
}

/** Vidente dá a dica e um dos outros trava `guess`; o grupo todo é um time só, sem chute de lado. */
function playRound(h: Harness, room: Room, guess: number): void {
    const round = room.currentRound!
    assert.equal(h.manager.giveClue(round.seerId, 'dica').success, true)
    const guesser = room.players.find(p => p.id !== round.seerId)!
    assert.equal(h.manager.submitGuess(guesser.id, guess).success, true)
    assert.equal(round.phase, 'revealed', 'sem fase de esquerda/direita')
}

describe('coop: lobby', () => {
    test('modo cooperativo fixa 7 rodadas e meta 14; sair dele devolve o padrão', () => {
        const { h, ids } = setup()
        const room = h.manager.getRoomOfPlayer(ids[0])!
        assert.equal(room.settings.mode, 'coop')
        assert.equal(room.settings.targetScore, COOP_DEFAULT_TARGET)
        assert.equal(room.settings.maxRounds, COOP_DEFAULT_ROUNDS)

        h.manager.updateSettings(ids[0], { maxRounds: 10, targetScore: 22 })
        assert.equal(room.settings.maxRounds, 10)
        assert.equal(room.settings.targetScore, 22)
        h.manager.updateSettings(ids[0], { maxRounds: 0 })
        assert.equal(room.settings.maxRounds, 10, 'ilimitado não existe no cooperativo')
        h.manager.updateSettings(ids[0], { targetScore: 15 })
        assert.equal(room.settings.targetScore, 22, '15 não é uma meta do cooperativo')

        h.manager.updateSettings(ids[0], { mode: 'ffa' })
        assert.equal(room.settings.maxRounds, DEFAULT_SETTINGS.maxRounds)
        assert.equal(room.settings.targetScore, DEFAULT_SETTINGS.targetScore)
    })

    test('começa com dois jogadores, independentemente do time de cada um', () => {
        const { h, ids } = setup(['Ana', 'Bia'])
        const room = h.manager.getRoomOfPlayer(ids[0])!
        assert.notEqual(room.players[0].team, room.players[1].team)
        assert.equal(h.manager.startGame(ids[0]).success, true)
        assert.equal(room.currentRound!.teamPlay!.team, 0)
    })
})

describe('coop: rodadas', () => {
    test('o Vidente roda entre todos e qualquer um dos outros palpita', () => {
        const { h, ids } = setup()
        const room = startGame(h, ids[0])
        const seers: string[] = []
        for (let i = 0; i < 4; i++) {
            seers.push(room.currentRound!.seerId)
            assert.equal(room.currentRound!.teamPlay!.team, 0)
            playRound(h, room, 50)
            h.manager.forceNextRound(ids[0])
        }
        assert.deepEqual(seers, [ids[0], ids[1], ids[2], ids[0]])
    })

    test('ponteiro compartilhado chega a todos, inclusive quem estava em outro "time"', () => {
        const { h, ids } = setup(['Ana', 'Bia', 'Caio', 'Duda'])
        const [ana, bia, caio, duda] = ids
        const room = startGame(h, ana)
        h.manager.giveClue(ana, 'dica')
        h.transport.clear()
        assert.equal(h.manager.moveNeedle(bia, 30).success, true)
        for (const id of [ana, caio, duda]) assert.equal(h.transport.playerEvents(id, 'game:needle').length, 1)
        assert.equal(roomViewFor(room, duda).currentRound!.teamPlay!.needle, 30, 'todos veem o ponteiro')
        assert.equal(h.manager.moveNeedle(ana, 10).success, false, 'o Vidente não mexe')
    })

    test('a pontuação do grupo soma só a zona do ponteiro e não há revanche', () => {
        const { h, ids } = setup()
        const room = startGame(h, ids[0])
        playRound(h, room, 50) // mosca: 4
        assert.deepEqual(room.teamScores, [4, 0])
        assert.deepEqual(room.currentRound!.teamPlay!.points, [4, 0])
        assert.equal(room.currentRound!.teamPlay!.catchUp, false)
        assert.equal(room.currentRound!.teamPlay!.sideCorrect, null)
        h.manager.forceNextRound(ids[0])
        playRound(h, room, 58) // |8| → 3
        assert.deepEqual(room.teamScores, [7, 0])
        assert.equal(room.nextTeam, 0)
    })

    test('o tempo do palpite trava o ponteiro e revela direto', () => {
        const { h, ids } = setup()
        const room = startGame(h, ids[0])
        h.manager.giveClue(ids[0], 'dica')
        h.manager.moveNeedle(ids[1], 47)
        h.clock.advance(DEFAULT_SETTINGS.timePerGuess * 1000)
        assert.equal(room.currentRound!.phase, 'revealed')
        assert.equal(room.currentRound!.teamPlay!.guess, 47)
    })
})

describe('coop: fim de jogo', () => {
    function playAll(h: Harness, ids: string[], guess: number): Room {
        const room = startGame(h, ids[0])
        for (let i = 0; i < COOP_DEFAULT_ROUNDS; i++) {
            assert.equal(room.status, 'playing', `rodada ${i + 1} ainda em jogo`)
            playRound(h, room, guess)
            if (i < COOP_DEFAULT_ROUNDS - 1) h.manager.forceNextRound(ids[0])
        }
        return room
    }

    test('joga as 7 rodadas e o grupo vence batendo a meta', () => {
        const { h, ids } = setup()
        const room = playAll(h, ids, 50) // 7 x 4 = 28
        assert.equal(room.status, 'finished')
        assert.equal(room.teamScores[0], 28)
        assert.equal(room.winnerTeam, 0)
        assert.equal(room.winnerId, null)
        const chat = room.chat.find(m => m.kind === 'system' && m.code === 'game_finished')
        assert.deepEqual(chat && chat.kind === 'system' && chat.params, { won: 1 })
    })

    test('não termina antes das 7 rodadas mesmo passando da meta', () => {
        const { h, ids } = setup()
        const room = startGame(h, ids[0])
        for (let i = 0; i < 4; i++) { // 16 pontos ≥ meta 14 na rodada 4
            playRound(h, room, 50)
            if (i < 3) h.manager.forceNextRound(ids[0])
        }
        assert.equal(room.teamScores[0], 16)
        assert.equal(room.status, 'playing')
    })

    test('errando tudo o grupo perde', () => {
        const { h, ids } = setup()
        const room = playAll(h, ids, 0)
        assert.equal(room.status, 'finished')
        assert.equal(room.teamScores[0], 0)
        assert.equal(room.winnerTeam, null)
        const chat = room.chat.find(m => m.kind === 'system' && m.code === 'game_finished')
        assert.deepEqual(chat && chat.kind === 'system' && chat.params, { won: 0 })
    })

    test('fica só uma pessoa: a partida acaba', () => {
        const { h, ids } = setup(['Ana', 'Bia'])
        const room = startGame(h, ids[0])
        h.manager.leaveRoom(ids[1])
        assert.equal(room.status, 'finished')
    })
})
