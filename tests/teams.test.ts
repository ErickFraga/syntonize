import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { makeHarness, makeRoom, startGame, type Harness, type Seat } from './helpers.ts'
import { TEAM_DEFAULT_TARGET, TEAM_RULES, DEFAULT_SETTINGS, type Room, type Side } from '../shared/types.ts'
import { roomViewFor, sideOfTarget } from '../shared/gameLogic.ts'

// With fixedRng the target is always 50 (see helpers.ts).
const TARGET = 50

/**
 * Players join in order and the balancer alternates them, so with
 * Ana (host), Bia, Caio, Duda: team 0 = Ana + Caio, team 1 = Bia + Duda.
 */
function setup(names = ['Ana', 'Bia', 'Caio', 'Duda']): { h: Harness; code: string; seats: Seat[]; ids: string[] } {
    const h = makeHarness()
    const { code, seats } = makeRoom(h, names)
    assert.equal(h.manager.updateSettings(seats[0].id, { mode: 'teams' }).success, true)
    return { h, code, seats, ids: seats.map(s => s.id) }
}

/** Plays the current round: clue, a teammate locks `guess`, the other team calls `side` (or lets the timer run). */
function playRound(h: Harness, room: Room, guess: number, side: Side | null): void {
    const round = room.currentRound!
    const team = round.teamPlay!.team
    assert.equal(h.manager.giveClue(round.seerId, 'dica').success, true)
    const guesser = room.players.find(p => p.team === team && p.id !== round.seerId)!
    assert.equal(h.manager.submitGuess(guesser.id, guess).success, true)
    if (side) {
        const opponent = room.players.find(p => p.team !== team)!
        assert.equal(h.manager.sideGuess(opponent.id, side).success, true)
    } else {
        h.clock.advance(TEAM_RULES.SIDE_GUESS_SECONDS * 1000)
    }
    assert.equal(round.phase, 'revealed')
}

describe('teams: lobby', () => {
    test('players are balanced across teams on join', () => {
        const { h, ids } = setup(['Ana', 'Bia', 'Caio', 'Duda', 'Eva'])
        const room = h.manager.getRoomOfPlayer(ids[0])!
        assert.deepEqual(room.players.map(p => p.team), [0, 1, 0, 1, 0])
    })

    test('switching to team mode resets the target to the team default; options are per mode', () => {
        const { h, ids } = setup()
        const room = h.manager.getRoomOfPlayer(ids[0])!
        assert.equal(room.settings.mode, 'teams')
        assert.equal(room.settings.targetScore, TEAM_DEFAULT_TARGET)
        h.manager.updateSettings(ids[0], { targetScore: 7 })
        assert.equal(room.settings.targetScore, 7, '7 is a team option')
        h.manager.updateSettings(ids[0], { targetScore: 30 })
        assert.equal(room.settings.targetScore, 7, '30 is not a team option')
        h.manager.updateSettings(ids[0], { catchUp: false })
        assert.equal(room.settings.catchUp, false)
        h.manager.updateSettings(ids[0], { mode: 'ffa' })
        assert.equal(room.settings.targetScore, DEFAULT_SETTINGS.targetScore)
        h.manager.updateSettings(ids[0], { mode: 'bogus' as never, catchUp: 'yes' as never })
        assert.equal(room.settings.mode, 'ffa')
        assert.equal(room.settings.catchUp, false)
    })

    test('players switch their own team, only the host moves others, only in the lobby', () => {
        const { h, ids } = setup()
        const [ana, bia, caio] = ids
        const room = h.manager.getRoomOfPlayer(ana)!
        assert.equal(h.manager.setTeam(bia, bia, 0).success, true)
        assert.equal(room.players[1].team, 0)
        assert.equal(h.manager.setTeam(bia, caio, 1).success, false, 'not host')
        assert.equal(h.manager.setTeam(ana, caio, 1).success, true, 'host moves Caio')
        assert.equal(room.players[2].team, 1)
        assert.equal(h.manager.setTeam(ana, caio, 2 as never).success, false)
        assert.equal(h.manager.setTeam(ana, 'ghost', 1).success, false)

        h.manager.setTeam(bia, bia, 1)
        h.manager.setTeam(ana, caio, 0)
        startGame(h, ana)
        assert.equal(h.manager.setTeam(bia, bia, 0).success, false, 'locked during the game')
    })

    test('starting needs two connected players on each team', () => {
        const { h, code, ids } = setup(['Ana', 'Bia', 'Caio'])
        const fail = h.manager.startGame(ids[0])
        assert.equal(fail.success, false)
        assert.deepEqual(fail.error, { code: 'team_needs_players', params: { min: TEAM_RULES.MIN_PER_TEAM } })
        h.manager.joinRoom(code, 'Duda')
        assert.equal(h.manager.startGame(ids[0]).success, true)
    })
})

