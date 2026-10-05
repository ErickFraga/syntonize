import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { Server, type Socket } from 'socket.io'

import type { ServerToClientEvents, ClientToServerEvents } from '../shared/types.ts'
import { RoomManager, type Transport } from './roomManager.ts'
import { handleApiRequest } from './httpApi.ts'
import { msg, roomViewFor } from '../shared/gameLogic.ts'

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME || '0.0.0.0'
const port = parseInt(process.env.PORT || '3000', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>

app.prepare().then(() => {
    // Assigned below, once the transport (which needs `io`) exists.
    let manager: RoomManager

    const httpServer = createServer((req, res) => {
        if (handleApiRequest(manager, req, res)) return
        handle(req, res, parse(req.url!, true))
    })

    const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
        cors: { origin: process.env.CORS_ORIGIN || '*', methods: ['GET', 'POST'] },
    })

    // playerId -> active socket. A player has at most one live socket; a new
    // connection with the same session token replaces the previous one.
    const socketsByPlayer = new Map<string, GameSocket>()
    const playerBySocket = new Map<string, string>()

    const transport: Transport = {
        toRoom: (code, event, ...args) => {
            io.to(code).emit(event, ...args)
        },
        toPlayer: (playerId, event, ...args) => {
            socketsByPlayer.get(playerId)?.emit(event, ...args)
        },
    }

    manager = new RoomManager(transport, { log: (m) => console.log(`[game] ${m}`) })
    setInterval(() => manager.sweep(), 10_000).unref()

    function bind(socket: GameSocket, playerId: string, roomCode: string) {
        const previous = socketsByPlayer.get(playerId)
        if (previous && previous.id !== socket.id) {
            playerBySocket.delete(previous.id)
            previous.disconnect(true)
        }
        socketsByPlayer.set(playerId, socket)
        playerBySocket.set(socket.id, playerId)
        socket.join(roomCode)
    }

    function unbind(socket: GameSocket) {
        const playerId = playerBySocket.get(socket.id)
        if (!playerId) return
        playerBySocket.delete(socket.id)
        if (socketsByPlayer.get(playerId)?.id === socket.id) socketsByPlayer.delete(playerId)
        const room = manager.getRoomOfPlayer(playerId)
        if (room) socket.leave(room.code)
    }

    function currentPlayerId(socket: GameSocket): string | undefined {
        return playerBySocket.get(socket.id)
    }

    io.on('connection', (socket: GameSocket) => {
        const token = socket.handshake.auth?.sessionToken as string | undefined
        const restored = manager.restoreSession(token)
        if (restored) {
            bind(socket, restored.playerId, restored.room.code)
            socket.emit('room:restored', { room: roomViewFor(restored.room, restored.playerId), playerId: restored.playerId })
            manager.sendState(restored.playerId)
        }

        socket.on('room:create', (nickname, callback) => {
            const existing = currentPlayerId(socket)
            if (existing) {
                manager.leaveRoom(existing)
                unbind(socket)
            }
            const result = manager.createRoom(nickname)
            if (!result.success || !result.data) {
                callback({ success: false, error: result.error })
                return
            }
            bind(socket, result.data.playerId, result.data.room.code)
            manager.sendState(result.data.playerId)
            callback({ success: true, code: result.data.room.code, playerId: result.data.playerId, sessionToken: result.data.sessionToken })
        })

        socket.on('room:join', (code, nickname, callback) => {
            const existing = currentPlayerId(socket)
            if (existing) {
                const room = manager.getRoomOfPlayer(existing)
                if (room && room.code === String(code).toUpperCase()) {
                    // Already in this room with this socket: just resync.
                    manager.sendState(existing)
                    callback({ success: true, code: room.code, playerId: existing })
                    return
                }
                manager.leaveRoom(existing)
                unbind(socket)
            }
            const result = manager.joinRoom(code, nickname)
            if (!result.success || !result.data) {
                callback({ success: false, error: result.error })
                return
            }
            bind(socket, result.data.playerId, result.data.room.code)
            manager.sendState(result.data.playerId)
            callback({ success: true, code: result.data.room.code, playerId: result.data.playerId, sessionToken: result.data.sessionToken })
        })

        socket.on('room:info', (code, callback) => {
            const result = manager.getRoomInfo(String(code ?? ''))
            callback(result.success ? { success: true, info: result.data } : { success: false, error: result.error })
        })

        socket.on('room:leave', () => {
            const playerId = currentPlayerId(socket)
            if (!playerId) return
            manager.leaveRoom(playerId)
            unbind(socket)
        })

        socket.on('room:kick', (targetId, callback) => {
            const playerId = currentPlayerId(socket)
            if (!playerId) return callback({ success: false, error: msg('not_in_room') })
            const result = manager.kickPlayer(playerId, String(targetId))
            if (result.success) {
                const target = socketsByPlayer.get(String(targetId))
                if (target) unbind(target)
            }
            callback({ success: result.success, error: result.error })
        })

        socket.on('room:updateSettings', (settings, callback) => {
            const playerId = currentPlayerId(socket)
            if (!playerId) return callback({ success: false, error: msg('not_in_room') })
            const result = manager.updateSettings(playerId, settings ?? {})
            callback({ success: result.success, error: result.error })
        })

        socket.on('room:setTeam', (targetId, team, callback) => {
            const playerId = currentPlayerId(socket)
            if (!playerId) return callback({ success: false, error: msg('not_in_room') })
            const result = manager.setTeam(playerId, String(targetId), Number(team) as 0 | 1)
            callback({ success: result.success, error: result.error })
        })

        const withPlayer = (fn: (playerId: string) => { success: boolean; error?: string }) =>
            (callback?: (result: { success: boolean; error?: string }) => void) => {
                const playerId = currentPlayerId(socket)
                const result = playerId ? fn(playerId) : { success: false, error: msg('not_in_room') }
                if (!result.success && result.error) socket.emit('room:error', result.error)
                callback?.({ success: result.success, error: result.error })
            }

        socket.on('game:start', (callback) => withPlayer(id => manager.startGame(id))(callback))
        socket.on('game:giveClue', (clue, callback) => withPlayer(id => manager.giveClue(id, clue))(callback))
        socket.on('game:submitGuess', (position, callback) => withPlayer(id => manager.submitGuess(id, Number(position)))(callback))
        socket.on('game:sideGuess', (side, callback) => withPlayer(id => manager.sideGuess(id, side))(callback))
        socket.on('game:needleMove', (position) => {
            // Fire-and-forget and throttled: no error toast for dropped updates.
            const playerId = currentPlayerId(socket)
            if (playerId) manager.moveNeedle(playerId, Number(position))
        })
        socket.on('game:ready', () => withPlayer(id => manager.setReady(id))())
        socket.on('game:nextRound', () => withPlayer(id => manager.forceNextRound(id))())
        socket.on('game:skipRound', () => withPlayer(id => manager.skipRound(id))())
        socket.on('game:backToLobby', () => withPlayer(id => manager.backToLobby(id))())

        socket.on('chat:send', (input, callback) => {
            // Errors go back in the callback only (shown next to the chat box, not as a toast).
            const playerId = currentPlayerId(socket)
            const result = playerId ? manager.sendChat(playerId, input) : { success: false, error: msg('not_in_room') }
            if (typeof callback === 'function') callback({ success: result.success, error: result.error })
        })

        socket.on('game:requestState', () => {
            const playerId = currentPlayerId(socket)
            if (playerId) manager.sendState(playerId)
        })

        socket.on('disconnect', () => {
            const playerId = currentPlayerId(socket)
            unbind(socket)
            // Only mark offline if no newer socket took over this player.
            if (playerId && !socketsByPlayer.has(playerId)) manager.disconnect(playerId)
        })
    })

    httpServer.listen(port, () => {
        console.log(`> Syntonize ready on http://localhost:${port}`)
    })
})
