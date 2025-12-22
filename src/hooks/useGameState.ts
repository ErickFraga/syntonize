'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getSocket } from '@/lib/socket'
import { Room, Player, TimerUpdate } from '@/types/game'

export function useGameState() {
    const [room, setRoom] = useState<Room | null>(null)
    const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null)
    const [timer, setTimer] = useState<number>(0)
    const [error, setError] = useState<string | null>(null)
    const [isConnected, setIsConnected] = useState(false)

    // Track server time offset for accurate timer display
    const serverTimeOffset = useRef<number>(0)

    useEffect(() => {
        const socket = getSocket()

        const onConnect = () => {
            setIsConnected(true)
            setError(null)

            // Request state resync on reconnection
            const roomCode = sessionStorage.getItem('syntonize-room')
            if (roomCode) {
                socket.emit('game:requestState')
            }
        }

        const onDisconnect = () => {
            setIsConnected(false)
        }

        const onRoomState = (newRoom: Room) => {
            setRoom(newRoom)

            // Store room code for reconnection
            sessionStorage.setItem('syntonize-room', newRoom.code)

            const player = newRoom.players.find(p => p.id === socket.id)
            if (player) {
                setCurrentPlayer(player)
            }
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

        socket.on('connect', onConnect)
        socket.on('disconnect', onDisconnect)
        socket.on('room:state', onRoomState)
        socket.on('room:error', onError)
        socket.on('game:timerUpdate', onTimerUpdate)

        if (socket.connected) {
            setIsConnected(true)
        }

        return () => {
            socket.off('connect', onConnect)
            socket.off('disconnect', onDisconnect)
            socket.off('room:state', onRoomState)
            socket.off('room:error', onError)
            socket.off('game:timerUpdate', onTimerUpdate)
        }
    }, [])

    const createRoom = useCallback((nickname: string): Promise<{ success: boolean; code?: string; error?: string }> => {
        return new Promise((resolve) => {
            const socket = getSocket()
            socket.emit('room:create', nickname, (result) => {
                if (result.success && result.code) {
                    sessionStorage.setItem('syntonize-nickname', nickname)
                    sessionStorage.setItem('syntonize-room', result.code)
                }
                resolve(result)
            })
        })
    }, [])

    const joinRoom = useCallback((code: string, nickname: string): Promise<{ success: boolean; error?: string }> => {
        return new Promise((resolve) => {
            const socket = getSocket()
            socket.emit('room:join', code, nickname, (result) => {
                if (result.success) {
                    sessionStorage.setItem('syntonize-nickname', nickname)
                    sessionStorage.setItem('syntonize-room', code)
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

    const isSeer = room?.currentRound?.seerId === currentPlayer?.id

    return {
        room,
        currentPlayer,
        timer,
        error,
        isConnected,
        isSeer,
        createRoom,
        joinRoom,
        rejoinRoom,
        leaveRoom,
        startGame,
        giveClue,
        submitGuess,
    }
}
