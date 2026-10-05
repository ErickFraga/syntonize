import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { makeHarness, makeRoom, startGame } from './helpers.ts'
import { routeApiRequest, handleApiRequest, type MinimalResponse } from '../server/httpApi.ts'
import { parsePublicRoomInfo } from '../shared/publicRoom.ts'
import { inviteCopy, homeCopy } from '../src/lib/og/inviteCopy.ts'

function recordingResponse() {
    const res = { status: 0, headers: {} as Record<string, string>, body: undefined as string | undefined }
    const writer: MinimalResponse = {
        writeHead(status, headers) {
            res.status = status
            res.headers = headers
        },
        end(body) {
            res.body = body
        },
    }
    return { res, writer }
}

describe('http api: GET /api/room/:code', () => {
    test('returns only host name, player count and status', () => {
        const h = makeHarness()
        const { code, seats } = makeRoom(h, ['Ana', 'Bia', 'Caio'])
        const ids = seats.map(s => s.id)
        // Generate secrets worth leaking: a round in progress with a guess.
        const room = startGame(h, ids[0])
        const seer = room.currentRound!.seerId
        assert.equal(h.manager.giveClue(seer, 'quente').success, true)
        const guesser = ids.find(id => id !== seer)!
        assert.equal(h.manager.submitGuess(guesser, 42).success, true)

        const response = routeApiRequest(h.manager, 'GET', `/api/room/${code}`)!
        assert.equal(response.status, 200)
        assert.deepEqual(response.body, { hostName: 'Ana', playerCount: 3, status: 'playing' })
        assert.deepEqual(Object.keys(response.body as object).sort(), ['hostName', 'playerCount', 'status'])

        const serialized = JSON.stringify(response.body)
        for (const id of ids) assert.ok(!serialized.includes(id), 'leaks a player id')
        for (const s of seats) assert.ok(!serialized.includes(s.token), 'leaks a session token')
        assert.ok(!serialized.includes(String(room.currentRound!.targetPosition)), 'leaks the target')
        assert.ok(!serialized.includes(code), 'echoes the room code')
        assert.ok(!serialized.includes('quente'), 'leaks the clue')
        assert.equal(response.headers['Cache-Control'], 'no-store')
    })

    test('room code is case-insensitive and query strings are ignored', () => {
        const h = makeHarness()
        const { code } = makeRoom(h, ['Ana'])
        const response = routeApiRequest(h.manager, 'GET', `/api/room/${code.toLowerCase()}?x=1`)!
        assert.equal(response.status, 200)
        assert.deepEqual(response.body, { hostName: 'Ana', playerCount: 1, status: 'waiting' })
    })

    test('unknown or malformed codes are 404', () => {
        const h = makeHarness()
        makeRoom(h, ['Ana'])
        for (const path of ['/api/room/ZZZZZZ', '/api/room/abc', '/api/room/%E0%A4%A', '/api/room/AB..CD', '/api/room/ABCDEFG']) {
            const response = routeApiRequest(h.manager, 'GET', path)
            assert.equal(response?.status, 404, path)
            assert.deepEqual(response?.body, { error: 'Not found' })
        }
    })

    test('only GET/HEAD; other paths fall through to Next', () => {
        const h = makeHarness()
        const { code } = makeRoom(h, ['Ana'])
        assert.equal(routeApiRequest(h.manager, 'POST', `/api/room/${code}`)?.status, 405)
        assert.equal(routeApiRequest(h.manager, 'HEAD', `/api/room/${code}`)?.status, 200)
        assert.equal(routeApiRequest(h.manager, 'GET', `/join/${code}`), null)
        assert.equal(routeApiRequest(h.manager, 'GET', `/api/room/${code}/players`), null)
        assert.equal(routeApiRequest(h.manager, 'GET', '/'), null)
    })

    test('handleApiRequest writes JSON for ours and declines the rest', () => {
        const h = makeHarness()
        const { code } = makeRoom(h, ['Ana', 'Bia'])

        const ok = recordingResponse()
        assert.equal(handleApiRequest(h.manager, { method: 'GET', url: `/api/room/${code}` }, ok.writer), true)
        assert.equal(ok.res.status, 200)
        assert.match(ok.res.headers['Content-Type'], /application\/json/)
        assert.deepEqual(JSON.parse(ok.res.body!), { hostName: 'Ana', playerCount: 2, status: 'waiting' })

        const missing = recordingResponse()
        assert.equal(handleApiRequest(h.manager, { method: 'GET', url: '/api/room/NOPE00' }, missing.writer), true)
        assert.equal(missing.res.status, 404)

        const other = recordingResponse()
        assert.equal(handleApiRequest(h.manager, { method: 'GET', url: '/room/ABC123' }, other.writer), false)
        assert.equal(other.res.status, 0)
    })

    test('reflects host hand-over', () => {
        const h = makeHarness()
        const { code, seats } = makeRoom(h, ['Ana', 'Bia'])
        h.manager.leaveRoom(seats[0].id)
        assert.deepEqual(routeApiRequest(h.manager, 'GET', `/api/room/${code}`)!.body, { hostName: 'Bia', playerCount: 1, status: 'waiting' })
    })
})

describe('public room info parsing (OG image side)', () => {
    test('accepts a valid payload and drops unknown fields', () => {
        assert.deepEqual(parsePublicRoomInfo({ hostName: 'Ana', playerCount: 3, status: 'waiting', secret: 'x' }), {
            hostName: 'Ana',
            playerCount: 3,
            status: 'waiting',
        })
    })

    test('rejects malformed payloads', () => {
        for (const raw of [null, 'x', {}, { hostName: '', playerCount: 1, status: 'waiting' }, { hostName: 'A', playerCount: -1, status: 'waiting' }, { hostName: 'A', playerCount: 1.5, status: 'waiting' }, { hostName: 'A', playerCount: 1, status: 'hacked' }]) {
            assert.equal(parsePublicRoomInfo(raw), null, JSON.stringify(raw))
        }
    })

    test('invite copy: host and count per locale, generic fallback', () => {
        const info = { hostName: 'Ana', playerCount: 3, status: 'waiting' as const }
        const pt = inviteCopy('pt-BR', info, 'ABC123')
        assert.equal(`${pt.line1} ${pt.line2}`, 'Entre na sala de Ana')
        assert.equal(pt.line2, 'Ana')
        assert.equal(pt.phrase, '3 jogadores esperando')
        assert.match(pt.chips[0], /ABC123/)
        const en = inviteCopy('en', info, 'ABC123')
        assert.equal(`${en.line1} ${en.line2}`, 'Join Ana’s room')
        assert.equal(inviteCopy('pt-BR', { ...info, playerCount: 1 }, 'ABC123').phrase, '1 jogador esperando')
        assert.match(inviteCopy('pt-BR', { ...info, status: 'playing' }, 'ABC123').phrase, /^3 jogadores esperando · /)

        const generic = inviteCopy('pt-BR', null, 'ABC123')
        assert.equal(generic.line2, homeCopy('pt-BR').line2)
        assert.match(generic.chips[0], /ABC123/)
    })

    test('home copy: tagline split in two lines and hot/cold card', () => {
        const home = homeCopy('pt-BR')
        assert.equal(`${home.line1} ${home.line2}`, 'Leia a mente dos seus amigos')
        assert.deepEqual(home.card, { left: 'Quente', right: 'Frio' })
        assert.deepEqual(homeCopy('en').card, { left: 'Hot', right: 'Cold' })
        assert.equal(home.chips.length, 2)
    })
})
