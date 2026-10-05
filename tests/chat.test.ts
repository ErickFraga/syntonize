import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { makeHarness, makeRoom, startGame, type Harness } from './helpers.ts'
import { CHAT_LIMITS, CHAT_REACTIONS, type ChatMessage } from '../shared/types.ts'
import { roomViewFor } from '../shared/gameLogic.ts'

const text = (t: unknown) => ({ kind: 'text', text: t })
const reaction = (emoji: unknown) => ({ kind: 'reaction', emoji })

/** Chat messages broadcast to the room so far. */
function chatEvents(h: Harness): ChatMessage[] {
    return h.transport.roomEvents('chat:message').map(e => e.args[0] as ChatMessage)
}

function systemCodes(h: Harness): string[] {
    return chatEvents(h).flatMap(m => (m.kind === 'system' ? [m.code] : []))
}

describe('chat: messages', () => {
    test('a text message is broadcast with author, color and server time, and kept in the room', () => {
        const h = makeHarness()
        const { code, seats } = makeRoom(h, ['Ana', 'Bia'])
        h.transport.clear()

        const sent = h.manager.sendChat(seats[1].id, text('oi gente'))
        assert.equal(sent.success, true)
        const [message] = chatEvents(h)
        assert.deepEqual(h.transport.roomEvents('chat:message')[0].target, { kind: 'room', code })
        assert.equal(message.kind, 'text')
        if (message.kind !== 'text') return
        assert.equal(message.text, 'oi gente')
        assert.equal(message.authorId, seats[1].id)
        assert.equal(message.author, 'Bia')
        assert.equal(message.colorIndex, 1)
        assert.equal(message.at, h.clock.now())
        assert.ok(message.id)
        assert.deepEqual(h.manager.getRoom(code)!.chat.at(-1), message)
    })

    test('reactions only from the fixed set', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia'])
        for (const emoji of CHAT_REACTIONS.slice(0, 3)) {
            assert.equal(h.manager.sendChat(seats[0].id, reaction(emoji)).success, true)
        }
        assert.equal(h.manager.sendChat(seats[0].id, reaction('🍕')).success, false)
        assert.equal(h.manager.sendChat(seats[0].id, reaction('🔥🔥')).success, false)
        assert.equal(h.manager.sendChat(seats[0].id, reaction(undefined)).success, false)
        const last = chatEvents(h).at(-1)!
        assert.equal(last.kind === 'reaction' && last.emoji, CHAT_REACTIONS[2])
    })

    test('text is normalized and validated', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia'])
        const send = (raw: unknown) => h.manager.sendChat(seats[0].id, raw)

        const spaced = send(text('   muito \n\t  alto   demais  '))
        assert.equal(spaced.success, true)
        assert.equal(spaced.data!.kind === 'text' && spaced.data!.text, 'muito alto demais')

        assert.equal(send(text('')).success, false, 'empty')
        assert.equal(send(text('   \n  ')).success, false, 'only whitespace')
        assert.equal(send(text('')).error!.code, 'chat_empty')
        assert.deepEqual(send(text('x'.repeat(CHAT_LIMITS.TEXT_MAX + 1))).error, { code: 'chat_too_long', params: { max: CHAT_LIMITS.TEXT_MAX } }, 'too long')
        assert.equal(send(text(123)).error!.code, 'chat_invalid')
        assert.equal(send(reaction('🍕')).error!.code, 'chat_invalid_reaction')
        const max = send(text('x'.repeat(CHAT_LIMITS.TEXT_MAX)))
        assert.equal(max.success, true, 'exactly the limit')
        const emojiMax = send(text('🔥'.repeat(CHAT_LIMITS.TEXT_MAX)))
        assert.equal(emojiMax.success, true, 'limit counts characters, not UTF-16 units')

        // Wrong shapes from a malicious socket.
        assert.equal(send(text(123)).success, false)
        assert.equal(send(text(null)).success, false)
        assert.equal(send({ kind: 'html', text: 'oi' }).success, false)
        assert.equal(send('oi').success, false)
        assert.equal(send(null).success, false)
        assert.equal(send(undefined).success, false)
    })

    test('nobody outside a room can chat', () => {
        const h = makeHarness()
        assert.equal(h.manager.sendChat('p_ghost', text('oi')).success, false)
    })
})

