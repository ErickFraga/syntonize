'use client'

import { io, Socket } from 'socket.io-client'
import type { ServerToClientEvents, ClientToServerEvents } from '@/types/game'

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>

let socket: GameSocket | null = null

const SESSION_TOKEN_KEY = 'syntonize:session-token'
const PLAYER_ID_KEY = 'syntonize:player-id'
const NICKNAME_KEY = 'syntonize:nickname'
const MUTED_KEY = 'syntonize:muted'

function safeGet(storage: Storage | undefined, key: string): string | null {
    try {
        return storage?.getItem(key) ?? null
    } catch {
        return null
    }
}

function safeSet(storage: Storage | undefined, key: string, value: string | null): void {
    try {
        if (value === null) storage?.removeItem(key)
        else storage?.setItem(key, value)
    } catch {
        /* storage unavailable (private mode, etc.) */
    }
}

const local = () => (typeof window === 'undefined' ? undefined : window.localStorage)

export const session = {
    getToken: () => safeGet(local(), SESSION_TOKEN_KEY),
    getPlayerId: () => safeGet(local(), PLAYER_ID_KEY),
    getNickname: () => safeGet(local(), NICKNAME_KEY),
    isMuted: () => safeGet(local(), MUTED_KEY) === '1',
    setMuted: (muted: boolean) => safeSet(local(), MUTED_KEY, muted ? '1' : null),
    saveNickname: (nickname: string) => safeSet(local(), NICKNAME_KEY, nickname),
    save(token: string, playerId: string) {
        safeSet(local(), SESSION_TOKEN_KEY, token)
        safeSet(local(), PLAYER_ID_KEY, playerId)
    },
    clear() {
        safeSet(local(), SESSION_TOKEN_KEY, null)
        safeSet(local(), PLAYER_ID_KEY, null)
    },
}

export function getSocket(): GameSocket {
    if (!socket) {
        socket = io({
            autoConnect: true,
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 800,
            reconnectionDelayMax: 5000,
            auth: (cb: (data: { sessionToken?: string }) => void) => cb({ sessionToken: session.getToken() ?? undefined }),
        })
    }
    return socket
}

export function disconnectSocket(): void {
    socket?.disconnect()
    socket = null
}
