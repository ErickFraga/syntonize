import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { makeHarness, makeRoom, startGame } from './helpers.ts'
import { DEFAULT_SETTINGS, LIMITS, SCORING } from '../shared/types.ts'

// With fixedRng the target is always 50 (see helpers.ts).
const TARGET = 50

describe('lobby: create & join', () => {
    test('creating a room makes the creator host with default settings', () => {
        const h = makeHarness()
        const result = h.manager.createRoom('  Ana  ')
        assert.equal(result.success, true)
        const room = result.data!.room
        assert.match(room.code, /^[A-Z0-9]{6}$/)
        assert.equal(room.status, 'waiting')
        assert.deepEqual(room.settings, DEFAULT_SETTINGS)
        assert.equal(room.players.length, 1)
        assert.equal(room.players[0].nickname, 'Ana')
        assert.equal(room.players[0].isHost, true)
        assert.ok(result.data!.sessionToken.length > 10)
        assert.ok(h.transport.lastStateFor(result.data!.playerId))
    })

    test('nickname is validated and normalized', () => {
        const h = makeHarness()
        assert.equal(h.manager.createRoom('').success, false)
        assert.equal(h.manager.createRoom('   ').success, false)
        assert.equal(h.manager.createRoom(123).success, false)
        const long = h.manager.createRoom('x'.repeat(40))
        assert.equal(long.success, true)
        assert.equal(long.data!.room.players[0].nickname.length, LIMITS.NICKNAME_MAX)
    })

    test('joining validates code, nickname uniqueness and capacity', () => {
        const h = makeHarness()
        const { code } = makeRoom(h, ['Ana'])

        assert.equal(h.manager.joinRoom('NOPE12', 'Bia').success, false)
        assert.equal(h.manager.joinRoom(code, '').success, false)
        assert.equal(h.manager.joinRoom(code, 'ana').success, false, 'duplicate nickname (case-insensitive)')

        const joined = h.manager.joinRoom(code.toLowerCase(), ' Bia ')
        assert.equal(joined.success, true, 'code is case-insensitive')
        assert.equal(joined.data!.room.players[1].nickname, 'Bia')
        assert.equal(joined.data!.room.players[1].colorIndex, 1, 'second player gets second color')

        for (let i = 2; i < LIMITS.MAX_PLAYERS; i++) {
            assert.equal(h.manager.joinRoom(code, `P${i}`).success, true)
        }
        assert.equal(h.manager.joinRoom(code, 'Extra').success, false, 'room is full')
    })

    test('everyone in the room gets the new state and a notice when someone joins', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia'])
        assert.equal(h.transport.lastStateFor(seats[0].id)!.players.length, 2)
        assert.ok(h.transport.hasNotice('player_joined', { name: 'Bia' }))
    })

    test('room info exposes host and player count', () => {
        const h = makeHarness()
        const { code } = makeRoom(h, ['Ana', 'Bia'])
        const info = h.manager.getRoomInfo(code)
        assert.equal(info.success, true)
        assert.deepEqual(info.data, { code, hostName: 'Ana', playerCount: 2, spectatorCount: 0, status: 'waiting' })
        assert.equal(h.manager.getRoomInfo('ZZZZZZ').success, false)
    })
})

