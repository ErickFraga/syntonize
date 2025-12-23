import { createServer } from 'http'
import { Server } from 'socket.io'
import { parse } from 'url'
import next from 'next'

// Import shared types and logic
import {
    Room,
    Player,
    TimerUpdate,
    SCORING,
    generateRoomCode,
    createRoom,
    createPlayer,
    addPlayerToRoom,
    removePlayerFromRoom,
    startNewRound,
    processRoundResults,
    allPlayersGuessed,
    canJoinRoom,
    canStartGame,
    resetGameState,
} from '../shared'

// Server setup
const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const port = parseInt(process.env.PORT || '3000', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

// Store rooms in memory
const rooms = new Map<string, Room>()
const playerRooms = new Map<string, string>()
const roomTimers = new Map<string, NodeJS.Timeout>()

// Helper to get existing room codes
function getExistingCodes(): Set<string> {
    return new Set(rooms.keys())
}

// Timer management with server timestamp sync
interface TimerState {
    endTime: number
    phase: 'clue' | 'guess'
}
const timerStates = new Map<string, TimerState>()

// Ready players for next round (per room)
const readyPlayers = new Map<string, Set<string>>() // roomCode -> Set of playerIds
const nextRoundTimeouts = new Map<string, NodeJS.Timeout>() // roomCode -> timeout

// Session token mapping for reconnection
interface SessionToken {
    token: string
    roomCode: string
    nickname: string
    createdAt: number
}
const sessionTokens = new Map<string, SessionToken>() // token -> session

// Generate unique session token
function generateSessionToken(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 12)}`
}

app.prepare().then(() => {
    const httpServer = createServer((req, res) => {
        const parsedUrl = parse(req.url!, true)
        handle(req, res, parsedUrl)
    })

    const io = new Server(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    })

    io.on('connection', (socket) => {
        const sessionToken = socket.handshake.auth?.sessionToken as string | undefined
        console.log('Client connected:', socket.id, 'token:', sessionToken ? sessionToken.slice(0, 15) + '...' : 'none')

        // Try to restore session from token
        if (sessionToken) {
            const session = sessionTokens.get(sessionToken)
            if (session) {
                const room = rooms.get(session.roomCode)
                if (room) {
                    // Find player by nickname (since socket ID changed)
                    const existingPlayer = room.players.find(p => p.nickname === session.nickname)
                    if (existingPlayer) {
                        // Update player's socket ID
                        const oldId = existingPlayer.id
                        existingPlayer.id = socket.id
                        existingPlayer.isConnected = true

                        // Update mappings
                        playerRooms.delete(oldId)
                        playerRooms.set(socket.id, session.roomCode)

                        socket.join(session.roomCode)

                        // Emit restored event to trigger redirect
                        socket.emit('room:restored', { room, sessionToken })
                        io.to(session.roomCode).emit('room:state', room)

                        // Resync timer if game is in progress
                        resyncTimerForSocket(socket, session.roomCode)

                        console.log(`Session restored for ${session.nickname} in room ${session.roomCode}`)
                    }
                } else {
                    // Room no longer exists, clear session
                    sessionTokens.delete(sessionToken)
                    console.log(`Session expired - room ${session.roomCode} no longer exists`)
                }
            }
        }

        // Create room
        socket.on('room:create', (nickname: string, callback: (result: { success: boolean; code?: string; sessionToken?: string; error?: string }) => void) => {
            try {
                const code = generateRoomCode(getExistingCodes())
                const room = createRoom(socket.id, nickname, code)

                rooms.set(code, room)
                playerRooms.set(socket.id, code)
                socket.join(code)

                // Generate and save session token
                const newToken = generateSessionToken()
                sessionTokens.set(newToken, {
                    token: newToken,
                    roomCode: code,
                    nickname,
                    createdAt: Date.now()
                })

                callback({ success: true, code, sessionToken: newToken })
                socket.emit('room:state', room)

                console.log(`Room ${code} created by ${nickname}`)
            } catch (error) {
                console.error('Error creating room:', error)
                callback({ success: false, error: 'Failed to create room' })
            }
        })

        // Get room info (for invite page)
        socket.on('room:info', (code: string, callback: (result: { success: boolean; hostName?: string; playerCount?: number; error?: string }) => void) => {
            const room = rooms.get(code.toUpperCase())

            if (!room) {
                callback({ success: false, error: 'Sala não encontrada' })
                return
            }

            const host = room.players.find(p => p.isHost)
            callback({
                success: true,
                hostName: host?.nickname || 'Alguém',
                playerCount: room.players.length
            })
        })

        // Join room
        socket.on('room:join', (code: string, nickname: string, callback: (result: { success: boolean; sessionToken?: string; error?: string }) => void) => {
            const room = rooms.get(code.toUpperCase())

            if (!room) {
                callback({ success: false, error: 'Sala não encontrada' })
                return
            }

            // Check if player is already in the room (reconnection)
            const existingPlayer = room.players.find(p => p.id === socket.id)
            if (existingPlayer) {
                existingPlayer.isConnected = true
                socket.join(room.code)
                callback({ success: true })
                socket.emit('room:state', room)

                // Resync timer if game is in progress
                resyncTimerForSocket(socket, room.code)
                return
            }

            // Validate join
            const validation = canJoinRoom(room, nickname)
            if (!validation.ok) {
                callback({ success: false, error: validation.error })
                return
            }

            const player = createPlayer(socket.id, nickname)
            addPlayerToRoom(room, player)
            playerRooms.set(socket.id, room.code)
            socket.join(room.code)

            // Generate and save session token
            const newToken = generateSessionToken()
            sessionTokens.set(newToken, {
                token: newToken,
                roomCode: room.code,
                nickname,
                createdAt: Date.now()
            })

            callback({ success: true, sessionToken: newToken })
            io.to(room.code).emit('room:state', room)
            socket.to(room.code).emit('room:playerJoined', player)

            console.log(`${nickname} joined room ${room.code}`)
        })

        // Rejoin room (for reconnection scenarios)
        socket.on('room:rejoin', (code: string, callback: (result: { success: boolean; error?: string }) => void) => {
            const room = rooms.get(code.toUpperCase())

            if (!room) {
                callback({ success: false, error: 'Sala não encontrada' })
                return
            }

            // Allow rejoin - just reconnect the socket
            socket.join(room.code)
            playerRooms.set(socket.id, room.code)

            callback({ success: true })
            socket.emit('room:state', room)

            // Resync timer
            resyncTimerForSocket(socket, room.code)
        })

        // Request current state (for resync after reconnection)
        socket.on('game:requestState', () => {
            const roomCode = playerRooms.get(socket.id)
            if (!roomCode) return

            const room = rooms.get(roomCode)
            if (!room) return

            socket.emit('room:state', room)
            resyncTimerForSocket(socket, roomCode)
        })

        // Leave room
        socket.on('room:leave', () => {
            // Clear session token on intentional leave
            if (sessionToken) {
                sessionTokens.delete(sessionToken)
            }
            handlePlayerLeave(socket.id)
        })

        // Host kicks a player
        socket.on('room:kickPlayer', (targetPlayerId: string, callback: (result: { success: boolean; error?: string }) => void) => {
            const roomCode = playerRooms.get(socket.id)
            if (!roomCode) {
                callback({ success: false, error: 'Sala não encontrada' })
                return
            }

            const room = rooms.get(roomCode)
            if (!room) {
                callback({ success: false, error: 'Sala não encontrada' })
                return
            }

            const hostPlayer = room.players.find(p => p.id === socket.id)
            if (!hostPlayer?.isHost) {
                callback({ success: false, error: 'Apenas o host pode remover jogadores' })
                return
            }

            const targetPlayer = room.players.find(p => p.id === targetPlayerId)
            if (!targetPlayer) {
                callback({ success: false, error: 'Jogador não encontrado' })
                return
            }

            if (targetPlayer.isHost) {
                callback({ success: false, error: 'Não é possível remover o host' })
                return
            }

            // Clear session token for kicked player
            Array.from(sessionTokens.entries()).forEach(([token, session]) => {
                if (session.roomCode === roomCode && session.nickname === targetPlayer.nickname) {
                    sessionTokens.delete(token)
                }
            })

            // Remove player
            handlePlayerLeave(targetPlayerId)

            // Notify the kicked player
            io.to(targetPlayerId).emit('room:kicked')

            callback({ success: true })
            console.log(`Host kicked ${targetPlayer.nickname} from room ${roomCode}`)
        })

        // Start game
        socket.on('game:start', () => {
            const roomCode = playerRooms.get(socket.id)
            if (!roomCode) return

            const room = rooms.get(roomCode)
            if (!room) return

            const player = room.players.find(p => p.id === socket.id)
            if (!player?.isHost) {
                socket.emit('room:error', 'Apenas o host pode iniciar o jogo')
                return
            }

            const validation = canStartGame(room)
            if (!validation.ok) {
                socket.emit('room:error', validation.error)
                return
            }

            // Reset game state if restarting
            resetGameState(room)

            // Start first round
            startNewRound(room)

            io.to(room.code).emit('room:state', room)
            io.to(room.code).emit('game:roundStart', room.currentRound!)

            // No timer for clue phase - unlimited time

            console.log(`Game started in room ${roomCode}`)
        })

        // Give clue
        socket.on('game:giveClue', (clue: string) => {
            const roomCode = playerRooms.get(socket.id)
            if (!roomCode) return

            const room = rooms.get(roomCode)
            if (!room || !room.currentRound) return

            if (room.currentRound.seerId !== socket.id) {
                socket.emit('room:error', 'Você não é o Vidente desta rodada')
                return
            }

            if (room.currentRound.phase !== 'waiting_clue') return

            clearRoomTimer(roomCode)

            room.currentRound.clue = clue
            room.currentRound.phase = 'guessing'
            room.currentRound.startTime = Date.now()

            io.to(room.code).emit('room:state', room)
            io.to(room.code).emit('game:clueGiven', clue)

            startGuessTimer(roomCode)

            console.log(`Clue given in room ${roomCode}: ${clue}`)
        })

        // Submit guess
        socket.on('game:submitGuess', (position: number) => {
            const roomCode = playerRooms.get(socket.id)
            if (!roomCode) return

            const room = rooms.get(roomCode)
            if (!room || !room.currentRound) return

            if (room.currentRound.phase !== 'guessing') return

            if (room.currentRound.seerId === socket.id) {
                socket.emit('room:error', 'Vidente não pode dar palpite')
                return
            }

            const player = room.players.find(p => p.id === socket.id)
            if (!player || player.hasGuessed) return

            const clampedPosition = Math.max(0, Math.min(100, position))

            player.guessPosition = clampedPosition
            player.hasGuessed = true
            room.currentRound.guesses[socket.id] = clampedPosition

            io.to(room.code).emit('room:state', room)
            io.to(room.code).emit('game:playerGuessed', socket.id)

            console.log(`${player.nickname} guessed ${clampedPosition} in room ${roomCode}`)

            if (allPlayersGuessed(room)) {
                clearRoomTimer(roomCode)
                endRound(roomCode)
            }
        })

        // Player ready for next round
        socket.on('game:ready', () => {
            const roomCode = playerRooms.get(socket.id)
            if (!roomCode) return

            const room = rooms.get(roomCode)
            if (!room || !room.currentRound || room.currentRound.phase !== 'revealed') return

            // Initialize ready set for this room if needed
            if (!readyPlayers.has(roomCode)) {
                readyPlayers.set(roomCode, new Set())
            }

            const ready = readyPlayers.get(roomCode)!
            ready.add(socket.id)

            io.to(roomCode).emit('game:playerReady', socket.id)

            // Check if all connected players are ready (including seer)
            const connectedPlayers = room.players.filter(p => p.isConnected)
            if (ready.size >= connectedPlayers.length) {
                // Cancel the auto-advance timeout
                const timeout = nextRoundTimeouts.get(roomCode)
                if (timeout) {
                    clearTimeout(timeout)
                    nextRoundTimeouts.delete(roomCode)
                }

                // Clear ready state
                readyPlayers.delete(roomCode)

                // Emit all ready event
                io.to(roomCode).emit('game:allReady')

                // Start next round immediately
                if (room.status === 'playing') {
                    startNewRound(room)
                    io.to(roomCode).emit('room:state', room)
                    io.to(roomCode).emit('game:roundStart', room.currentRound)
                }
            }
        })

        // Disconnect
        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id)
            handlePlayerDisconnect(socket.id)
        })

        // Helper functions
        function handlePlayerDisconnect(playerId: string) {
            const roomCode = playerRooms.get(playerId)
            if (!roomCode) return

            const room = rooms.get(roomCode)
            if (!room) return

            const player = room.players.find(p => p.id === playerId)
            if (player) {
                player.isConnected = false
            }

            // Notify others of disconnection - player stays in room but marked offline
            io.to(room.code).emit('room:state', room)

            console.log(`${player?.nickname || 'Player'} is now offline in room ${roomCode}`)
        }

        function handlePlayerLeave(playerId: string) {
            const roomCode = playerRooms.get(playerId)
            if (!roomCode) return

            const room = rooms.get(roomCode)
            if (!room) return

            removePlayerFromRoom(room, playerId)
            playerRooms.delete(playerId)

            io.to(room.code).emit('room:playerLeft', playerId)
            io.to(room.code).emit('room:state', room)

            if (room.players.length === 0) {
                clearRoomTimer(roomCode)
                timerStates.delete(roomCode)
                rooms.delete(roomCode)
                console.log(`Room ${roomCode} deleted (empty)`)
            }
        }

        function startClueTimer(roomCode: string) {
            const room = rooms.get(roomCode)
            if (!room) return

            const duration = room.timePerClue * 1000
            const endTime = Date.now() + duration

            timerStates.set(roomCode, { endTime, phase: 'clue' })

            const timer = setInterval(() => {
                const state = timerStates.get(roomCode)
                if (!state) {
                    clearInterval(timer)
                    return
                }

                const timeLeft = Math.max(0, Math.ceil((state.endTime - Date.now()) / 1000))

                const timerUpdate: TimerUpdate = {
                    secondsLeft: timeLeft,
                    serverTime: Date.now(),
                    phase: 'clue'
                }
                io.to(roomCode).emit('game:timerUpdate', timerUpdate)

                if (timeLeft <= 0) {
                    clearInterval(timer)
                    roomTimers.delete(roomCode)
                    timerStates.delete(roomCode)

                    const currentRoom = rooms.get(roomCode)
                    if (currentRoom?.currentRound?.phase === 'waiting_clue') {
                        currentRoom.currentRound.clue = '...'
                        currentRoom.currentRound.phase = 'guessing'
                        currentRoom.currentRound.startTime = Date.now()

                        io.to(roomCode).emit('room:state', currentRoom)
                        io.to(roomCode).emit('game:clueGiven', '...')

                        startGuessTimer(roomCode)
                    }
                }
            }, 1000)

            roomTimers.set(roomCode, timer)
        }

        function startGuessTimer(roomCode: string) {
            const room = rooms.get(roomCode)
            if (!room) return

            const duration = room.timePerGuess * 1000
            const endTime = Date.now() + duration

            timerStates.set(roomCode, { endTime, phase: 'guess' })

            const timer = setInterval(() => {
                const state = timerStates.get(roomCode)
                if (!state) {
                    clearInterval(timer)
                    return
                }

                const timeLeft = Math.max(0, Math.ceil((state.endTime - Date.now()) / 1000))

                const timerUpdate: TimerUpdate = {
                    secondsLeft: timeLeft,
                    serverTime: Date.now(),
                    phase: 'guess'
                }
                io.to(roomCode).emit('game:timerUpdate', timerUpdate)

                if (timeLeft <= 0) {
                    clearInterval(timer)
                    roomTimers.delete(roomCode)
                    timerStates.delete(roomCode)
                    endRound(roomCode)
                }
            }, 1000)

            roomTimers.set(roomCode, timer)
        }

        function resyncTimerForSocket(socket: any, roomCode: string) {
            const state = timerStates.get(roomCode)
            if (!state) return

            const timeLeft = Math.max(0, Math.ceil((state.endTime - Date.now()) / 1000))
            const timerUpdate: TimerUpdate = {
                secondsLeft: timeLeft,
                serverTime: Date.now(),
                phase: state.phase
            }
            socket.emit('game:timerUpdate', timerUpdate)
        }

        function clearRoomTimer(roomCode: string) {
            const timer = roomTimers.get(roomCode)
            if (timer) {
                clearInterval(timer)
                roomTimers.delete(roomCode)
            }
            timerStates.delete(roomCode)
        }

        function endRound(roomCode: string) {
            const room = rooms.get(roomCode)
            if (!room || !room.currentRound) return

            processRoundResults(room)

            io.to(roomCode).emit('game:roundResult', room.currentRound)
            io.to(roomCode).emit('room:state', room)

            if (room.status === 'finished') {
                io.to(roomCode).emit('game:finished', room)
                console.log(`Game finished in room ${roomCode}. Winner: ${room.winnerId}`)
            } else {
                // Clear any previous ready state
                readyPlayers.delete(roomCode)

                // Auto-start next round after 20 seconds (or earlier if all players ready)
                const timeout = setTimeout(() => {
                    nextRoundTimeouts.delete(roomCode)
                    readyPlayers.delete(roomCode)

                    const currentRoom = rooms.get(roomCode)
                    if (currentRoom && currentRoom.status === 'playing') {
                        startNewRound(currentRoom)
                        io.to(roomCode).emit('room:state', currentRoom)
                        io.to(roomCode).emit('game:roundStart', currentRoom.currentRound)
                        // No timer for clue phase - unlimited time
                    }
                }, 20000)

                nextRoundTimeouts.set(roomCode, timeout)
            }
        }
    })

    httpServer.listen(port, () => {
        console.log(`> Ready on http://${hostname}:${port}`)
    })
})