describe('chat: rate limit', () => {
    test('5 messages per 10 s per player, sliding window', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia'])
        const ana = seats[0].id

        for (let i = 0; i < CHAT_LIMITS.RATE_COUNT; i++) {
            assert.equal(h.manager.sendChat(ana, i % 2 ? reaction('🔥') : text(`msg ${i}`)).success, true, `message ${i + 1}`)
            h.clock.advance(1000)
        }
        // 6th within the window (first one was sent 5 s ago): refused.
        const sixth = h.manager.sendChat(ana, text('mais uma'))
        assert.equal(sixth.success, false)
        assert.equal(sixth.error!.code, 'chat_rate_limited')

        // Another player is not affected.
        assert.equal(h.manager.sendChat(seats[1].id, text('eu posso')).success, true)

        // The first message leaves the window 10 s after it was sent: one slot opens.
        h.clock.advance(CHAT_LIMITS.RATE_WINDOW_MS - 5000)
        assert.equal(h.manager.sendChat(ana, text('voltei')).success, true)
        assert.equal(h.manager.sendChat(ana, text('de novo')).success, false, 'only one slot opened')

        // After a full quiet window, the whole budget is back.
        h.clock.advance(CHAT_LIMITS.RATE_WINDOW_MS)
        for (let i = 0; i < CHAT_LIMITS.RATE_COUNT; i++) {
            assert.equal(h.manager.sendChat(ana, text(`rajada ${i}`)).success, true)
        }
    })

    test('refused messages do not use up the budget', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia'])
        for (let i = 0; i < 10; i++) h.manager.sendChat(seats[0].id, text(''))
        for (let i = 0; i < CHAT_LIMITS.RATE_COUNT; i++) {
            assert.equal(h.manager.sendChat(seats[0].id, text('ok')).success, true)
        }
    })
})

describe('chat: history', () => {
    test('keeps only the last 50 messages', () => {
        const h = makeHarness()
        const { code, seats } = makeRoom(h, ['Ana', 'Bia'])
        for (let i = 0; i < 70; i++) {
            assert.equal(h.manager.sendChat(seats[i % 2].id, text(`m${i}`)).success, true)
            h.clock.advance(5000)
        }
        const chat = h.manager.getRoom(code)!.chat
        assert.equal(chat.length, CHAT_LIMITS.HISTORY)
        const last = chat.at(-1)!
        assert.equal(last.kind === 'text' && last.text, 'm69')
        const first = chat[0]
        assert.equal(first.kind === 'text' && first.text, `m${70 - CHAT_LIMITS.HISTORY}`)
    })

    test('a player who joins later receives the history with their state', () => {
        const h = makeHarness()
        const { code, seats } = makeRoom(h, ['Ana', 'Bia'])
        h.manager.sendChat(seats[0].id, text('quem mais vem?'))
        h.manager.sendChat(seats[1].id, reaction('👏'))

        const caio = h.manager.joinRoom(code, 'Caio').data!
        // server/index.ts calls sendState right after binding the socket.
        h.manager.sendState(caio.playerId)
        const history = h.transport.playerEvents(caio.playerId, 'chat:history').at(-1)!.args[0] as ChatMessage[]
        assert.deepEqual(history, h.manager.getRoom(code)!.chat)
        assert.deepEqual(history.map(m => m.kind), ['system', 'text', 'reaction', 'system'], 'Bia joined, text, reaction, Caio joined')

        // The history does not ride on every room:state.
        assert.deepEqual(h.transport.lastStateFor(caio.playerId)!.chat, [])
    })

    test('a restored session gets the history again', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia'])
        h.manager.sendChat(seats[0].id, text('volta logo'))
        h.manager.disconnect(seats[1].id)
        h.transport.clear()
        const restored = h.manager.restoreSession(seats[1].token)!
        h.manager.sendState(restored.playerId)
        const history = h.transport.playerEvents(seats[1].id, 'chat:history')[0].args[0] as ChatMessage[]
        assert.ok(history.some(m => m.kind === 'text' && m.text === 'volta logo'))
    })

    test('the history survives "back to lobby" and a new game', () => {
        const h = makeHarness()
        const { code, seats } = makeRoom(h, ['Ana', 'Bia'])
        h.manager.sendChat(seats[1].id, text('bora'))
        startGame(h, seats[0].id)
        h.manager.backToLobby(seats[0].id)
        assert.ok(h.manager.getRoom(code)!.chat.some(m => m.kind === 'text' && m.text === 'bora'))
    })
})