describe('lobby: settings & start', () => {
    test('only the host can change settings, only valid values are accepted, only in the lobby', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia'])

        assert.equal(h.manager.updateSettings(seats[1].id, { targetScore: 10 }).success, false)

        const ok = h.manager.updateSettings(seats[0].id, { targetScore: 10, timePerGuess: 999, maxRounds: 6 })
        assert.equal(ok.success, true)
        const room = h.manager.getRoomOfPlayer(seats[0].id)!
        assert.equal(room.settings.targetScore, 10)
        assert.equal(room.settings.timePerGuess, DEFAULT_SETTINGS.timePerGuess, 'invalid value ignored')
        assert.equal(room.settings.maxRounds, 6)

        startGame(h, seats[0].id)
        assert.equal(h.manager.updateSettings(seats[0].id, { targetScore: 20 }).success, false)
    })

    test('starting needs the host and two connected players', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana'])
        assert.equal(h.manager.startGame(seats[0].id).success, false)

        const bia = h.manager.joinRoom(h.manager.getRoomOfPlayer(seats[0].id)!.code, 'Bia').data!
        assert.equal(h.manager.startGame(bia.playerId).success, false, 'not host')

        h.manager.disconnect(bia.playerId)
        assert.equal(h.manager.startGame(seats[0].id).success, false, 'only one connected')

        h.manager.restoreSession(bia.sessionToken)
        assert.equal(h.manager.startGame(seats[0].id).success, true)
        assert.equal(h.manager.startGame(seats[0].id).success, false, 'already playing')
    })

    test('round 1: host is the seer, target hidden from guessers', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia', 'Caio'])
        const room = startGame(h, seats[0].id)

        assert.equal(room.status, 'playing')
        assert.equal(room.currentRound!.roundNumber, 1)
        assert.equal(room.currentRound!.seerId, seats[0].id)
        assert.equal(room.currentRound!.phase, 'waiting_clue')
        assert.equal(room.currentRound!.targetPosition, TARGET)

        assert.equal(h.transport.lastStateFor(seats[0].id)!.currentRound!.targetPosition, TARGET, 'seer sees target')
        assert.equal(h.transport.lastStateFor(seats[1].id)!.currentRound!.targetPosition, null, 'guesser does not')
        assert.equal(h.transport.roomEvents('game:roundStart').length, 1)
        assert.equal(h.clock.pendingTimers, 0, 'no clue timer by default')
    })
})

describe('round: clue', () => {
    test('only the seer can give a clue, and not a word from the card', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia'])
        const room = startGame(h, seats[0].id)
        const card = room.currentRound!.spectrumCard

        assert.equal(h.manager.giveClue(seats[1].id, 'algo').success, false)
        assert.equal(h.manager.giveClue(seats[0].id, '   ').success, false)
        const cheating = h.manager.giveClue(seats[0].id, `isso é ${card.leftConcept}`)
        assert.equal(cheating.success, false)
        assert.equal(cheating.error!.code, 'clue_uses_card_word')
        assert.equal(cheating.error!.params!.word, card.leftConcept.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).find(w => w.length > 2))

        const ok = h.manager.giveClue(seats[0].id, '  Pizza   fria ')
        assert.equal(ok.success, true)
        assert.equal(room.currentRound!.clue, 'Pizza fria')
        assert.equal(room.currentRound!.phase, 'guessing')
        assert.equal(h.manager.giveClue(seats[0].id, 'outra').success, false, 'clue already given')
        assert.equal(h.transport.roomEvents('game:clueGiven').length, 1)
    })

    test('the guess timer ticks every second and ends the round when it expires', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia', 'Caio'])
        const room = startGame(h, seats[0].id)
        h.manager.giveClue(seats[0].id, 'dica')

        const first = h.transport.roomEvents('game:timer').at(-1)!.args[0] as { phase: string; secondsLeft: number }
        assert.equal(first.phase, 'guess')
        assert.equal(first.secondsLeft, DEFAULT_SETTINGS.timePerGuess)

        h.clock.advance(5_000)
        const later = h.transport.roomEvents('game:timer').at(-1)!.args[0] as { secondsLeft: number }
        assert.equal(later.secondsLeft, DEFAULT_SETTINGS.timePerGuess - 5)

        h.manager.submitGuess(seats[1].id, 50)
        h.clock.advance(DEFAULT_SETTINGS.timePerGuess * 1000)
        assert.equal(room.currentRound!.phase, 'revealed', 'Caio never guessed, round ended by timer')
        assert.equal(room.currentRound!.scores[seats[1].id], 4 + SCORING.CLOSEST_BONUS)
        assert.equal(room.currentRound!.scores[seats[2].id], undefined, 'no guess, no score entry')
    })

    test('an optional clue timer skips the round of an absent-minded seer', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia'])
        h.manager.updateSettings(seats[0].id, { timePerClue: 60 })
        const room = startGame(h, seats[0].id)
        assert.equal(room.currentRound!.seerId, seats[0].id)

        h.clock.advance(60_000)
        assert.equal(h.transport.roomEvents('game:roundStart').length, 2, 'new round started')
        assert.equal(room.currentRound!.seerId, seats[1].id, 'next seer')
        assert.equal(room.roundHistory.length, 0, 'skipped round is not scored')
        assert.equal(room.currentRound!.roundNumber, 1, 'round numbers only count played rounds')
        assert.ok(h.transport.hasNotice('clue_timeout_skip'))
    })
})

