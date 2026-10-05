import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { makeHarness, makeRoom } from './helpers.ts'

const TTL = 60_000

describe('session token TTL', () => {
    test('a token works before the TTL and is refused after it', () => {
        const h = makeHarness({ sessionTtlMs: TTL })
        const { seats } = makeRoom(h, ['Ana', 'Bia'])
        h.manager.disconnect(seats[1].id)
        h.clock.advance(TTL - 1)
        assert.ok(h.manager.restoreSession(seats[1].token))

        h.manager.disconnect(seats[1].id)
        h.clock.advance(TTL)
        assert.equal(h.manager.restoreSession(seats[1].token), null)
        assert.equal(h.manager.restoreSession(seats[1].token), null)
    })

    test('the TTL counts from the last use, not from creation', () => {
        const h = makeHarness({ sessionTtlMs: TTL })
        const { seats } = makeRoom(h, ['Ana', 'Bia'])
        for (let i = 0; i < 3; i++) {
            h.manager.disconnect(seats[1].id)
            h.clock.advance(TTL - 1_000)
            assert.ok(h.manager.restoreSession(seats[1].token), `reconnect ${i}`)
        }
    })

    test('a player who stays connected never expires; the sweep drops only idle tokens', () => {
        const h = makeHarness({ sessionTtlMs: TTL, emptyRoomMs: 10 * TTL })
        const { seats } = makeRoom(h, ['Ana', 'Bia'])
        h.manager.disconnect(seats[1].id)
        h.clock.advance(TTL * 2)
        h.manager.sweep()
        assert.ok(h.manager.restoreSession(seats[0].token), 'connected host keeps the token')
        assert.equal(h.manager.restoreSession(seats[1].token), null)
    })

    test('survives a restart with its last use, and tokens saved before the field existed fall back to savedAt', async () => {
        const { MemoryStore } = await import('../server/roomStore.ts')
        const { RoomManager } = await import('../server/roomManager.ts')
        const { FakeClock, RecordingTransport, fixedRng } = await import('./helpers.ts')
        const clock = new FakeClock()
        const store = new MemoryStore({ now: () => clock.now() })
        const boot = () => new RoomManager(new RecordingTransport(), { clock, rng: fixedRng, disconnectGraceMs: 0, store, persistDebounceMs: 0, sessionTtlMs: TTL })
        const first = boot()
        const created = first.createRoom('Ana')
        const token = created.data!.sessionToken
        first.disconnect(created.data!.playerId)
        await first.flush()
        first.destroy()

        clock.advance(TTL / 2)
        const second = boot()
        await second.loadFromStore()
        assert.ok(await second.resumeSession(token), 'inside the TTL after the restart')
        second.disconnect(created.data!.playerId)
        second.destroy()

        clock.advance(TTL + 1)
        const third = boot()
        await third.loadFromStore()
        assert.equal(await third.resumeSession(token), null, 'outside the TTL after the restart')
        third.destroy()
    })
})