describe('teams: rounds', () => {
    test('teams alternate and the seer rotates inside each team', () => {
        const { h, ids } = setup()
        const [ana, bia, caio, duda] = ids
        const room = startGame(h, ana)
        const seers: string[] = []
        const teams: number[] = []
        for (let i = 0; i < 5; i++) {
            seers.push(room.currentRound!.seerId)
            teams.push(room.currentRound!.teamPlay!.team)
            playRound(h, room, 0, null) // a miss: no catch-up
            h.manager.forceNextRound(ana)
        }
        assert.deepEqual(teams, [0, 1, 0, 1, 0])
        assert.deepEqual(seers, [ana, bia, caio, duda, ana])
        assert.equal(room.currentRound!.roundNumber, 6)
    })

    test('a skipped round keeps the same team and moves to its next seer', () => {
        const { h, ids } = setup(['Ana', 'Bia', 'Caio', 'Duda', 'Eva'])
        const [ana, , caio] = ids
        const room = startGame(h, ana)
        h.manager.disconnect(ana)
        assert.equal(room.currentRound!.teamPlay!.team, 0)
        assert.equal(room.currentRound!.seerId, caio)
        assert.equal(room.currentRound!.roundNumber, 1)

        // With only one connected player left, team 0 cannot play: team 1 takes the turn.
        h.manager.disconnect(caio)
        assert.equal(room.currentRound!.teamPlay!.team, 1)
    })

    test('the active team shares one live needle; the other team never sees it before the lock', () => {
        const { h, ids } = setup()
        const [ana, bia, caio, duda] = ids
        const room = startGame(h, ana)
        h.manager.giveClue(ana, 'dica')

        assert.equal(h.manager.moveNeedle(bia, 30).success, false, 'other team cannot drag')
        assert.equal(h.manager.moveNeedle(ana, 30).success, false, 'seer cannot drag')
        h.transport.clear()
        assert.equal(h.manager.moveNeedle(caio, 70).success, true)
        assert.equal(room.currentRound!.teamPlay!.needle, 70)

        const needleTo = (id: string) => h.transport.playerEvents(id, 'game:needle').length
        assert.equal(needleTo(ana), 1, 'own team (seer included) gets the live needle')
        assert.equal(needleTo(caio), 1)
        assert.equal(needleTo(bia), 0, 'other team gets nothing')
        assert.equal(needleTo(duda), 0)
        assert.equal(h.transport.roomEvents('game:needle').length, 0, 'never broadcast to the room')

        assert.equal(roomViewFor(room, caio).currentRound!.teamPlay!.needle, 70)
        assert.equal(roomViewFor(room, bia).currentRound!.teamPlay!.needle, null, 'hidden in the state too')
        assert.equal(roomViewFor(room, null).currentRound!.teamPlay!.needle, null)
        assert.equal(roomViewFor(room, bia).currentRound!.targetPosition, null)
        assert.equal(roomViewFor(room, ana).currentRound!.targetPosition, TARGET)
    })

    test('needle updates are throttled per player', () => {
        const { h, ids } = setup()
        startGame(h, ids[0])
        h.manager.giveClue(ids[0], 'dica')
        const caio = ids[2]
        assert.equal(h.manager.moveNeedle(caio, 10).success, true)
        assert.equal(h.manager.moveNeedle(caio, 11).success, false, 'too soon')
        h.clock.advance(TEAM_RULES.NEEDLE_THROTTLE_MS)
        assert.equal(h.manager.moveNeedle(caio, 12).success, true)
        assert.equal(h.manager.moveNeedle(caio, Number.NaN).success, false)
    })

    test('one guess per team: the first lock wins and opens the side call', () => {
        const { h, ids } = setup(['Ana', 'Bia', 'Caio', 'Duda', 'Eva'])
        const [ana, bia, caio, , eva] = ids
        const room = startGame(h, ana)
        h.manager.giveClue(ana, 'dica')

        assert.equal(h.manager.submitGuess(bia, 40).success, false, 'other team cannot lock')
        assert.equal(h.manager.submitGuess(caio, 160).success, true)
        assert.equal(h.manager.submitGuess(eva, 20).success, false, 'already locked')
        const play = room.currentRound!.teamPlay!
        assert.equal(play.guess, 100, 'clamped')
        assert.equal(play.lockedBy, caio)
        assert.equal(room.currentRound!.phase, 'side_guess')
        assert.equal(roomViewFor(room, bia).currentRound!.teamPlay!.needle, 100, 'locked needle visible to the other team')
        assert.equal(roomViewFor(room, bia).currentRound!.targetPosition, null, 'target still hidden')
        const timer = h.transport.roomEvents('game:timer').at(-1)!.args[0] as { phase: string; secondsLeft: number }
        assert.equal(timer.phase, 'side')
        assert.equal(timer.secondsLeft, TEAM_RULES.SIDE_GUESS_SECONDS)
    })

    test('the guess timer locks the needle where the team left it', () => {
        const { h, ids } = setup()
        const room = startGame(h, ids[0])
        h.manager.giveClue(ids[0], 'dica')
        h.manager.moveNeedle(ids[2], 52)
        h.clock.advance(DEFAULT_SETTINGS.timePerGuess * 1000)
        assert.equal(room.currentRound!.phase, 'side_guess')
        assert.equal(room.currentRound!.teamPlay!.guess, 52)
        assert.equal(room.currentRound!.teamPlay!.lockedBy, null)
    })
})