describe('round: guessing & scoring', () => {
    test('guesses are validated, clamped, locked and hidden from others until the reveal', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia', 'Caio'])
        const room = startGame(h, seats[0].id)

        assert.equal(h.manager.submitGuess(seats[1].id, 50).success, false, 'before the clue')
        h.manager.giveClue(seats[0].id, 'dica')

        assert.equal(h.manager.submitGuess(seats[0].id, 50).success, false, 'seer cannot guess')
        assert.equal(h.manager.submitGuess(seats[1].id, Number.NaN).success, false)
        assert.equal(h.manager.submitGuess(seats[1].id, 140).success, true)
        assert.equal(room.currentRound!.guesses[seats[1].id], 100, 'clamped')
        assert.equal(h.manager.submitGuess(seats[1].id, 10).success, false, 'locked')

        const caioView = h.transport.lastStateFor(seats[2].id)!
        assert.deepEqual(caioView.currentRound!.guesses, {}, 'others cannot see Bia guess')
        assert.equal(caioView.players.find(p => p.id === seats[1].id)!.hasGuessed, true, 'but see that she locked')
        const biaView = h.transport.lastStateFor(seats[1].id)!
        assert.deepEqual(biaView.currentRound!.guesses, { [seats[1].id]: 100 })
    })

    test('scores follow the 2-3-4-3-2 wedge, closest gets +1, seer gets the average', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia', 'Caio', 'Duda', 'Eva'])
        const room = startGame(h, seats[0].id)
        h.manager.giveClue(seats[0].id, 'dica')

        h.manager.submitGuess(seats[1].id, TARGET + 2) // bullseye (4) + closest
        h.manager.submitGuess(seats[2].id, TARGET - 7) // 3
        h.manager.submitGuess(seats[3].id, TARGET + 13) // 2
        h.manager.submitGuess(seats[4].id, TARGET + 30) // 0

        const round = room.currentRound!
        assert.equal(round.phase, 'revealed')
        assert.deepEqual(round.zones[seats[1].id], 4)
        assert.deepEqual(round.zones[seats[2].id], 3)
        assert.deepEqual(round.zones[seats[3].id], 2)
        assert.deepEqual(round.zones[seats[4].id], 0)
        assert.deepEqual(round.closestIds, [seats[1].id])
        assert.equal(round.scores[seats[1].id], 5)
        assert.equal(round.scores[seats[2].id], 3)
        assert.equal(round.scores[seats[3].id], 2)
        assert.equal(round.scores[seats[4].id], 0)
        assert.equal(round.scores[seats[0].id], Math.round((4 + 3 + 2 + 0) / 4), 'seer average')
        assert.equal(room.players[0].score, 2)
        assert.equal(room.players[1].score, 5)
        assert.equal(room.roundHistory.length, 1)
        assert.equal(h.transport.roomEvents('game:reveal').length, 1)

        const everyoneView = h.transport.lastStateFor(seats[4].id)!
        assert.equal(everyoneView.currentRound!.targetPosition, TARGET, 'target revealed to all')
        assert.equal(Object.keys(everyoneView.currentRound!.guesses).length, 4, 'all guesses revealed')
        assert.ok(room.nextRoundAt! > h.clock.now())
    })

    test('ties for closest all get the bonus', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia', 'Caio'])
        const room = startGame(h, seats[0].id)
        h.manager.giveClue(seats[0].id, 'dica')
        h.manager.submitGuess(seats[1].id, TARGET - 5)
        h.manager.submitGuess(seats[2].id, TARGET + 5)
        assert.deepEqual(new Set(room.currentRound!.closestIds), new Set([seats[1].id, seats[2].id]))
        assert.equal(room.currentRound!.scores[seats[1].id], 4)
        assert.equal(room.currentRound!.scores[seats[2].id], 4)
    })
})

