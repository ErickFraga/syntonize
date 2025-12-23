'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getSocket, saveSessionToken, clearSessionToken } from '@/lib/socket'
import { Room, Player, TimerUpdate } from '@/types/game'

export function useGameState() {
    const [room, setRoom] = useState<Room | null>(null)
    const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null)
    const [timer, setTimer] = useState<number>(0)
    const [error, setError] = useState<string | null>(null)
    const [isConnected, setIsConnected] = useState(false)
    const [sessionRestored, setSessionRestored] = useState<string | null>(null) // room code if restored
    const [readyPlayers, setReadyPlayers] = useState<Set<string>>(new Set())

    // Track server time offset for accurate timer display
    const serverTimeOffset = useRef<number>(0)

    useEffect(() => {
        const socket = getSocket()

        const onConnect = () => {
            setIsConnected(true)
            setError(null)
        }

        const onDisconnect = () => {
            setIsConnected(false)
        }

        const onRoomState = (newRoom: Room) => {
            setRoom(newRoom)

            // Store room code for quick reference
            sessionStorage.setItem('syntonize-room', newRoom.code)

            const player = newRoom.players.find(p => p.id === socket.id)
            if (player) {
                setCurrentPlayer(player)
            }
        }

        const onRoomRestored = (data: { room: Room; sessionToken: string }) => {
            setRoom(data.room)
            sessionStorage.setItem('syntonize-room', data.room.code)

            const player = data.room.players.find(p => p.id === socket.id)
            if (player) {
                setCurrentPlayer(player)
            }

            // Signal that session was restored - page will redirect
            setSessionRestored(data.room.code)
            console.log('Session restored for room:', data.room.code)
        }

        const onError = (message: string) => {
            setError(message)
            setTimeout(() => setError(null), 3000)
        }

        const onTimerUpdate = (timerData: TimerUpdate) => {
            // Calculate server time offset for accurate sync
            const now = Date.now()
            serverTimeOffset.current = timerData.serverTime - now

            setTimer(timerData.secondsLeft)
        }

        const onKicked = () => {
            setRoom(null)
            setCurrentPlayer(null)
            sessionStorage.removeItem('syntonize-room')
            clearSessionToken()
            setError('Você foi removido da sala pelo host')
        }

        const onPlayerReady = (playerId: string) => {
            setReadyPlayers(prev => new Set(prev).add(playerId))
        }

        const onAllReady = () => {
            setReadyPlayers(new Set())
        }

        const onRoundStart = () => {
            setReadyPlayers(new Set())
        }

        socket.on('connect', onConnect)
        socket.on('disconnect', onDisconnect)
        socket.on('room:state', onRoomState)
        socket.on('room:restored', onRoomRestored)
        socket.on('room:error', onError)
        socket.on('room:kicked', onKicked)
        socket.on('game:timerUpdate', onTimerUpdate)
        socket.on('game:playerReady', onPlayerReady)
        socket.on('game:allReady', onAllReady)
        socket.on('game:roundStart', onRoundStart)

        if (socket.connected) {
            setIsConnected(true)
            // Request state in case session was restored before hook mounted
            socket.emit('game:requestState')
        }

        return () => {
            socket.off('connect', onConnect)
            socket.off('disconnect', onDisconnect)
            socket.off('room:state', onRoomState)
            socket.off('room:restored', onRoomRestored)
            socket.off('room:error', onError)
            socket.off('room:kicked', onKicked)
            socket.off('game:timerUpdate', onTimerUpdate)
            socket.off('game:playerReady', onPlayerReady)
            socket.off('game:allReady', onAllReady)
            socket.off('game:roundStart', onRoundStart)
        }
    }, [])

    const createRoom = useCallback((nickname: string): Promise<{ success: boolean; code?: string; sessionToken?: string; error?: string }> => {
        return new Promise((resolve) => {
            const socket = getSocket()
            socket.emit('room:create', nickname, (result) => {
                if (result.success && result.code && result.sessionToken) {
                    sessionStorage.setItem('syntonize-nickname', nickname)
                    sessionStorage.setItem('syntonize-room', result.code)
                    saveSessionToken(result.sessionToken)
                }
                resolve(result)
            })
        })
    }, [])

    const joinRoom = useCallback((code: string, nickname: string): Promise<{ success: boolean; sessionToken?: string; error?: string }> => {
        return new Promise((resolve) => {
            const socket = getSocket()
            socket.emit('room:join', code, nickname, (result) => {
                if (result.success && result.sessionToken) {
                    sessionStorage.setItem('syntonize-nickname', nickname)
                    sessionStorage.setItem('syntonize-room', code)
                    saveSessionToken(result.sessionToken)
                }
                resolve(result)
            })
        })
    }, [])

    const rejoinRoom = useCallback((code: string): Promise<{ success: boolean; error?: string }> => {
        return new Promise((resolve) => {
            const socket = getSocket()
            socket.emit('room:rejoin', code, resolve)
        })
    }, [])

    const leaveRoom = useCallback(() => {
        const socket = getSocket()
        socket.emit('room:leave')
        setRoom(null)
        setCurrentPlayer(null)
        sessionStorage.removeItem('syntonize-room')
        clearSessionToken() // Clear token on intentional leave
    }, [])

    const startGame = useCallback(() => {
        const socket = getSocket()
        socket.emit('game:start')
    }, [])

    const giveClue = useCallback((clue: string) => {
        const socket = getSocket()
        socket.emit('game:giveClue', clue)
    }, [])

    const submitGuess = useCallback((position: number) => {
        const socket = getSocket()
        socket.emit('game:submitGuess', position)
    }, [])

    const getRoomInfo = useCallback((code: string): Promise<{ success: boolean; hostName?: string; playerCount?: number; error?: string }> => {
        return new Promise((resolve) => {
            const socket = getSocket()
            socket.emit('room:info', code, resolve)
        })
    }, [])

    const kickPlayer = useCallback((playerId: string): Promise<{ success: boolean; error?: string }> => {
        return new Promise((resolve) => {
            const socket = getSocket()
            socket.emit('room:kickPlayer', playerId, resolve)
        })
    }, [])

    const setReady = useCallback(() => {
        const socket = getSocket()
        socket.emit('game:ready')
    }, [])

    const isSeer = room?.currentRound?.seerId === currentPlayer?.id
    const isReady = currentPlayer ? readyPlayers.has(currentPlayer.id) : false

    return {
        room,
        currentPlayer,
        timer,
        error,
        isConnected,
        isSeer,
        isReady,
        readyPlayers,
        sessionRestored,
        createRoom,
        joinRoom,
        rejoinRoom,
        leaveRoom,
        startGame,
        giveClue,
        submitGuess,
        getRoomInfo,
        kickPlayer,
        setReady,
    }
}
