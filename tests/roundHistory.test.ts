import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { makeHarness, makeRoom, startGame, type Harness } from './helpers.ts'
import { LIMITS, TEAM_RULES, type Room, type GameRound, type RoundHistory } from '../shared/types.ts'
import { roomViewFor, historyViewFor } from '../shared/gameLogic.ts'

// With fixedRng the target is always 50 (see helpers.ts).
const TARGET = 50

function ffa(names = ['Ana', 'Bia', 'Caio']) {
    const h = makeHarness()
    const { code, seats } = makeRoom(h, names)
    const ids = seats.map(s => s.id)
    const room = startGame(h, ids[0])
    return { h, code, ids, room }
}

/** Last `game:history` a player got, broadcast to the room or sent to them alone. */
function lastHistoryFor(h: Harness, code: string, playerId: string): RoundHistory | undefined {
    const events = h.transport.events.filter(e => e.event === 'game:history'
        && ((e.target.kind === 'room' && e.target.code === code) || (e.target.kind === 'player' && e.target.id === playerId)))
    return events.at(-1)?.args[0] as RoundHistory | undefined
}

/** Free-for-all round: the seer gives a clue and every guesser locks `guesses[i]`. */
function playFfaRound(h: Harness, room: Room, guesses: Record<string, number>): GameRound {
    const round = room.currentRound!
    assert.equal(h.manager.giveClue(round.seerId, 'dica').success, true)
    for (const [id, position] of Object.entries(guesses)) {
        assert.equal(h.manager.submitGuess(id, position).success, true)
    }
    assert.equal(round.phase, 'revealed')
    return round
}

describe('round history: free-for-all', () => {
    test('a revealed round keeps everything the panel shows, with a roster of who took part', () => {
        const { h, ids, room } = ffa()
        const [ana, bia, caio] = ids
        playFfaRound(h, room, { [bia]: TARGET + 1, [caio]: TARGET + 20 })

        assert.equal(room.roundHistory.length, 1)
        const r = room.roundHistory[0]
        assert.equal(r.roundNumber, 1)
        assert.equal(r.seerId, ana)
        assert.equal(r.clue, 'dica')
        assert.equal(r.targetPosition, TARGET)
        assert.ok(r.spectrumCard.leftConcept && r.spectrumCard.rightConcept)
        assert.deepEqual(r.guesses, { [bia]: TARGET + 1, [caio]: TARGET + 20 })
        assert.deepEqual(r.zones, { [bia]: 4, [caio]: 0 })
        assert.equal(r.scores[bia], 5, 'bullseye + closest bonus')
        assert.equal(r.scores[caio], 0)
        assert.equal(r.scores[ana], 2, 'seer gets the average')
        assert.deepEqual(r.closestIds, [bia])
        assert.deepEqual(r.roster.map(p => p.nickname).sort(), ['Ana', 'Bia', 'Caio'])
        assert.ok(r.roster.every(p => typeof p.colorIndex === 'number'))
    })

    test('the roster still names a player who left after the round', () => {
        const { h, ids, room } = ffa(['Ana', 'Bia', 'Caio', 'Duda'])
        const [, bia, caio, duda] = ids
        playFfaRound(h, room, { [bia]: 50, [caio]: 55, [duda]: 60 })
        h.manager.leaveRoom(caio)
        assert.equal(room.players.some(p => p.id === caio), false)
        const caioThen = room.roundHistory[0].roster.find(p => p.id === caio)
        assert.equal(caioThen?.nickname, 'Caio')
        assert.equal(room.roundHistory[0].guesses[caio], 55)
    })

    test('rounds that were not revealed have an empty roster', () => {
        const { room } = ffa()
        assert.deepEqual(room.currentRound!.roster, [])
    })
})

