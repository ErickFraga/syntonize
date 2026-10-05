// Test helpers: a fake clock and a recording transport so the whole
// multiplayer flow runs synchronously, with no sockets and no real timers.

import type { Clock, Transport, TimerHandle } from '../server/roomManager.ts'
import { RoomManager, type RoomManagerOptions } from '../server/roomManager.ts'
import type { Room, ServerToClientEvents } from '../shared/types.ts'

interface ScheduledTimer {
    id: number
    at: number
    fn: () => void
}

export class FakeClock implements Clock {
    private current: number
    private timers: ScheduledTimer[] = []
    private nextId = 1

    constructor(start = 1_700_000_000_000) {
        this.current = start
    }

    now(): number {
        return this.current
    }

    setTimeout(fn: () => void, ms: number): TimerHandle {
        const timer = { id: this.nextId++, at: this.current + ms, fn }
        this.timers.push(timer)
        return timer.id
    }

    clearTimeout(handle: TimerHandle): void {
        this.timers = this.timers.filter(t => t.id !== handle)
    }

    /** Moves time forward, firing due timers in chronological order. */
    advance(ms: number): void {
        const target = this.current + ms
        for (;;) {
            const due = this.timers.filter(t => t.at <= target).sort((a, b) => a.at - b.at || a.id - b.id)[0]
            if (!due) break
            this.timers = this.timers.filter(t => t.id !== due.id)
            this.current = Math.max(this.current, due.at)
            due.fn()
        }
        this.current = target
    }

    get pendingTimers(): number {
        return this.timers.length
    }
}

export interface Emitted {
    target: { kind: 'room'; code: string } | { kind: 'player'; id: string }
    event: keyof ServerToClientEvents
    args: unknown[]
}

export class RecordingTransport implements Transport {
    events: Emitted[] = []

    toRoom<E extends keyof ServerToClientEvents>(code: string, event: E, ...args: Parameters<ServerToClientEvents[E]>): void {
        this.events.push({ target: { kind: 'room', code }, event, args })
    }

    toPlayer<E extends keyof ServerToClientEvents>(playerId: string, event: E, ...args: Parameters<ServerToClientEvents[E]>): void {
        this.events.push({ target: { kind: 'player', id: playerId }, event, args })
    }

    /** Last `room:state` a specific player received (their sanitized view). */
    lastStateFor(playerId: string): Room | undefined {
        for (let i = this.events.length - 1; i >= 0; i--) {
            const e = this.events[i]
            if (e.event === 'room:state' && e.target.kind === 'player' && e.target.id === playerId) {
                return e.args[0] as Room
            }
        }
        return undefined
    }

    roomEvents(event: keyof ServerToClientEvents): Emitted[] {
        return this.events.filter(e => e.event === event && e.target.kind === 'room')
    }

    playerEvents(playerId: string, event: keyof ServerToClientEvents): Emitted[] {
        return this.events.filter(e => e.event === event && e.target.kind === 'player' && e.target.id === playerId)
    }

    notices(): string[] {
        return this.roomEvents('room:notice').map(e => (e.args[0] as { message: string }).message)
    }

    clear(): void {
        this.events = []
    }
}

export interface Harness {
    clock: FakeClock
    transport: RecordingTransport
    manager: RoomManager
}

/**
 * rng that always returns 0.5: card = middle of the deck, target = 50.
 * Keeps scoring assertions deterministic.
 */
export const fixedRng = () => 0.5

export function makeHarness(options: Partial<RoomManagerOptions> = {}): Harness {
    const clock = new FakeClock()
    const transport = new RecordingTransport()
    // Grace period off by default so disconnect effects are immediate in tests.
    const manager = new RoomManager(transport, { clock, rng: fixedRng, disconnectGraceMs: 0, ...options })
    return { clock, transport, manager }
}

export interface Seat {
    id: string
    token: string
}

/** Creates a room with `names[0]` as host and the rest joined, in order. */
export function makeRoom(h: Harness, names: string[]): { code: string; seats: Seat[] } {
    const created = h.manager.createRoom(names[0])
    if (!created.success || !created.data) throw new Error(created.error)
    const code = created.data.room.code
    const seats: Seat[] = [{ id: created.data.playerId, token: created.data.sessionToken }]
    for (const name of names.slice(1)) {
        const joined = h.manager.joinRoom(code, name)
        if (!joined.success || !joined.data) throw new Error(joined.error)
        seats.push({ id: joined.data.playerId, token: joined.data.sessionToken })
    }
    return { code, seats }
}

/** Starts the game and returns the room; seer of round 1 is the host. */
export function startGame(h: Harness, hostId: string): Room {
    const result = h.manager.startGame(hostId)
    if (!result.success) throw new Error(result.error)
    return h.manager.getRoomOfPlayer(hostId)!
}
