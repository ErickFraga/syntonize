// What a room exposes to anyone holding its link (no session): the bare
// minimum for an invite preview. Never add ids, tokens, settings or guesses.

import type { RoomInfo, RoomStatus } from './types.ts'

export interface PublicRoomInfo {
    hostName: string
    playerCount: number
    status: RoomStatus
}

const STATUSES: readonly RoomStatus[] = ['waiting', 'playing', 'finished']

/** Whitelists the public fields of a room (explicit copy, not a spread). */
export function toPublicRoomInfo(info: RoomInfo): PublicRoomInfo {
    return {
        hostName: info.hostName,
        playerCount: info.playerCount,
        status: info.status,
    }
}

/** Validates an untrusted JSON payload (e.g. the HTTP API response). */
export function parsePublicRoomInfo(raw: unknown): PublicRoomInfo | null {
    if (!raw || typeof raw !== 'object') return null
    const { hostName, playerCount, status } = raw as Record<string, unknown>
    if (typeof hostName !== 'string' || !hostName.trim()) return null
    if (typeof playerCount !== 'number' || !Number.isInteger(playerCount) || playerCount < 0) return null
    if (typeof status !== 'string' || !STATUSES.includes(status as RoomStatus)) return null
    return { hostName: hostName.slice(0, 32), playerCount, status: status as RoomStatus }
}