describe('round history: teams', () => {
    test('keeps the team guess, the left/right call and the points of each team', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia', 'Caio', 'Duda'])
        const [ana, bia, caio] = seats.map(s => s.id)
        assert.equal(h.manager.updateSettings(ana, { mode: 'teams' }).success, true)
        const room = startGame(h, ana)

        // Team 0 = Ana (seer) + Caio; team 1 = Bia + Duda.
        const round = room.currentRound!
        assert.equal(round.teamPlay?.team, 0)
        h.manager.giveClue(ana, 'dica')
        h.manager.submitGuess(caio, TARGET - 5)
        h.manager.sideGuess(bia, 'right')
        assert.equal(round.phase, 'revealed')

        const r = room.roundHistory[0]
        assert.equal(r.teamPlay?.team, 0)
        assert.equal(r.teamPlay?.guess, TARGET - 5)
        assert.equal(r.teamPlay?.lockedBy, caio)
        assert.equal(r.teamPlay?.side, 'right')
        assert.equal(r.teamPlay?.sideBy, bia)
        assert.equal(r.teamPlay?.sideCorrect, true)
        assert.equal(r.teamPlay?.zone, 3)
        assert.deepEqual(r.teamPlay?.points, [3, TEAM_RULES.SIDE_POINTS])
        assert.equal(r.targetPosition, TARGET)
        const roster = new Map(r.roster.map(p => [p.id, p]))
        assert.equal(roster.get(ana)?.team, 0, 'seer')
        assert.equal(roster.get(caio)?.team, 0, 'locked the guess')
        assert.equal(roster.get(bia)?.team, 1, 'called the side')
    })
})

describe('round history: what each player receives', () => {
    test('the history never carries the round in play; its target and guesses stay hidden', () => {
        const { h, code, ids, room } = ffa()
        const [ana, bia, caio] = ids
        playFfaRound(h, room, { [bia]: 40, [caio]: 60 })
        h.clock.advance(1000)
        assert.equal(h.manager.forceNextRound(ana).success, true)

        // Round 2: Bia is the seer; Caio locks a guess, Ana has not yet.
        const current = room.currentRound!
        assert.equal(current.seerId, bia)
        h.manager.giveClue(bia, 'outra')
        h.manager.submitGuess(caio, 70)
        assert.equal(current.phase, 'guessing')

        for (const history of [historyViewFor(room), lastHistoryFor(h, code, ana)!]) {
            assert.equal(history.rounds.length, 1, 'only round 1')
            assert.ok(history.rounds.every(r => r.phase === 'revealed' && r.startedAt !== current.startedAt))
            assert.equal(history.rounds[0].targetPosition, TARGET, 'past rounds keep their target')
            assert.deepEqual(history.rounds[0].guesses, { [bia]: 40, [caio]: 60 }, 'and every guess')
        }
        assert.equal(roomViewFor(room, ana).currentRound?.targetPosition, null)
        assert.deepEqual(roomViewFor(room, ana).currentRound?.guesses, {})
        assert.deepEqual(roomViewFor(room, caio).currentRound?.guesses, { [caio]: 70 })
    })

    test('the history leaves room:state and goes in game:history, on join and whenever it changes', () => {
        const { h, code, ids, room } = ffa()
        const [ana, bia, caio] = ids
        h.transport.clear()
        playFfaRound(h, room, { [bia]: 40, [caio]: 60 })

        const state = h.transport.lastStateFor(ana)!
        assert.deepEqual(state.roundHistory, [], 'room:state stays lean')
        assert.deepEqual(state.skippedRounds, [])
        const sent = h.transport.roomEvents('game:history')
        assert.equal(sent.length, 1, 'one broadcast on the reveal')
        assert.equal((sent[0].args[0] as RoundHistory).rounds.length, 1)
        const order = h.transport.events.map(e => e.event)
        assert.ok(order.indexOf('game:history') < order.indexOf('game:reveal') && order.indexOf('game:history') < order.lastIndexOf('room:state'), 'history before the reveal and its state')

        // Moves inside a round do not resend it.
        h.clock.advance(1000)
        h.manager.forceNextRound(ana)
        h.manager.giveClue(bia, 'outra')
        h.manager.submitGuess(caio, 10)
        assert.equal(h.transport.roomEvents('game:history').length, 1)

        // A player joining mid-game gets it with their state.
        const joined = h.manager.joinRoom(code, 'Duda')
        const duda = joined.data!.playerId
        h.manager.sendState(duda)
        assert.equal(h.transport.playerEvents(duda, 'game:history').length, 1)
        assert.equal(lastHistoryFor(h, code, duda)?.rounds.length, 1)

        // Back to the lobby empties it for everyone.
        h.manager.backToLobby(ana)
        assert.deepEqual(lastHistoryFor(h, code, ana), { rounds: [], skipped: [] })
    })

    test('an unrevealed round slipped into the history is filtered out', () => {
        const { room } = ffa()
        room.roundHistory.push(room.currentRound!)
        assert.equal(historyViewFor(room).rounds.length, 0)
    })
})