describe('teams: scoring', () => {
    test('left/right: only the other team calls, once, and a right call is worth 1', () => {
        const { h, ids } = setup()
        const [ana, bia, caio, duda] = ids
        const room = startGame(h, ana)
        h.manager.giveClue(ana, 'dica')
        h.manager.submitGuess(caio, TARGET + 6) // 3 points; the target is to the LEFT of the guess

        assert.equal(h.manager.sideGuess(caio, 'left').success, false, 'own team cannot call')
        assert.equal(h.manager.sideGuess(bia, 'up').success, false, 'invalid side')
        assert.equal(h.manager.sideGuess(bia, 'left').success, true)
        assert.equal(h.manager.sideGuess(duda, 'right').success, false, 'round already revealed')

        const play = room.currentRound!.teamPlay!
        assert.equal(room.currentRound!.phase, 'revealed')
        assert.equal(play.zone, 3)
        assert.equal(play.side, 'left')
        assert.equal(play.sideCorrect, true)
        assert.deepEqual(play.points, [3, 1])
        assert.deepEqual(room.teamScores, [3, 1])
        assert.ok(room.players.every(p => p.score === 0), 'team mode leaves individual scores alone')
        assert.equal(h.transport.lastStateFor(bia)!.currentRound!.targetPosition, TARGET, 'revealed to all')
    })

    test('a wrong call, no call, or a guess dead on the target gives the other team nothing', () => {
        assert.equal(sideOfTarget(60, 50), 'left')
        assert.equal(sideOfTarget(40, 50), 'right')
        assert.equal(sideOfTarget(50, 50), null)

        const { h, ids } = setup()
        const room = startGame(h, ids[0])
        playRound(h, room, TARGET - 20, 'left') // team 0 misses, team 1 calls wrong
        assert.deepEqual(room.currentRound!.teamPlay!.points, [0, 0])
        assert.equal(room.currentRound!.teamPlay!.sideCorrect, false)

        h.manager.forceNextRound(ids[0])
        playRound(h, room, TARGET, 'right') // team 1 dead on the target: no side is right
        assert.deepEqual(room.currentRound!.teamPlay!.points, [0, 4])
        assert.equal(room.currentRound!.teamPlay!.sideCorrect, false)

        h.manager.forceNextRound(ids[0])
        playRound(h, room, TARGET + 9, null) // team 0 gets 2, team 1 lets the timer run
        assert.deepEqual(room.currentRound!.teamPlay!.points, [2, 0])
        assert.equal(room.currentRound!.teamPlay!.sideCorrect, null)
        assert.deepEqual(room.teamScores, [2, 4])
    })

    test('catch-up: a bullseye while still behind plays again (and can be turned off)', () => {
        for (const catchUp of [true, false]) {
            const { h, ids } = setup()
            h.manager.updateSettings(ids[0], { catchUp })
            const room = startGame(h, ids[0])
            playRound(h, room, TARGET + 20, 'left') // team 0 misses, team 1 right -> [0, 1]
            h.manager.forceNextRound(ids[0])
            playRound(h, room, TARGET + 6, 'right') // team 1 gets 3, team 0 wrong -> [0, 4]
            h.manager.forceNextRound(ids[0])
            playRound(h, room, TARGET + 1, 'left') // team 0 bullseye, team 1 right -> [4, 5]
            assert.deepEqual(room.teamScores, [4, 5])
            assert.equal(room.currentRound!.teamPlay!.catchUp, catchUp)
            h.manager.forceNextRound(ids[0])
            assert.equal(room.currentRound!.teamPlay!.team, catchUp ? 0 : 1)
        }
    })

    test('no catch-up for a bullseye that ties or takes the lead', () => {
        const { h, ids } = setup()
        const room = startGame(h, ids[0])
        playRound(h, room, TARGET, null) // [4, 0]
        assert.equal(room.currentRound!.teamPlay!.catchUp, false)
        h.manager.forceNextRound(ids[0])
        playRound(h, room, TARGET, null) // [4, 4]
        assert.equal(room.currentRound!.teamPlay!.catchUp, false)
        h.manager.forceNextRound(ids[0])
        assert.equal(room.currentRound!.teamPlay!.team, 0)
    })

    test('first team to the target wins; a tie at the target keeps playing', () => {
        const { h, ids } = setup()
        h.manager.updateSettings(ids[0], { targetScore: 7 })
        const room = startGame(h, ids[0])
        playRound(h, room, TARGET + 6, 'right') // [3, 0]
        h.manager.forceNextRound(ids[0])
        playRound(h, room, TARGET + 6, 'right') // [3, 3]
        h.manager.forceNextRound(ids[0])
        playRound(h, room, TARGET + 6, 'right') // [6, 3]
        h.manager.forceNextRound(ids[0])
        playRound(h, room, TARGET + 1, 'left') // team 1 bullseye, team 0 right -> [7, 7]
        assert.deepEqual(room.teamScores, [7, 7])
        assert.equal(room.status, 'playing', 'tie at the target: next round breaks it')
        h.manager.forceNextRound(ids[0])
        playRound(h, room, TARGET + 9, null) // team 0 +2 -> [9, 7]
        assert.equal(room.status, 'finished')
        assert.equal(room.winnerTeam, 0)
        assert.equal(room.winnerId, null)
        assert.equal(h.transport.roomEvents('game:finished').length, 1)
        assert.equal(h.clock.pendingTimers, 0)
    })

    test('round limit with equal scores is a draw', () => {
        const { h, ids } = setup()
        h.manager.updateSettings(ids[0], { maxRounds: 6 })
        const room = startGame(h, ids[0])
        for (let i = 0; i < 6; i++) {
            playRound(h, room, 0, null)
            if (room.status === 'playing') h.manager.forceNextRound(ids[0])
        }
        assert.equal(room.status, 'finished')
        assert.equal(room.winnerTeam, null)
    })

    test('back to lobby resets team scores and rotation', () => {
        const { h, ids } = setup()
        const room = startGame(h, ids[0])
        playRound(h, room, TARGET, null)
        h.manager.backToLobby(ids[0])
        assert.deepEqual(room.teamScores, [0, 0])
        assert.deepEqual(room.teamSeerIndex, [0, 0])
        assert.equal(room.nextTeam, 0)
        startGame(h, ids[0])
        assert.equal(room.currentRound!.seerId, ids[0])
    })
})