describe('round: next round & game end', () => {
    test('next round starts when everyone is ready, rotating the seer', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia', 'Caio'])
        const room = startGame(h, seats[0].id)
        h.manager.giveClue(seats[0].id, 'dica')
        h.manager.submitGuess(seats[1].id, 10)
        h.manager.submitGuess(seats[2].id, 90)

        assert.equal(h.manager.setReady(seats[1].id).success, true)
        assert.equal(room.currentRound!.roundNumber, 1)
        h.manager.setReady(seats[0].id)
        assert.equal(room.currentRound!.roundNumber, 1, 'Caio still not ready')
        h.manager.setReady(seats[2].id)
        assert.equal(room.currentRound!.roundNumber, 2)
        assert.equal(room.currentRound!.seerId, seats[1].id)
        assert.equal(room.currentRound!.phase, 'waiting_clue')
        assert.ok(room.players.every(p => !p.isReady && !p.hasGuessed))
    })

    test('next round auto-starts after the pause, and the host can force it', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia'])
        const room = startGame(h, seats[0].id)
        h.manager.giveClue(seats[0].id, 'dica')
        h.manager.submitGuess(seats[1].id, 10)
        assert.equal(room.currentRound!.phase, 'revealed')

        const timer = h.transport.roomEvents('game:timer').at(-1)!.args[0] as { phase: string }
        assert.equal(timer.phase, 'next')
        h.clock.advance(DEFAULT_SETTINGS.timeBetweenRounds * 1000)
        assert.equal(room.currentRound!.roundNumber, 2)

        h.manager.giveClue(seats[1].id, 'dica 2')
        h.manager.submitGuess(seats[0].id, 10)
        assert.equal(h.manager.forceNextRound(seats[1].id).success, false, 'not host')
        assert.equal(h.manager.forceNextRound(seats[0].id).success, true)
        assert.equal(room.currentRound!.roundNumber, 3)
    })

    test('the game ends when someone reaches the target score', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia'])
        h.manager.updateSettings(seats[0].id, { targetScore: 10 })
        const room = startGame(h, seats[0].id)

        // Bia hits 5 per round as guesser; Ana (seer) gets 4.
        h.manager.giveClue(seats[0].id, 'um')
        h.manager.submitGuess(seats[1].id, TARGET)
        h.manager.forceNextRound(seats[0].id)
        h.manager.giveClue(seats[1].id, 'dois')
        h.manager.submitGuess(seats[0].id, TARGET)
        h.manager.forceNextRound(seats[0].id)
        h.manager.giveClue(seats[0].id, 'tres')
        h.manager.submitGuess(seats[1].id, TARGET)

        assert.equal(room.status, 'finished')
        assert.equal(room.winnerId, seats[1].id)
        assert.equal(room.players[1].score, 14)
        assert.equal(h.transport.roomEvents('game:finished').length, 1)
        assert.equal(h.clock.pendingTimers, 0, 'no next-round timer after the end')
        assert.equal(h.manager.setReady(seats[1].id).success, false)
    })

    test('the game ends after maxRounds, highest score wins', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia'])
        h.manager.updateSettings(seats[0].id, { maxRounds: 6, targetScore: 30 })
        const room = startGame(h, seats[0].id)
        for (let i = 0; i < 6; i++) {
            const seer = room.currentRound!.seerId
            const guesser = seats.find(s => s.id !== seer)!
            h.manager.giveClue(seer, `dica ${i}`)
            h.manager.submitGuess(guesser.id, i % 2 === 0 ? TARGET : 0)
            if (room.status === 'playing') h.manager.forceNextRound(seats[0].id)
        }
        assert.equal(room.status, 'finished')
        assert.equal(room.roundHistory.length, 6)
        assert.equal(room.winnerId, seats[1].id)
    })

    test('back to lobby keeps players and resets scores; play again starts fresh', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia'])
        const room = startGame(h, seats[0].id)
        h.manager.giveClue(seats[0].id, 'dica')
        h.manager.submitGuess(seats[1].id, TARGET)

        assert.equal(h.manager.backToLobby(seats[1].id).success, false)
        assert.equal(h.manager.backToLobby(seats[0].id).success, true)
        assert.equal(room.status, 'waiting')
        assert.equal(room.currentRound, null)
        assert.ok(room.players.every(p => p.score === 0))
        assert.equal(h.clock.pendingTimers, 0)

        startGame(h, seats[0].id)
        assert.equal(room.currentRound!.roundNumber, 1)
        assert.equal(room.currentRound!.seerId, seats[0].id)
    })

    test('cards are not repeated within a game', () => {
        let n = 0
        const h = makeHarness({ rng: () => ((n++ * 0.37) % 1) })
        const { seats } = makeRoom(h, ['Ana', 'Bia'])
        const room = startGame(h, seats[0].id)
        const seen = new Set<number>()
        for (let i = 0; i < 20; i++) {
            seen.add(room.currentRound!.spectrumCard.id)
            h.manager.skipRound(seats[0].id)
        }
        assert.equal(seen.size, 20)
    })
})