describe('chat: system messages', () => {
    test('join, leave and kick', () => {
        const h = makeHarness()
        const { code, seats } = makeRoom(h, ['Ana', 'Bia', 'Caio'])
        h.manager.leaveRoom(seats[2].id)
        h.manager.kickPlayer(seats[0].id, seats[1].id)

        const system = chatEvents(h).filter(m => m.kind === 'system')
        assert.deepEqual(
            system.map(m => m.kind === 'system' && [m.code, m.params.name]),
            [['joined', 'Bia'], ['joined', 'Caio'], ['left', 'Caio'], ['kicked', 'Bia']],
        )
        assert.equal(h.manager.getRoom(code)!.chat.length, 4)
    })

    test('round reveal carries the round number and never the target, then the game end', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia'])
        h.manager.updateSettings(seats[0].id, { maxRounds: 6, targetScore: 30 })
        const room = startGame(h, seats[0].id)
        h.manager.giveClue(seats[0].id, 'meio termo')
        h.manager.submitGuess(seats[1].id, 50)

        const reveal = chatEvents(h).find(m => m.kind === 'system' && m.code === 'round_revealed')!
        assert.equal(reveal.kind === 'system' && reveal.params.round, 1)
        assert.deepEqual(reveal.kind === 'system' && Object.keys(reveal.params), ['round'], 'no target position')

        // Play to the round limit: the last reveal is followed by the game end.
        for (let n = 2; n <= 6; n++) {
            h.manager.forceNextRound(seats[0].id)
            const seer = room.currentRound!.seerId
            const guesser = seats.find(s => s.id !== seer)!.id
            h.manager.giveClue(seer, 'meio termo')
            h.manager.submitGuess(guesser, 50)
        }
        assert.equal(room.status, 'finished')
        const codes = systemCodes(h)
        assert.equal(codes.filter(c => c === 'round_revealed').length, 6)
        assert.deepEqual(codes.slice(-2), ['round_revealed', 'game_finished'])
        const finished = chatEvents(h).at(-1)!
        assert.equal(finished.kind === 'system' && finished.params.name, room.players.find(p => p.id === room.winnerId)!.nickname)
    })

    test('a game that ends because players left also posts the end', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia'])
        startGame(h, seats[0].id)
        h.manager.leaveRoom(seats[1].id)
        assert.deepEqual(systemCodes(h).slice(-2), ['left', 'game_finished'])
    })

    test('team game end names the winning team', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia', 'Caio', 'Duda'])
        h.manager.updateSettings(seats[0].id, { mode: 'teams' })
        const room = startGame(h, seats[0].id)
        // Team 0 = Ana + Caio. Bullseyes until team 0 reaches the target.
        for (let i = 0; i < 20 && room.status === 'playing'; i++) {
            const round = room.currentRound!
            const team = round.teamPlay!.team
            h.manager.giveClue(round.seerId, 'meio')
            const guesser = room.players.find(p => p.team === team && p.id !== round.seerId)!
            h.manager.submitGuess(guesser.id, team === 0 ? 50 : 0)
            h.manager.sideGuess(room.players.find(p => p.team !== team)!.id, 'left')
            if (room.status === 'playing') h.manager.forceNextRound(seats[0].id)
        }
        assert.equal(room.status, 'finished')
        const finished = chatEvents(h).at(-1)!
        assert.equal(finished.kind === 'system' && finished.code, 'game_finished')
        assert.equal(finished.kind === 'system' && finished.params.team, room.winnerTeam)
    })
})

describe('chat: the seer cannot leak the clue', () => {
    test('the seer only reacts while their round is open, and texts again after the reveal', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia', 'Caio'])
        startGame(h, seats[0].id) // Ana is the seer
        const ana = seats[0].id

        const waiting = h.manager.sendChat(ana, text('é tipo 50'))
        assert.equal(waiting.success, false, 'waiting_clue')
        assert.equal(waiting.error!.code, 'chat_seer_reactions_only')
        assert.equal(h.manager.sendChat(ana, reaction('🤔')).success, true, 'reactions are fine')
        assert.equal(h.manager.sendChat(seats[1].id, text('capricha na dica')).success, true, 'guessers chat freely')

        h.manager.giveClue(ana, 'meio termo')
        assert.equal(h.manager.sendChat(ana, text('mais pra direita')).success, false, 'guessing')
        assert.equal(h.manager.sendChat(ana, reaction('😱')).success, true)

        h.manager.submitGuess(seats[1].id, 40)
        h.manager.submitGuess(seats[2].id, 60)
        assert.equal(h.manager.getRoomOfPlayer(ana)!.currentRound!.phase, 'revealed')
        assert.equal(h.manager.sendChat(ana, text('era 50!')).success, true, 'after the reveal')

        // Next round: Bia is the seer, Ana is free to talk.
        h.manager.forceNextRound(ana)
        assert.equal(h.manager.sendChat(seats[1].id, text('hmm')).success, false)
        assert.equal(h.manager.sendChat(ana, text('vai Bia')).success, true)
        assert.ok(!chatEvents(h).some(m => m.kind === 'text' && m.authorId === ana && m.text !== 'era 50!' && m.text !== 'vai Bia'))
    })

    test('in team mode the seer stays quiet through the side call too', () => {
        const h = makeHarness()
        const { seats } = makeRoom(h, ['Ana', 'Bia', 'Caio', 'Duda'])
        h.manager.updateSettings(seats[0].id, { mode: 'teams' })
        const room = startGame(h, seats[0].id)
        const seer = room.currentRound!.seerId
        h.manager.giveClue(seer, 'meio')
        const guesser = room.players.find(p => p.team === room.currentRound!.teamPlay!.team && p.id !== seer)!
        h.manager.submitGuess(guesser.id, 50)
        assert.equal(room.currentRound!.phase, 'side_guess')
        assert.equal(h.manager.sendChat(seer, text('é pra direita')).success, false)
        assert.equal(h.manager.sendChat(seer, reaction('❤️')).success, true)
    })

    test('the room state never carries the chat, so roomViewFor stays the only view', () => {
        const h = makeHarness()
        const { code, seats } = makeRoom(h, ['Ana', 'Bia'])
        h.manager.sendChat(seats[1].id, text('oi'))
        const room = h.manager.getRoom(code)!
        assert.deepEqual(roomViewFor(room, seats[1].id).chat, [])
        startGame(h, seats[0].id)
        assert.deepEqual(roomViewFor(room, seats[1].id).chat, [])
    })
})
