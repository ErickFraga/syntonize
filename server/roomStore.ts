// RoomStore - where rooms go so they survive a server restart (deploy,
// crash, the free Render instance sleeping). Memory stays the hot source of
// truth inside RoomManager; the store is written through after mutations and
// read once, on boot. Only the server ever reads it, so a snapshot holds the
// full Room (target included): nothing here may reach a socket without going
// through `roomViewFor`.

import type { Room, TimerPhase } from '../shared/types.ts'

/** Bumped when the snapshot shape changes; older snapshots are dropped on load. */
export const SNAPSHOT_VERSION = 1

/** Rooms expire from the store this long after their last save. */
export const DEFAULT_ROOM_TTL_MS = 24 * 60 * 60_000

export interface StoredSession {
    token: string
    playerId: string
}

/** The phase timer running when the snapshot was taken (absolute end time). */
export interface StoredTimer {
    phase: TimerPhase
    endsAt: number
}

export interface RoomSnapshot {
    version: number
    /** Server time (ms) of the save; with the TTL it tells when the room expires. */
    savedAt: number
    room: Room
    /** Session tokens of the room's players, so old tokens work in a new process. */
    sessions: StoredSession[]
    timer: StoredTimer | null
}

export interface RoomStore {
    /** Human-readable name for logs. */
    readonly name: string
    /** Saves (or replaces) a room. Calls for the same room must apply in order. */
    save(snapshot: RoomSnapshot): Promise<void>
    delete(code: string): Promise<void>
    /** One room, or null if it is not stored (or expired). */
    load(code: string): Promise<RoomSnapshot | null>
    /** Every room that has not expired. */
    loadAll(): Promise<RoomSnapshot[]>
    close(): Promise<void>
}

/** Serializes a snapshot (stores keep JSON so a save is a deep copy). */
export function encodeSnapshot(snapshot: RoomSnapshot): string {
    return JSON.stringify(snapshot)
}

/**
 * Parses a stored snapshot, returning null for anything that does not look
 * like one (corrupted value, older version). Only shape checks: the store is
 * written by this server alone.
 */
export function decodeSnapshot(raw: string | null | undefined): RoomSnapshot | null {
    if (!raw) return null
    let value: unknown
    try {
        value = JSON.parse(raw)
    } catch {
        return null
    }
    const s = value as Partial<RoomSnapshot> | null
    if (!s || typeof s !== 'object' || s.version !== SNAPSHOT_VERSION) return null
    if (typeof s.savedAt !== 'number' || !Array.isArray(s.sessions)) return null
    const room = s.room as Partial<Room> | undefined
    if (!room || typeof room.code !== 'string' || !Array.isArray(room.players) || !room.settings) return null
    const timer = s.timer
    if (timer !== null && (typeof timer !== 'object' || typeof timer.endsAt !== 'number' || typeof timer.phase !== 'string')) return null
    return s as RoomSnapshot
}

// ============================================
// MEMORY (default)
// ============================================

/**
 * Keeps snapshots in the process, so rooms die with it, exactly like before
 * persistence existed. Also the store used by tests: a new RoomManager can
 * load from the same instance to simulate a restart.
 */
export class MemoryStore implements RoomStore {
    readonly name = 'memória'
    private entries = new Map<string, { value: string; expiresAt: number }>()
    private ttlMs: number
    private now: () => number

    constructor(options: { ttlMs?: number; now?: () => number } = {}) {
        this.ttlMs = options.ttlMs ?? DEFAULT_ROOM_TTL_MS
        this.now = options.now ?? Date.now
    }

    async save(snapshot: RoomSnapshot): Promise<void> {
        this.entries.set(snapshot.room.code, { value: encodeSnapshot(snapshot), expiresAt: this.now() + this.ttlMs })
    }

    async delete(code: string): Promise<void> {
        this.entries.delete(code)
    }

    async load(code: string): Promise<RoomSnapshot | null> {
        const entry = this.entries.get(code)
        if (!entry) return null
        if (entry.expiresAt <= this.now()) {
            this.entries.delete(code)
            return null
        }
        return decodeSnapshot(entry.value)
    }

    async loadAll(): Promise<RoomSnapshot[]> {
        const now = this.now()
        const result: RoomSnapshot[] = []
        for (const [code, entry] of Array.from(this.entries.entries())) {
            if (entry.expiresAt <= now) {
                this.entries.delete(code)
                continue
            }
            const snapshot = decodeSnapshot(entry.value)
            if (snapshot) result.push(snapshot)
        }
        return result
    }

    async close(): Promise<void> {}

    /** Test helper: the raw snapshot of a room, if stored. */
    peek(code: string): RoomSnapshot | null {
        return decodeSnapshot(this.entries.get(code)?.value)
    }

    get size(): number {
        return this.entries.size
    }
}
