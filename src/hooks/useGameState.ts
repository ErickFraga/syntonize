'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { getSocket, session } from '@/lib/socket'
import { sounds } from '@/lib/sounds'
import type { Room, Player, TimerUpdate, Notice, RoomSettings, JoinResult, SimpleResult, RoomInfo } from '@/types/game'

export interface Toast extends Notice {
    id: number
}

export interface TimerState {
    phase: TimerUpdate['phase']
    endsAt: number
}

let toastId = 0

export function useGameState() {
    const [room, setRoom] = useState<Room | null>(null)
    const [playerId, setPlayerId] = useState<string | null>(null)
    const [isConnected, setIsConnected] = useState(false)
    const [restoredCode, setRestoredCode] = useState<string | null>(null)
    const [toasts, setToasts] = useState<Toast[]>([])
    const [timer, setTimer] = useState<TimerState | null>(null)
    const [serverOffset, setServerOffset] = useState(0)
    const [wasKicked, setWasKicked] = useState(false)

    const pushToast = useCallback((notice: Notice, ttl = 3500) => {
        const id = ++toastId
        setToasts(prev => [...prev.slice(-3), { ...notice, id }])
        window.setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), ttl)
    }, [])

    useEffect(() => {
        const socket = getSocket()
        setPlayerId(session.getPlayerId())

        const onConnect = () => {
            setIsConnected(true)
            socket.emit('game:requestState')
        }
        const onDisconnect = () => setIsConnected(false)

        const onState = (next: Room) => {
            setRoom(next)
            // Timers only exist while a round is in progress.
            if (!next.currentRound || next.status !== 'playing') setTimer(null)
        }

        const onRestored = (data: { room: Room; playerId: string }) => {
            setRoom(data.room)
            setPlayerId(data.playerId)
            session.save(session.getToken() ?? '', data.playerId)
            setRestoredCode(data.room.code)
        }

        const onNotice = (notice: Notice) => pushToast(notice)
        const onError = (message: string) => pushToast({ kind: 'error', message })

        const onKicked = () => {
            session.clear()
            setRoom(null)
            setPlayerId(null)
            setWasKicked(true)
        }

        const onTimer = (update: TimerUpdate) => {
            setServerOffset(update.serverTime - Date.now())
            setTimer({ phase: update.phase, endsAt: update.endsAt })
        }

        const onRoundStart = () => {
            setTimer(null)
            sounds.roundStart()
        }
        const onClue = () => sounds.clue()
        const onReveal = () => {
            setTimer(null)
            sounds.reveal()
        }
        const onFinished = () => {
            setTimer(null)
            sounds.finish()
        }

        socket.on('connect', onConnect)
        socket.on('disconnect', onDisconnect)
        socket.on('room:state', onState)
        socket.on('room:restored', onRestored)
        socket.on('room:notice', onNotice)
        socket.on('room:error', onError)
        socket.on('room:kicked', onKicked)
        socket.on('game:timer', onTimer)
        socket.on('game:roundStart', onRoundStart)
        socket.on('game:clueGiven', onClue)
        socket.on('game:reveal', onReveal)
        socket.on('game:finished', onFinished)

        if (socket.connected) onConnect()

        return () => {
            socket.off('connect', onConnect)
            socket.off('disconnect', onDisconnect)
            socket.off('room:state', onState)
            socket.off('room:restored', onRestored)
            socket.off('room:notice', onNotice)
            socket.off('room:error', onError)
            socket.off('room:kicked', onKicked)
            socket.off('game:timer', onTimer)
            socket.off('game:roundStart', onRoundStart)
            socket.off('game:clueGiven', onClue)
            socket.off('game:reveal', onReveal)
            socket.off('game:finished', onFinished)
        }
    }, [pushToast])

    // ---------- actions ----------

    const createRoom = useCallback((nickname: string) => {
        return new Promise<JoinResult>((resolve) => {
            getSocket().emit('room:create', nickname, (result) => {
                if (result.success && result.sessionToken && result.playerId) {
                    session.save(result.sessionToken, result.playerId)
                    session.saveNickname(nickname)
                    setPlayerId(result.playerId)
                }
                resolve(result)
            })
        })
    }, [])

    const joinRoom = useCallback((code: string, nickname: string) => {
        return new Promise<JoinResult>((resolve) => {
            getSocket().emit('room:join', code, nickname, (result) => {
                if (result.success && result.playerId) {
                    if (result.sessionToken) session.save(result.sessionToken, result.playerId)
                    session.saveNickname(nickname)
                    setPlayerId(result.playerId)
                }
                resolve(result)
            })
        })
    }, [])

    const getRoomInfo = useCallback((code: string) => {
        return new Promise<{ success: boolean; info?: RoomInfo; error?: string }>((resolve) => {
            getSocket().emit('room:info', code, resolve)
        })
    }, [])

    const leaveRoom = useCallback(() => {
        getSocket().emit('room:leave')
        session.clear()
        setRoom(null)
        setPlayerId(null)
        setTimer(null)
    }, [])

    const kickPlayer = useCallback((targetId: string) => {
        return new Promise<SimpleResult>((resolve) => getSocket().emit('room:kick', targetId, resolve))
    }, [])

    const updateSettings = useCallback((settings: Partial<RoomSettings>) => {
        return new Promise<SimpleResult>((resolve) => getSocket().emit('room:updateSettings', settings, resolve))
    }, [])

    const startGame = useCallback(() => getSocket().emit('game:start'), [])
    const giveClue = useCallback((clue: string) => {
        return new Promise<SimpleResult>((resolve) => getSocket().emit('game:giveClue', clue, resolve))
    }, [])
    const submitGuess = useCallback((position: number) => {
        return new Promise<SimpleResult>((resolve) => getSocket().emit('game:submitGuess', position, resolve))
    }, [])
    const setReady = useCallback(() => getSocket().emit('game:ready'), [])
    const nextRound = useCallback(() => getSocket().emit('game:nextRound'), [])
    const skipRound = useCallback(() => getSocket().emit('game:skipRound'), [])
    const backToLobby = useCallback(() => getSocket().emit('game:backToLobby'), [])

    // ---------- derived ----------

    const me: Player | null = useMemo(
        () => room?.players.find(p => p.id === playerId) ?? null,
        [room, playerId],
    )
    const isHost = !!me?.isHost
    const isSeer = !!room?.currentRound && room.currentRound.seerId === playerId

    return {
        room,
        me,
        playerId,
        isHost,
        isSeer,
        isConnected,
        restoredCode,
        wasKicked,
        toasts,
        timer,
        serverOffset,
        pushToast,
        createRoom,
        joinRoom,
        getRoomInfo,
        leaveRoom,
        kickPlayer,
        updateSettings,
        startGame,
        giveClue,
        submitGuess,
        setReady,
        nextRound,
        skipRound,
        backToLobby,
    }
}

/** Seconds left on a server-anchored timer, updated 4x per second. */
export function useCountdown(timer: TimerState | null, serverOffset: number): number | null {
    const [seconds, setSeconds] = useState<number | null>(null)

    useEffect(() => {
        if (!timer) {
            setSeconds(null)
            return
        }
        const compute = () => Math.max(0, Math.ceil((timer.endsAt - (Date.now() + serverOffset)) / 1000))
        setSeconds(compute())
        const id = window.setInterval(() => setSeconds(compute()), 250)
        return () => window.clearInterval(id)
    }, [timer, serverOffset])

    return seconds
}
