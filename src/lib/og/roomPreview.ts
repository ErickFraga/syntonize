// Server-side lookup of a room's public info for the invite preview. Talks to
// our own custom server over loopback (`GET /api/room/:code`, see
// server/httpApi.ts) because the Next handler has no access to the
// RoomManager instance.

import { parsePublicRoomInfo, type PublicRoomInfo } from '../../../shared/publicRoom.ts'

const TIMEOUT_MS = 1500

export function roomApiUrl(code: string, port: string | undefined = process.env.PORT): string {
    return `http://127.0.0.1:${port || '3000'}/api/room/${encodeURIComponent(code)}`
}

/** Returns null on any failure (unknown room, server down, bad payload). */
export async function fetchRoomPreview(code: string): Promise<PublicRoomInfo | null> {
    if (!/^[A-Za-z0-9]{6}$/.test(code)) return null
    try {
        const res = await fetch(roomApiUrl(code.toUpperCase()), {
            cache: 'no-store',
            signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        if (!res.ok) return null
        return parsePublicRoomInfo(await res.json())
    } catch {
        return null
    }
}
