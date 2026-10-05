import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { FakeClock, RecordingTransport, fixedRng, makeRoom, startGame, type Harness } from './helpers.ts'
import { RoomManager, type RoomManagerOptions } from '../server/roomManager.ts'
import { MemoryStore, type RoomSnapshot, type RoomStore } from '../server/roomStore.ts'
import { DEFAULT_SETTINGS, type Room } from '../shared/types.ts'

// With fixedRng the target is always 50 (see helpers.ts).
const TARGET = 50
const DEBOUNCE = 250
const RESTORE_GRACE = 30_000

/**
 * A "server" whose rooms go to `store`. The store reads time from whatever
 * clock the current process uses, so a restart can jump time forward.
 */
class World {
    clock = new FakeClock()
    store: MemoryStore
    options: Partial<RoomManagerOptions>

    constructor(options: Partial<RoomManagerOptions> = {}, store?: MemoryStore) {
        this.options = options
        this.store = store ?? new MemoryStore({ now: () => this.clock.now() })
    }

    boot(): Harness {
        const transport = new RecordingTransport()
        const manager = new RoomManager(transport, {
            clock: this.clock,
            rng: fixedRng,
            disconnectGraceMs: 0,
            store: this.store,
            persistDebounceMs: DEBOUNCE,
            restoreGraceMs: RESTORE_GRACE,
            ...this.options,
        })
        return { clock: this.clock, transport, manager }
    }

    /**
     * Kills the process (no graceful flush: only what the debounce already
     * wrote survives) and boots a new one `downtimeMs` later.
     */
    async restart(old: Harness, downtimeMs = 2_000): Promise<Harness> {
        old.manager.destroy()
        this.clock = new FakeClock(old.clock.now() + downtimeMs)
        const fresh = this.boot()
        await fresh.manager.loadFromStore()
        return fresh
    }
}

/** A store that forwards to `inner` except for the overridden methods. */
function wrapStore(inner: RoomStore, overrides: Partial<RoomStore>): RoomStore {
    return {
        name: overrides.name ?? 'wrapper',
        save: (s) => inner.save(s),
        delete: (c) => inner.delete(c),
        load: (c) => inner.load(c),
        loadAll: () => inner.loadAll(),
        close: () => inner.close(),
        ...overrides,
    }
}

/** Lets the debounced save run. */
const settle = (h: Harness) => h.clock.advance(DEBOUNCE)

const playerIn = (room: Room, id: string) => room.players.find(p => p.id === id)!