describe('resilience: disconnects, reconnects, leaving', () => {
    test('a reconnecting player keeps the same id, seat and rotation', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia', 'Caio'])
        const room = startGame(h, seats[0].id)

        h.manager.disconnect(seats[1].id)
        assert.equal(room.players[1].isConnected, false)
        const restored = h.manager.restoreSession(seats[1].token)
        assert.ok(restored)
        assert.equal(restored!.playerId, seats[1].id)
        assert.equal(room.players[1].isConnected, true)
        assert.deepEqual(room.seerOrder, seats.map(s => s.id))

        assert.equal(h.manager.restoreSession('bogus'), null)
        assert.equal(h.manager.restoreSession(undefined), null)
    })

    test('a reconnecting player receives the current timer', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia', 'Caio'])
        startGame(h, seats[0].id)
        h.manager.giveClue(seats[0].id, 'dica')
        h.clock.advance(10_000)
        h.manager.disconnect(seats[1].id)
        h.transport.clear()
        h.manager.restoreSession(seats[1].token)
        const timers = h.transport.playerEvents(seats[1].id, 'game:timer')
        assert.equal(timers.length, 1)
        assert.equal((timers[0].args[0] as { secondsLeft: number }).secondsLeft, DEFAULT_SETTINGS.timePerGuess - 10)
    })

    test('if the seer disconnects before the clue, the round is skipped', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia', 'Caio'])
        const room = startGame(h, seats[0].id)
        h.manager.disconnect(seats[0].id)
        assert.equal(h.transport.roomEvents('game:roundStart').length, 2)
        assert.equal(room.currentRound!.seerId, seats[1].id)
        assert.ok(h.transport.hasNotice('seer_disconnected', { name: 'Ana' }))

        // She comes back: she is just a guesser now, and will be seer again later.
        h.manager.restoreSession(seats[0].token)
        h.manager.giveClue(seats[1].id, 'dica')
        assert.equal(h.manager.submitGuess(seats[0].id, 40).success, true)
    })

    test('disconnected guessers are not awaited', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia', 'Caio'])
        const room = startGame(h, seats[0].id)
        h.manager.giveClue(seats[0].id, 'dica')
        h.manager.submitGuess(seats[1].id, TARGET)
        assert.equal(room.currentRound!.phase, 'guessing')
        h.manager.disconnect(seats[2].id)
        assert.equal(room.currentRound!.phase, 'revealed', 'round resolves without Caio')
    })

    test('a quick refresh does not count as leaving (grace period)', () => {
        const h = makeHarness({ disconnectGraceMs: 6_000 })
        const { seats } = makeRoom(h, ['Ana', 'Bia', 'Caio'])
        const room = startGame(h, seats[0].id)

        // Seer refreshes the page before giving the clue.
        h.manager.disconnect(seats[0].id)
        assert.equal(room.players[0].isConnected, true, 'still counts as present')
        h.clock.advance(2_000)
        h.manager.restoreSession(seats[0].token)
        h.clock.advance(10_000)
        assert.equal(h.transport.roomEvents('game:roundStart').length, 1, 'round was not skipped')
        assert.equal(room.players[0].disconnectedAt, null)

        // A guesser refreshes while others lock their guesses.
        h.manager.giveClue(seats[0].id, 'dica')
        h.manager.disconnect(seats[2].id)
        h.manager.submitGuess(seats[1].id, TARGET)
        assert.equal(room.currentRound!.phase, 'guessing', 'round waits for Caio during the grace')
        h.manager.restoreSession(seats[2].token)
        h.manager.submitGuess(seats[2].id, TARGET + 20)
        assert.equal(room.currentRound!.phase, 'revealed')

        // Gone for real: offline after the grace, round resolves without them.
        h.manager.forceNextRound(seats[0].id)
        const seer = room.currentRound!.seerId
        h.manager.giveClue(seer, 'dica 2')
        const [g1, g2] = seats.filter(s => s.id !== seer)
        h.manager.disconnect(g2.id)
        h.manager.submitGuess(g1.id, TARGET)
        assert.equal(room.currentRound!.phase, 'guessing')
        h.clock.advance(6_000)
        assert.equal(room.players.find(p => p.id === g2.id)!.isConnected, false)
        assert.equal(room.currentRound!.phase, 'revealed')
    })

    test('a disconnected seer is skipped in the rotation', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia', 'Caio'])
        const room = startGame(h, seats[0].id)
        h.manager.giveClue(seats[0].id, 'dica')
        h.manager.disconnect(seats[1].id)
        h.manager.submitGuess(seats[2].id, TARGET)
        h.manager.forceNextRound(seats[0].id)
        assert.equal(room.currentRound!.seerId, seats[2].id, 'Bia (offline) skipped')
    })

    test('leaving transfers the host and removes the seat; empty rooms are deleted', () => {
        const h = makeHarness()
        const { code, seats } = makeRoom(h, ['Ana', 'Bia'])
        h.manager.leaveRoom(seats[0].id)
        const room = h.manager.getRoom(code)!
        assert.equal(room.players.length, 1)
        assert.equal(room.players[0].isHost, true)
        assert.equal(h.manager.restoreSession(seats[0].token), null, 'session invalidated')
        assert.ok(h.transport.hasNotice('new_host', { name: 'Bia' }))
        assert.ok(h.transport.hasNotice('player_left', { name: 'Ana' }))

        h.manager.leaveRoom(seats[1].id)
        assert.equal(h.manager.getRoom(code), undefined)
        assert.equal(h.manager.roomCount, 0)
    })

    test('a two-player game ends when one of them leaves', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia'])
        const room = startGame(h, seats[0].id)
        h.manager.leaveRoom(seats[1].id)
        assert.equal(room.status, 'finished')
        assert.equal(room.winnerId, seats[0].id)
        assert.equal(h.clock.pendingTimers, 0)
    })

    test('kick: host only, kicked player is told and cannot come back with the old token', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia', 'Caio'])
        assert.equal(h.manager.kickPlayer(seats[1].id, seats[2].id).success, false)
        assert.equal(h.manager.kickPlayer(seats[0].id, seats[0].id).success, false)
        assert.equal(h.manager.kickPlayer(seats[0].id, 'ghost').success, false)

        assert.equal(h.manager.kickPlayer(seats[0].id, seats[2].id).success, true)
        assert.equal(h.transport.playerEvents(seats[2].id, 'room:kicked').length, 1)
        assert.ok(h.transport.hasNotice('player_kicked', { name: 'Caio' }))
        assert.equal(h.manager.getRoomOfPlayer(seats[2].id), undefined)
        assert.equal(h.manager.restoreSession(seats[2].token), null)
        assert.equal(h.manager.getRoomOfPlayer(seats[0].id)!.players.length, 2)
    })

    test('late joiners enter a running game and get a seat in the rotation', () => {
        const h = makeHarness()
        const { code, seats } = makeRoom(h, ['Ana', 'Bia'])
        const room = startGame(h, seats[0].id)
        h.manager.giveClue(seats[0].id, 'dica')

        const late = h.manager.joinRoom(code, 'Caio')
        assert.equal(late.success, true)
        assert.equal(room.players.length, 3)
        assert.equal(h.transport.lastStateFor(late.data!.playerId)!.currentRound!.clue, 'dica')
        assert.equal(h.manager.submitGuess(late.data!.playerId, TARGET).success, true, 'can guess this round')
        h.manager.submitGuess(seats[1].id, 0)
        assert.equal(room.currentRound!.phase, 'revealed')
        assert.equal(room.players[2].score, 5)

        const finished = h.manager.getRoomOfPlayer(seats[0].id)!
        finished.status = 'finished'
        assert.equal(h.manager.joinRoom(code, 'Duda').success, false, 'cannot join a finished game')
    })
})

