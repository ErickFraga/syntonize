'use client'

import { io, Socket } from 'socket.io-client'
import { ServerToClientEvents, ClientToServerEvents } from '@/types/game'

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null

const SESSION_TOKEN_KEY = 'syntonize-session-token'

// Get stored session token
export function getSessionToken(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(SESSION_TOKEN_KEY)
}

// Save session token
export function saveSessionToken(token: string): void {
    if (typeof window === 'undefined') return
    localStorage.setItem(SESSION_TOKEN_KEY, token)
}

// Clear session token
export function clearSessionToken(): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem(SESSION_TOKEN_KEY)
}

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
    if (!socket) {
        const sessionToken = getSessionToken()

        socket = io({
            autoConnect: true,
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            auth: {
                sessionToken: sessionToken || undefined
            }
        })
    }
    return socket
}

export function disconnectSocket(): void {
    if (socket) {
        socket.disconnect()
        socket = null
    }
}