describe('persistence: write-through', () => {
    test('rooms, players and sessions are saved after mutations (debounced)', () => {
        const world = new World()
        const h = world.boot()
        const { code, seats } = makeRoom(h, ['Ana', 'Bia'])
        assert.equal(world.store.peek(code), null, 'nothing written before the debounce')

        settle(h)
        const saved = world.store.peek(code)!
        assert.deepEqual(saved.room.players.map(p => p.nickname), ['Ana', 'Bia'])
        assert.deepEqual(saved.sessions.map(s => s.token).sort(), seats.map(s => s.token).sort())
        assert.equal(saved.timer, null)

        h.manager.updateSettings(seats[0].id, { targetScore: 10 })
        h.manager.sendChat(seats[1].id, { kind: 'text', text: 'oi gente' })
        settle(h)
        const after = world.store.peek(code)!
        assert.equal(after.room.settings.targetScore, 10)
        assert.ok(after.room.chat.some(m => m.kind === 'text' && m.text === 'oi gente'))
    })

    test('a burst of mutations becomes one save', () => {
        const world = new World()
        let saves = 0
        const store = world.store
        world.options = { store: wrapStore(store, { save: (s) => { saves += 1; return store.save(s) } }) }
        const h = world.boot()
        makeRoom(h, ['Ana', 'Bia', 'Caio', 'Duda'])
        settle(h)
        assert.equal(saves, 1)
    })

    test('the phase timer is saved with its absolute end', () => {
        const world = new World()
        const h = world.boot()
        const { code, seats } = makeRoom(h, ['Ana', 'Bia'])
        startGame(h, seats[0].id)
        h.manager.giveClue(seats[0].id, 'quente')
        const endsAt = h.clock.now() + DEFAULT_SETTINGS.timePerGuess * 1000
        settle(h)
        assert.deepEqual(world.store.peek(code)!.timer, { phase: 'guess', endsAt })
    })

    test('a room deleted in memory is deleted from the store', () => {
        const world = new World()
        const h = world.boot()
        const { code, seats } = makeRoom(h, ['Ana', 'Bia'])
        settle(h)
        assert.ok(world.store.peek(code))
        h.manager.leaveRoom(seats[1].id)
        h.manager.leaveRoom(seats[0].id)
        assert.equal(world.store.peek(code), null)
        settle(h)
        assert.equal(world.store.size, 0, 'no late save brings it back')
    })

    test('the sweep that deletes empty rooms also deletes them from the store', () => {
        const world = new World({ emptyRoomMs: 60_000 })
        const h = world.boot()
        const { code, seats } = makeRoom(h, ['Ana', 'Bia'])
        startGame(h, seats[0].id)
        h.manager.disconnect(seats[0].id)
        h.manager.disconnect(seats[1].id)
        h.clock.advance(60_000)
        h.manager.sweep()
        assert.equal(h.manager.roomCount, 0)
        assert.equal(world.store.peek(code), null)
    })

    test('a failed save is retried', async () => {
        const world = new World({ persistRetryMs: 5_000 })
        let failures = 1
        const store = world.store
        world.options.store = wrapStore(store, { save: (s) => failures-- > 0 ? Promise.reject(new Error('offline')) : store.save(s) })
        const h = world.boot()
        const { code } = makeRoom(h, ['Ana'])
        settle(h)
        await h.manager.flush()
        assert.equal(store.peek(code), null)
        h.clock.advance(5_000)
        assert.ok(store.peek(code), 'saved on retry')
    })

    test('flush writes pending saves right away (graceful shutdown)', async () => {
        const world = new World()
        const h = world.boot()
        const { code } = makeRoom(h, ['Ana'])
        await h.manager.flush()
        assert.ok(world.store.peek(code))
    })

    test('without a store nothing changes (no extra timers)', () => {
        const transport = new RecordingTransport()
        const clock = new FakeClock()
        const manager = new RoomManager(transport, { clock, rng: fixedRng, disconnectGraceMs: 0 })
        manager.createRoom('Ana')
        assert.equal(clock.pendingTimers, 0)
    })
})