describe('round history: skipped rounds', () => {
    test('a host skip is logged with its reason, without the target, and does not take a round number', () => {
        const { h, code, ids, room } = ffa()
        const [ana, bia] = ids
        const card = room.currentRound!.spectrumCard
        const startedAt = room.currentRound!.startedAt
        assert.equal(h.manager.skipRound(ana).success, true)

        assert.equal(room.skippedRounds.length, 1)
        const s = room.skippedRounds[0]
        assert.equal(s.reason, 'host')
        assert.equal(s.roundNumber, 1)
        assert.equal(s.seer?.nickname, 'Ana')
        assert.deepEqual(s.spectrumCard, card)
        assert.equal(s.team, null)
        assert.equal(s.startedAt, startedAt)
        assert.equal(s.skippedAt, h.clock.now())
        assert.equal('targetPosition' in s, false)
        assert.equal(room.roundHistory.length, 0, 'not a played round')
        assert.equal(room.currentRound?.roundNumber, 1, 'the next round reuses the number')
        assert.equal(room.currentRound?.seerId, bia)
        assert.equal(lastHistoryFor(h, code, bia)?.skipped.length, 1, 'sent to the clients')
    })

    test('clue timeout and a seer who leaves are logged with their reasons', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia', 'Caio'])
        const [ana, bia] = seats.map(s => s.id)
        h.manager.updateSettings(ana, { timePerClue: 60 })
        const room = startGame(h, ana)

        h.clock.advance(60_000)
        assert.equal(room.skippedRounds.at(-1)?.reason, 'clue_timeout')
        assert.equal(room.skippedRounds.at(-1)?.seer?.nickname, 'Ana')

        assert.equal(room.currentRound?.seerId, bia)
        h.manager.leaveRoom(bia)
        const last = room.skippedRounds.at(-1)
        assert.equal(last?.reason, 'seer_left')
        assert.equal(last?.seer?.nickname, 'Bia', 'named even though Bia already left the room')
        assert.equal(room.skippedRounds.length, 2)
    })

    test('kicked and disconnected seers have their own reasons', () => {
        const { h, ids, room } = ffa(['Ana', 'Bia', 'Caio', 'Duda'])
        const [ana, bia, caio] = ids
        h.manager.skipRound(ana)
        assert.equal(room.currentRound?.seerId, bia)
        h.manager.kickPlayer(ana, bia)
        assert.equal(room.skippedRounds.at(-1)?.reason, 'seer_kicked')
        assert.equal(room.currentRound?.seerId, caio)
        h.manager.disconnect(caio)
        assert.equal(room.skippedRounds.at(-1)?.reason, 'seer_disconnected')
    })

    test('team mode records whose turn it was', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia', 'Caio', 'Duda'])
        const ana = seats[0].id
        h.manager.updateSettings(ana, { mode: 'teams' })
        const room = startGame(h, ana)
        h.manager.skipRound(ana)
        assert.equal(room.skippedRounds[0].team, 0)
    })

    test('only the last LIMITS.SKIPPED_KEPT are kept, and back to the lobby clears them', () => {
        const { h, ids, room } = ffa()
        for (let i = 0; i < LIMITS.SKIPPED_KEPT + 5; i++) h.manager.skipRound(ids[0])
        assert.equal(room.skippedRounds.length, LIMITS.SKIPPED_KEPT)
        assert.equal(h.manager.backToLobby(ids[0]).success, true)
        assert.deepEqual(room.skippedRounds, [])
        assert.deepEqual(room.roundHistory, [])
    })
})
