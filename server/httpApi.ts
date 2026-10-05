// Tiny HTTP API served by the custom server before handing requests to Next.
// Today only `GET /api/room/:code`, used by the invite's Open Graph image.
// Request/response types are structural so tests run without a real server.

import type { RoomInfo } from '../shared/types.ts'
import { toPublicRoomInfo } from '../shared/publicRoom.ts'

type Result<T> = { success: boolean; data?: T; error?: string }

export interface RoomInfoSource {
    getRoomInfo(code: string): Result<RoomInfo>
}

export interface ApiResponse {
    status: number
    headers: Record<string, string>
    body: unknown
}

const ROOM_PATH = /^\/api\/room\/([^/]+)\/?$/
const CODE = /^[A-Za-z0-9]{6}$/

const json = (status: number, body: unknown, extra: Record<string, string> = {}): ApiResponse => ({
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
    body,
})

/**
 * Resolves an API request. Returns null when the path is not ours, so the
 * caller passes it on to Next.
 */
export function routeApiRequest(source: RoomInfoSource, method: string | undefined, url: string | undefined): ApiResponse | null {
    const pathname = (url ?? '').split('?')[0]
    const match = ROOM_PATH.exec(pathname)
    if (!match) return null
    if (method !== 'GET' && method !== 'HEAD') return json(405, { error: 'Method not allowed' }, { Allow: 'GET, HEAD' })

    let code: string
    try {
        code = decodeURIComponent(match[1])
    } catch {
        return json(404, { error: 'Not found' })
    }
    if (!CODE.test(code)) return json(404, { error: 'Not found' })

    const result = source.getRoomInfo(code)
    if (!result.success || !result.data) return json(404, { error: 'Not found' })
    return json(200, toPublicRoomInfo(result.data))
}

export interface MinimalRequest {
    method?: string
    url?: string
}

export interface MinimalResponse {
    writeHead(status: number, headers: Record<string, string>): unknown
    end(body?: string): unknown
}

/** Writes the API response if the request is ours; returns whether it was. */
export function handleApiRequest(source: RoomInfoSource, req: MinimalRequest, res: MinimalResponse): boolean {
    const response = routeApiRequest(source, req.method, req.url)
    if (!response) return false
    res.writeHead(response.status, response.headers)
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify(response.body))
    return true
}