describe('persistence: restart', () => {
    test('a new process loads the room and the game goes on with the old tokens', async () => {
        const world = new World()
        let h = world.boot()
        const { code, seats } = makeRoom(h, ['Ana', 'Bia', 'Caio'])
        const [ana, bia, caio] = seats
        startGame(h, ana.id)
        h.manager.giveClue(ana.id, 'morno')
        h.manager.submitGuess(bia.id, TARGET)
        h.manager.sendChat(bia.id, { kind: 'reaction', emoji: '🔥' })
        settle(h)

        h = await world.restart(h)
        assert.equal(h.manager.isDormant(code), true, 'loaded, waiting for a player')

        // Old tokens work in the new process (new socket ids do not matter).
        for (const seat of seats) {
            const restored = await h.manager.resumeSession(seat.token)
            assert.equal(restored?.playerId, seat.id)
            assert.equal(restored?.room.code, code)
        }
        assert.equal(await h.manager.resumeSession('token-inventado'), null)
        assert.equal(h.manager.isDormant(code), false)

        const room = h.manager.getRoom(code)!
        assert.equal(room.status, 'playing')
        assert.equal(room.currentRound!.clue, 'morno')
        assert.equal(room.currentRound!.guesses[bia.id], TARGET)
        assert.ok(room.chat.some(m => m.kind === 'reaction'))

        // The state sent after the restart is still sanitized.
        h.manager.sendState(caio.id)
        const view = h.transport.lastStateFor(caio.id)!
        assert.equal(view.currentRound!.targetPosition, null)
        assert.deepEqual(view.currentRound!.guesses, {}, 'Bia\'s guess stays hidden')
        assert.deepEqual(view.chat, [])
        assert.ok(h.transport.playerEvents(caio.id, 'chat:history').length > 0)

        // Caio guesses and the round reveals with Bia's pre-restart guess.
        assert.equal(h.manager.submitGuess(caio.id, 0).success, true)
        assert.equal(room.currentRound!.phase, 'revealed')
        assert.equal(playerIn(room, bia.id).score, 5, 'bullseye + closest')
        assert.equal(playerIn(room, caio.id).score, 0)
    })

    test('the phase timer is re-armed from its saved end', async () => {
        const world = new World()
        let h = world.boot()
        const { code, seats } = makeRoom(h, ['Ana', 'Bia', 'Caio'])
        startGame(h, seats[0].id)
        h.manager.giveClue(seats[0].id, 'morno')
        const endsAt = h.clock.now() + DEFAULT_SETTINGS.timePerGuess * 1000
        settle(h)

        h = await world.restart(h, 10_000)
        assert.equal(h.clock.pendingTimers, 0, 'a dormant room runs no timers')
        for (const seat of seats) await h.manager.resumeSession(seat.token)
        const room = h.manager.getRoom(code)!

        h.manager.sendState(seats[1].id)
        const timer = h.transport.playerEvents(seats[1].id, 'game:timer').at(-1)!.args[0] as { phase: string; endsAt: number }
        assert.deepEqual({ phase: timer.phase, endsAt: timer.endsAt }, { phase: 'guess', endsAt })

        h.clock.advance(endsAt - h.clock.now() - 1)
        assert.equal(room.currentRound!.phase, 'guessing')
        h.clock.advance(1)
        assert.equal(room.currentRound!.phase, 'revealed')
        // And the next-round timer follows as usual.
        h.clock.advance(DEFAULT_SETTINGS.timeBetweenRounds * 1000)
        assert.equal(room.currentRound!.roundNumber, 2)
    })

    test('a phase that expired while the server was down resolves when the room wakes', async () => {
        const world = new World()
        let h = world.boot()
        const { code, seats } = makeRoom(h, ['Ana', 'Bia', 'Caio'])
        startGame(h, seats[0].id)
        h.manager.giveClue(seats[0].id, 'morno')
        h.manager.submitGuess(seats[1].id, TARGET)
        settle(h)

        h = await world.restart(h, (DEFAULT_SETTINGS.timePerGuess + 5) * 1000)
        await h.manager.resumeSession(seats[1].token)
        const room = h.manager.getRoom(code)!
        assert.equal(room.currentRound!.phase, 'revealed')
        assert.equal(playerIn(room, seats[1].id).score, 5)
        assert.equal(room.currentRound!.guesses[seats[2].id], undefined, 'Caio did not guess')

        // The reveal armed the next-round timer from now.
        h.clock.advance(DEFAULT_SETTINGS.timeBetweenRounds * 1000)
        assert.equal(room.currentRound!.roundNumber, 2)
        assert.equal(room.currentRound!.phase, 'waiting_clue')
    })

    test('players count as dropped on wake and go offline if they do not come back', async () => {
        const world = new World()
        let h = world.boot()
        const { code, seats } = makeRoom(h, ['Ana', 'Bia', 'Caio'])
        startGame(h, seats[0].id)
        settle(h)

        h = await world.restart(h)
        h.clock.advance(5_000)
        await h.manager.wake(code)
        const room = h.manager.getRoom(code)!
        const wokeAt = h.clock.now()
        for (const p of room.players) {
            assert.equal(p.disconnectedAt, wokeAt)
            assert.equal(p.isConnected, true, 'within the reconnect grace')
        }

        h.manager.restoreSession(seats[0].token)
        h.manager.restoreSession(seats[1].token)
        h.clock.advance(RESTORE_GRACE)
        assert.equal(playerIn(room, seats[0].id).isConnected, true)
        assert.equal(playerIn(room, seats[0].id).disconnectedAt, null)
        assert.equal(playerIn(room, seats[2].id).isConnected, false, 'Caio never came back')
        assert.equal(room.status, 'playing')
    })

    test('deploy overlap: the old process keeps playing after the new boot and its last save wins', async () => {
        const world = new World()
        const old = world.boot()
        const { code, seats } = makeRoom(old, ['Ana', 'Bia', 'Caio'])
        startGame(old, seats[0].id)
        settle(old)

        // The new process boots while the old one still serves the players.
        const clock = new FakeClock(old.clock.now())
        const transport = new RecordingTransport()
        const fresh = new RoomManager(transport, { clock, rng: fixedRng, disconnectGraceMs: 0, store: world.store, persistDebounceMs: DEBOUNCE })
        assert.equal(await fresh.loadFromStore(), 1)
        clock.advance(10_000)
        assert.equal(world.store.peek(code)!.room.currentRound!.clue, null, 'the new process does not write dormant rooms')

        old.manager.giveClue(seats[0].id, 'morno')
        old.manager.submitGuess(seats[1].id, 30)
        await old.manager.flush() // SIGTERM
        old.manager.destroy()

        const restored = await fresh.resumeSession(seats[2].token)
        const room = fresh.getRoom(code)!
        assert.equal(restored?.room, room)
        assert.equal(room.currentRound!.clue, 'morno')
        assert.equal(room.currentRound!.guesses[seats[1].id], 30)
        assert.equal(fresh.restoreSession(seats[1].token)?.playerId, seats[1].id)
    })

    test('deploy overlap: a room the old process deleted after the boot does not come back', async () => {
        const world = new World()
        const old = world.boot()
        const { code, seats } = makeRoom(old, ['Ana', 'Bia'])
        settle(old)

        const fresh = new RoomManager(new RecordingTransport(), { clock: new FakeClock(old.clock.now()), rng: fixedRng, store: world.store })
        await fresh.loadFromStore()
        old.manager.leaveRoom(seats[1].id)
        old.manager.leaveRoom(seats[0].id)

        assert.equal(await fresh.resumeSession(seats[0].token), null)
        assert.equal(fresh.getRoom(code), undefined)
    })

    test('waking falls back to the boot copy when the store is unreachable', async () => {
        const world = new World()
        let h = world.boot()
        const { code, seats } = makeRoom(h, ['Ana', 'Bia'])
        settle(h)
        world.options.store = wrapStore(world.store, { load: () => Promise.reject(new Error('offline')) })
        h = await world.restart(h)
        assert.equal((await h.manager.resumeSession(seats[0].token))?.room.code, code)
    })

    test('joining a dormant room by code wakes it', async () => {
        const world = new World()
        let h = world.boot()
        const { code, seats } = makeRoom(h, ['Ana', 'Bia'])
        h.manager.updateSettings(seats[0].id, { mode: 'teams' })
        settle(h)

        h = await world.restart(h)
        assert.equal(h.manager.getRoomInfo(code).data?.playerCount, 2, 'invite info works while dormant')
        await h.manager.wake(code)
        const room = h.manager.getRoom(code)!
        assert.equal(room.status, 'waiting')
        assert.equal(room.settings.mode, 'teams')
        assert.equal(h.manager.joinRoom(code, 'Ana').success, false, 'nicknames still taken')
        assert.equal(h.manager.joinRoom(code, 'Caio').success, true)
        assert.equal(h.manager.getPlayer(seats[0].id)?.isHost, true)
    })

    test('a room nobody returns to is swept and leaves the store', async () => {
        const world = new World({ emptyRoomMs: 60_000 })
        let h = world.boot()
        const { code } = makeRoom(h, ['Ana', 'Bia'])
        settle(h)

        h = await world.restart(h)
        h.clock.advance(60_000)
        h.manager.sweep()
        assert.equal(h.manager.getRoom(code), undefined)
        assert.equal(world.store.peek(code), null)
    })

    test('a room past its TTL does not come back', async () => {
        const world = new World()
        let h = world.boot()
        const { code, seats } = makeRoom(h, ['Ana', 'Bia'])
        settle(h)

        h = await world.restart(h, 25 * 60 * 60_000)
        assert.equal(h.manager.getRoom(code), undefined)
        assert.equal(await h.manager.resumeSession(seats[0].token), null)
    })

    test('the manager also drops stale snapshots from a store without TTL', async () => {
        const world = new World({ roomTtlMs: 60_000 })
        let h = world.boot()
        const { code } = makeRoom(h, ['Ana'])
        settle(h)
        const snapshot = world.store.peek(code)!
        let deleted: string | null = null
        world.options.store = wrapStore(world.store, {
            name: 'sem ttl',
            delete: async (c) => { deleted = c },
            loadAll: async (): Promise<RoomSnapshot[]> => [snapshot],
        })
        h = await world.restart(h, 61_000)
        assert.equal(h.manager.roomCount, 0)
        assert.equal(deleted, code)
    })
})