describe('housekeeping sweep', () => {
    test('players who abandon the lobby are dropped after the grace period', () => {
        const h = makeHarness({ lobbyGraceMs: 30_000 })
        const { code, seats } = makeRoom(h, ['Ana', 'Bia'])
        h.manager.disconnect(seats[1].id)
        h.clock.advance(10_000)
        h.manager.sweep()
        assert.equal(h.manager.getRoom(code)!.players.length, 2)
        h.clock.advance(25_000)
        h.manager.sweep()
        assert.equal(h.manager.getRoom(code)!.players.length, 1)
        assert.equal(h.manager.restoreSession(seats[1].token), null)
    })

    test('players who drop mid-game keep their seat', () => {
        const h = makeHarness({ lobbyGraceMs: 1_000 })
        const { seats } = makeRoom(h, ['Ana', 'Bia', 'Caio'])
        const room = startGame(h, seats[0].id)
        h.manager.disconnect(seats[2].id)
        h.clock.advance(60_000)
        h.manager.sweep()
        assert.equal(room.players.length, 3)
    })

    test('the crown moves to a connected player when the host is gone for a while', () => {
        const h = makeHarness({ hostGraceMs: 15_000 })
        const { seats } = makeRoom(h, ['Ana', 'Bia'])
        const room = startGame(h, seats[0].id)
        h.manager.giveClue(seats[0].id, 'dica')
        h.manager.disconnect(seats[0].id)
        h.clock.advance(5_000)
        h.manager.sweep()
        assert.equal(room.players[0].isHost, true)
        h.clock.advance(15_000)
        h.manager.sweep()
        assert.equal(room.players[0].isHost, false)
        assert.equal(room.players[1].isHost, true)

        // Old host returns as a regular player.
        h.manager.restoreSession(seats[0].token)
        assert.equal(room.players[0].isHost, false)
    })

    test('rooms with nobody connected are deleted after a while', () => {
        const h = makeHarness({ emptyRoomMs: 60_000 })
        const { code, seats } = makeRoom(h, ['Ana', 'Bia'])
        startGame(h, seats[0].id)
        h.manager.disconnect(seats[0].id)
        h.manager.disconnect(seats[1].id)
        h.clock.advance(30_000)
        h.manager.sweep()
        assert.ok(h.manager.getRoom(code))
        h.clock.advance(31_000)
        h.manager.sweep()
        assert.equal(h.manager.getRoom(code), undefined)
        assert.equal(h.clock.pendingTimers, 0)
    })
})