describe('teams: resilience', () => {
    test('if the whole guessing side drops, the needle locks where it was', () => {
        const { h, ids } = setup()
        const [ana, , caio] = ids
        const room = startGame(h, ana)
        h.manager.giveClue(ana, 'dica')
        h.manager.moveNeedle(caio, 33)
        h.manager.disconnect(caio)
        assert.equal(room.currentRound!.phase, 'side_guess')
        assert.equal(room.currentRound!.teamPlay!.guess, 33)
    })

    test('if the other team drops during the side call, the round is revealed', () => {
        const { h, ids } = setup()
        const [ana, bia, caio, duda] = ids
        const room = startGame(h, ana)
        h.manager.giveClue(ana, 'dica')
        h.manager.submitGuess(caio, TARGET)
        h.manager.disconnect(bia)
        assert.equal(room.currentRound!.phase, 'side_guess', 'Duda can still call')
        h.manager.disconnect(duda)
        assert.equal(room.currentRound!.phase, 'revealed')
        assert.deepEqual(room.teamScores, [4, 0])
    })

    test('when no team can field a seer and a guesser, the game ends', () => {
        const { h, ids } = setup()
        const [ana, bia, caio] = ids
        const room = startGame(h, ana)
        playRound(h, room, TARGET, null)
        h.manager.disconnect(caio)
        h.manager.disconnect(bia)
        h.manager.forceNextRound(ana)
        assert.equal(room.status, 'finished')
        assert.equal(room.winnerTeam, 0)
        assert.ok(h.transport.hasNotice('not_enough_players_end'))
    })

    test('a team left with nobody ends the game', () => {
        const { h, ids } = setup()
        const room = startGame(h, ids[0])
        h.manager.leaveRoom(ids[1])
        assert.equal(room.status, 'playing')
        h.manager.leaveRoom(ids[3])
        assert.equal(room.status, 'finished')
    })

    test('late joiners go to the smaller team and enter its rotation', () => {
        const { h, code, ids } = setup(['Ana', 'Bia', 'Caio', 'Duda', 'Eva'])
        const room = startGame(h, ids[0])
        const late = h.manager.joinRoom(code, 'Fábio').data!
        assert.equal(room.players.find(p => p.id === late.playerId)!.team, 1)
        assert.equal(h.transport.lastStateFor(late.playerId)!.currentRound!.teamPlay!.needle, null, 'not their turn')
    })
})
