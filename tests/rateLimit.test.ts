import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { RateLimiter, clientIp } from '../server/rateLimit.ts'
import { handleApiRequest, type MinimalResponse } from '../server/httpApi.ts'
import { makeHarness, makeRoom } from './helpers.ts'

describe('rate limiter', () => {
    test('allows up to the limit inside the window, then refuses', () => {
        let now = 0
        const limiter = new RateLimiter({ limit: 3, windowMs: 1_000 }, () => now)
        assert.deepEqual([1, 2, 3, 4].map(() => limiter.allow('a')), [true, true, true, false])
        assert.equal(limiter.allow('b'), true, 'other keys are independent')
    })

    test('the window slides: old hits stop counting', () => {
        let now = 0
        const limiter = new RateLimiter({ limit: 2, windowMs: 1_000 }, () => now)
        limiter.allow('a')
        now = 600
        limiter.allow('a')
        assert.equal(limiter.allow('a'), false)
        now = 1_100 // first hit left the window
        assert.equal(limiter.allow('a'), true)
        assert.equal(limiter.allow('a'), false)
    })

    test('refused hits do not extend the block', () => {
        let now = 0
        const limiter = new RateLimiter({ limit: 1, windowMs: 1_000 }, () => now)
        limiter.allow('a')
        for (now = 100; now < 900; now += 100) limiter.allow('a')
        now = 1_000
        assert.equal(limiter.allow('a'), true)
    })

    test('idle keys are pruned and reset forgets a key', () => {
        let now = 0
        const limiter = new RateLimiter({ limit: 1, windowMs: 1_000 }, () => now)
        limiter.allow('a')
        limiter.allow('b')
        limiter.reset('a')
        assert.equal(limiter.allow('a'), true)
        now = 5_000
        limiter.allow('c')
        assert.equal(limiter.size, 1)
    })
})

describe('client ip', () => {
    test('counts trusted hops from the right, so a forged first entry is ignored', () => {
        assert.equal(clientIp({ headers: { 'x-forwarded-for': '6.6.6.6, 1.2.3.4' } }), '1.2.3.4')
        assert.equal(clientIp({ headers: { 'x-forwarded-for': '1.2.3.4' } }), '1.2.3.4')
        assert.equal(clientIp({ headers: { 'x-forwarded-for': '6.6.6.6, 1.2.3.4, 10.0.0.1' } }, 2), '1.2.3.4')
    })

    test('falls back to the socket address', () => {
        assert.equal(clientIp({ headers: {}, remoteAddress: '9.9.9.9' }), '9.9.9.9')
        assert.equal(clientIp({ headers: { 'x-forwarded-for': '6.6.6.6' }, remoteAddress: '9.9.9.9' }, 0), '9.9.9.9')
        assert.equal(clientIp({ headers: {} }), 'unknown')
    })
})

describe('http api throttling', () => {
    test('answers 429 with Retry-After when the limiter refuses, and ignores other paths', () => {
        const h = makeHarness()
        const { code } = makeRoom(h, ['Ana', 'Bia'])
        const out = { status: 0, headers: {} as Record<string, string>, body: '' }
        const res: MinimalResponse = {
            writeHead: (status, headers) => { out.status = status; out.headers = headers },
            end: (body) => { out.body = body ?? '' },
        }
        assert.equal(handleApiRequest(h.manager, { method: 'GET', url: `/api/room/${code}` }, res, () => true), true)
        assert.equal(out.status, 200)
        assert.equal(handleApiRequest(h.manager, { method: 'GET', url: `/api/room/${code}` }, res, () => false), true)
        assert.equal(out.status, 429)
        assert.equal(out.headers['Retry-After'], '60')
        let asked = false
        assert.equal(handleApiRequest(h.manager, { method: 'GET', url: '/' }, res, () => { asked = true; return false }), false)
        assert.equal(asked, false)
    })
})
