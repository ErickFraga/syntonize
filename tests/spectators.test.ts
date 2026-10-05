import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { makeHarness, makeRoom, startGame } from './helpers.ts'
import { LIMITS } from '../shared/types.ts'
import { activePlayers, computeStats, roomViewFor } from '../shared/gameLogic.ts'

function watch(h: ReturnType<typeof makeHarness>, code: string, name: string) {
    const result = h.manager.joinRoom(code, name, true)
    if (!result.success || !result.data) throw new Error(result.error?.code)
    return result.data.playerId
}

describe('spectators', () => {
    test('a spectator joins the room but stays out of players, rotation and teams', () => {
        const h = makeHarness()
        const { code, seats } = makeRoom(h, ['Ana', 'Bia'])
        const watcherId = watch(h, code, 'Caio')
        const room = h.manager.getRoom(code)!

        assert.equal(room.players.length, 3)
        assert.equal(room.players.find(p => p.id === watcherId)!.isSpectator, true)
        assert.equal(activePlayers(room).length, 2)
        assert.deepEqual(room.seerOrder, seats.map(s => s.id))
        assert.deepEqual(h.manager.getRoomInfo(code).data!.playerCount, 2)
        assert.deepEqual(h.manager.getRoomInfo(code).data!.spectatorCount, 1)
    })

    test('spectators do not count toward the player limit, and have their own', () => {
        const h = makeHarness()
        const { code } = makeRoom(h, ['Ana'])
        for (let i = 1; i < LIMITS.MAX_PLAYERS; i++) assert.equal(h.manager.joinRoom(code, `P${i}`).success, true)
        assert.equal(h.manager.joinRoom(code, 'Extra').success, false, 'players are full')
        for (let i = 0; i < LIMITS.MAX_SPECTATORS; i++) assert.equal(h.manager.joinRoom(code, `W${i}`, true).success, true)
        const full = h.manager.joinRoom(code, 'WLate', true)
        assert.equal(full.success, false)
        assert.equal(full.error?.code, 'room_full_spectators')
    })

    test('a spectator does not help start the game', () => {
        const h = makeHarness()
        const { code, seats } = makeRoom(h, ['Ana'])
        watch(h, code, 'Caio')
        assert.equal(h.manager.startGame(seats[0].id).success, false, 'one player plus a spectator is not enough')
    })

    test('the game runs without waiting for the spectator, who cannot play', () => {
        const h = makeHarness()
        const { code, seats } = makeRoom(h, ['Ana', 'Bia'])
        const watcherId = watch(h, code, 'Caio')
        const room = startGame(h, seats[0].id)
        assert.equal(room.currentRound!.seerId, seats[0].id)

        assert.equal(h.manager.giveClue(seats[0].id, 'Pizza fria').success, true)
        const attempt = h.manager.submitGuess(watcherId, 30)
        assert.equal(attempt.success, false)
        assert.equal(attempt.error?.code, 'spectator_cannot_play')

        // Bia is the only guesser: her lock reveals the round with no one else pending.
        assert.equal(h.manager.submitGuess(seats[1].id, 50).success, true)
        assert.equal(room.currentRound!.phase, 'revealed')
        assert.equal(room.currentRound!.guesses[watcherId], undefined)
        assert.equal(h.manager.setReady(watcherId).error?.code, 'spectator_cannot_play')

        // Ana and Bia are ready: the next round starts without the spectator.
        h.manager.setReady(seats[0].id)
        h.manager.setReady(seats[1].id)
        assert.equal(room.currentRound!.roundNumber, 2)
        assert.equal(room.currentRound!.seerId, seats[1].id, 'rotation skips the spectator')
    })

    test('the spectator sees the round like a guesser: no target, no one else\'s guess', () => {
        const h = makeHarness()
        const { code, seats } = makeRoom(h, ['Ana', 'Bia'])
        const watcherId = watch(h, code, 'Caio')
        const room = startGame(h, seats[0].id)
        h.manager.giveClue(seats[0].id, 'Pizza fria')
        const view = roomViewFor(room, watcherId)
        assert.equal(view.currentRound!.targetPosition, null)
        assert.deepEqual(view.currentRound!.guesses, {})
        assert.ok(h.transport.lastStateFor(watcherId), 'receives state broadcasts')
    })

    test('the spectator can chat', () => {
        const h = makeHarness()
        const { code } = makeRoom(h, ['Ana', 'Bia'])
        const watcherId = watch(h, code, 'Caio')
        assert.equal(h.manager.sendChat(watcherId, { kind: 'text', text: 'boa!' }).success, true)
    })

    test('a spectator leaving or dropping mid-game changes nothing', () => {
        const h = makeHarness()
        const { code, seats } = makeRoom(h, ['Ana', 'Bia'])
        const watcherId = watch(h, code, 'Caio')
        const room = startGame(h, seats[0].id)
        h.manager.disconnect(watcherId)
        h.manager.leaveRoom(watcherId)
        assert.equal(room.status, 'playing')
        assert.equal(room.currentRound!.roundNumber, 1)
    })

    test('stats, winner and host ignore spectators', () => {
        const h = makeHarness()
        const { code, seats } = makeRoom(h, ['Ana', 'Bia'])
        const watcherId = watch(h, code, 'Caio')
        const room = startGame(h, seats[0].id)
        assert.equal(computeStats(room).some(s => s.playerId === watcherId), false)

        h.manager.leaveRoom(seats[0].id)
        assert.notEqual(room.players.find(p => p.isHost)?.id, watcherId, 'a spectator is never promoted to host')
    })

    test('a room left with only spectators is closed', () => {
        const h = makeHarness()
        const { code, seats } = makeRoom(h, ['Ana'])
        const watcherId = watch(h, code, 'Caio')
        h.manager.leaveRoom(seats[0].id)
        assert.equal(h.manager.getRoom(code), undefined)
        assert.equal(h.transport.playerEvents(watcherId, 'room:kicked').length, 1)
    })

    test('a spectator reconnects with the session token', () => {
        const h = makeHarness()
        const { code } = makeRoom(h, ['Ana', 'Bia'])
        const joined = h.manager.joinRoom(code, 'Caio', true)
        h.manager.disconnect(joined.data!.playerId)
        const restored = h.manager.restoreSession(joined.data!.sessionToken)
        assert.equal(restored?.playerId, joined.data!.playerId)
        assert.equal(h.manager.getPlayer(joined.data!.playerId)!.isSpectator, true)
    })
})
