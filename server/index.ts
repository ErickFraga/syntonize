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
        console.log('Client connected:', socket.id)

        // Create room
        socket.on('room:create', (nickname: string, callback: (result: { success: boolean; code?: string; error?: string }) => void) => {
            try {
                const code = generateRoomCode(getExistingCodes())
                const room = createRoom(socket.id, nickname, code)

                rooms.set(code, room)
                playerRooms.set(socket.id, code)
                socket.join(code)

                callback({ success: true, code })
                socket.emit('room:state', room)

                console.log(`Room ${code} created by ${nickname}`)
            } catch (error) {
                console.error('Error creating room:', error)
                callback({ success: false, error: 'Failed to create room' })
            }
        })

        // Join room
        socket.on('room:join', (code: string, nickname: string, callback: (result: { success: boolean; error?: string }) => void) => {
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

            callback({ success: true })
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
            handlePlayerLeave(socket.id)
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

            startClueTimer(room.code)

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

            // Notify others of disconnection
            io.to(room.code).emit('room:state', room)

            // If room is waiting, remove player after delay
            if (room.status === 'waiting') {
                setTimeout(() => {
                    const currentRoom = rooms.get(roomCode)
                    const currentPlayer = currentRoom?.players.find(p => p.id === playerId)
                    if (currentPlayer && !currentPlayer.isConnected) {
                        handlePlayerLeave(playerId)
                    }
                }, 30000) // 30 second grace period
            }
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
                // Auto-start next round after 5 seconds
                setTimeout(() => {
                    const currentRoom = rooms.get(roomCode)
                    if (currentRoom && currentRoom.status === 'playing') {
                        startNewRound(currentRoom)
                        io.to(roomCode).emit('room:state', currentRoom)
                        io.to(roomCode).emit('game:roundStart', currentRoom.currentRound)
                        startClueTimer(roomCode)
                    }
                }, 5000)
            }
        }
    })

    httpServer.listen(port, () => {
        console.log(`> Ready on http://${hostname}:${port}`)
    })
})
