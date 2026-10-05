'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { getSocket, session } from '@/lib/socket'
import { sounds } from '@/lib/sounds'
import { useT } from '@/i18n/I18nProvider'
import type { Room, Player, TimerUpdate, Notice, RoomSettings, JoinResult, SimpleResult, RoomInfo, TeamId, Side, Message, ChatMessage, ChatInput, RoundHistory } from '@/types/game'
import { CHAT_LIMITS } from '@/types/game'

/** A toast is already translated text (server notices arrive as codes). */
export interface ToastInput {
    kind: Notice['kind']
    message: string
}

export interface Toast extends ToastInput {
    id: number
}

export interface TimerState {
    phase: TimerUpdate['phase']
    endsAt: number
}

/** Live needle of my team in team mode, as last relayed by the server. */
export interface RemoteNeedle {
    position: number
    by: string
    at: number
}

/** Client-side spacing of live needle updates (the server throttles too). */
const NEEDLE_SEND_MS = 80

let toastId = 0

const NO_HISTORY: RoundHistory = { rounds: [], skipped: [] }

export function useGameState() {
    // `room:state` arrives without the round history (see roomViewFor); it comes
    // in `game:history` and is merged back below, so components read `room.roundHistory`.
    const [roomState, setRoom] = useState<Room | null>(null)
    const [history, setHistory] = useState<RoundHistory>(NO_HISTORY)
    const [playerId, setPlayerId] = useState<string | null>(null)
    const [isConnected, setIsConnected] = useState(false)
    const [restoredCode, setRestoredCode] = useState<string | null>(null)
    const [toasts, setToasts] = useState<Toast[]>([])
    const [timer, setTimer] = useState<TimerState | null>(null)
    const [serverOffset, setServerOffset] = useState(0)
    const [wasKicked, setWasKicked] = useState(false)
    const [sessionLost, setSessionLost] = useState(false)
    const [remoteNeedle, setRemoteNeedle] = useState<RemoteNeedle | null>(null)
    const [chat, setChat] = useState<ChatMessage[]>([])
    const playerIdRef = useRef<string | null>(null)
    playerIdRef.current = playerId
    const roomRef = useRef<Room | null>(null)
    roomRef.current = roomState
    /** The socket dropped while we were in a room (server restart, flaky network). */
    const droppedInRoom = useRef(false)
    const needleSend = useRef<{ last: number; pending: number | null; timer: number | null }>({ last: 0, pending: null, timer: null })

    const { t, msg } = useT()
    // Socket listeners are bound once; read the current language through refs.
    const msgRef = useRef(msg)
    msgRef.current = msg
    const tRef = useRef(t)
    tRef.current = t

    const pushToast = useCallback((notice: ToastInput, ttl = 3500) => {
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
        const onDisconnect = () => {
            setIsConnected(false)
            if (roomRef.current) droppedInRoom.current = true
        }

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
            // Back after a drop (even if the server restarted): same screen, plus a heads-up.
            if (droppedInRoom.current) {
                droppedInRoom.current = false
                pushToast({ kind: 'success', message: tRef.current('room.reconnected') })
            }
        }

        // The token no longer matches a room (it expired or was deleted while we were away).
        const onSessionExpired = () => {
            session.clear()
            droppedInRoom.current = false
            if (!roomRef.current) return
            setRoom(null)
            setPlayerId(null)
            setTimer(null)
            setChat([])
            setSessionLost(true)
        }

        const onNotice = (notice: Notice) => pushToast({ kind: notice.kind, message: msgRef.current(notice) })
        const onError = (message: Message) => pushToast({ kind: 'error', message: msgRef.current(message) })

        const onKicked = () => {
            session.clear()
            setRoom(null)
            setPlayerId(null)
            setChat([])
            setHistory(NO_HISTORY)
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
        const onNeedle = (data: { position: number; by: string }) => setRemoteNeedle({ ...data, at: Date.now() })
        const onHistory = (next: RoundHistory) => setHistory(next)
        const onChatHistory = (messages: ChatMessage[]) => setChat(messages)
        let lastChatSound = 0
        const onChatMessage = (message: ChatMessage) => {
            setChat(prev => [...prev, message].slice(-CHAT_LIMITS.HISTORY))
            // One blip per burst of reactions is plenty.
            if (message.kind !== 'system' && message.authorId !== playerIdRef.current && Date.now() - lastChatSound > 600) {
                lastChatSound = Date.now()
                sounds.chat()
            }
        }

        socket.on('connect', onConnect)
        socket.on('disconnect', onDisconnect)
        socket.on('room:state', onState)
        socket.on('room:restored', onRestored)
        socket.on('room:sessionExpired', onSessionExpired)
        socket.on('room:notice', onNotice)
        socket.on('room:error', onError)
        socket.on('room:kicked', onKicked)
        socket.on('game:timer', onTimer)
        socket.on('game:roundStart', onRoundStart)
        socket.on('game:clueGiven', onClue)
        socket.on('game:reveal', onReveal)
        socket.on('game:finished', onFinished)
        socket.on('game:needle', onNeedle)
        socket.on('game:history', onHistory)
        socket.on('chat:history', onChatHistory)
        socket.on('chat:message', onChatMessage)

        if (socket.connected) onConnect()

        return () => {
            socket.off('connect', onConnect)
            socket.off('disconnect', onDisconnect)
            socket.off('room:state', onState)
            socket.off('room:restored', onRestored)
            socket.off('room:sessionExpired', onSessionExpired)
            socket.off('room:notice', onNotice)
            socket.off('room:error', onError)
            socket.off('room:kicked', onKicked)
            socket.off('game:timer', onTimer)
            socket.off('game:roundStart', onRoundStart)
            socket.off('game:clueGiven', onClue)
            socket.off('game:reveal', onReveal)
            socket.off('game:finished', onFinished)
            socket.off('game:needle', onNeedle)
            socket.off('game:history', onHistory)
            socket.off('chat:history', onChatHistory)
            socket.off('chat:message', onChatMessage)
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
        return new Promise<{ success: boolean; info?: RoomInfo; error?: Message }>((resolve) => {
            getSocket().emit('room:info', code, resolve)
        })
    }, [])

    const leaveRoom = useCallback(() => {
        getSocket().emit('room:leave')
        session.clear()
        setRoom(null)
        setPlayerId(null)
        setTimer(null)
        setChat([])
        setHistory(NO_HISTORY)
    }, [])

    const kickPlayer = useCallback((targetId: string) => {
        return new Promise<SimpleResult>((resolve) => getSocket().emit('room:kick', targetId, resolve))
    }, [])

    const updateSettings = useCallback((settings: Partial<RoomSettings>) => {
        return new Promise<SimpleResult>((resolve) => getSocket().emit('room:updateSettings', settings, resolve))
    }, [])

    const setTeam = useCallback((targetId: string, team: TeamId) => {
        return new Promise<SimpleResult>((resolve) => getSocket().emit('room:setTeam', targetId, team, resolve))
    }, [])

    /** Team mode: shares my needle drag with my team, at most every NEEDLE_SEND_MS (last value always sent). */
    const moveNeedle = useCallback((position: number) => {
        const state = needleSend.current
        const flush = () => {
            state.timer = null
            if (state.pending === null) return
            state.last = Date.now()
            getSocket().emit('game:needleMove', state.pending)
            state.pending = null
        }
        state.pending = position
        const wait = NEEDLE_SEND_MS - (Date.now() - state.last)
        if (wait <= 0) flush()
        else if (state.timer === null) state.timer = window.setTimeout(flush, wait)
    }, [])

    const sideGuess = useCallback((side: Side) => {
        return new Promise<SimpleResult>((resolve) => getSocket().emit('game:sideGuess', side, resolve))
    }, [])

    const sendChat = useCallback((input: ChatInput) => {
        return new Promise<SimpleResult>((resolve) => getSocket().emit('chat:send', input, resolve))
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

    const room: Room | null = useMemo(
        () => roomState && { ...roomState, roundHistory: history.rounds, skippedRounds: history.skipped },
        [roomState, history],
    )

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
        sessionLost,
        toasts,
        timer,
        serverOffset,
        remoteNeedle,
        chat,
        pushToast,
        createRoom,
        joinRoom,
        getRoomInfo,
        leaveRoom,
        kickPlayer,
        updateSettings,
        setTeam,
        moveNeedle,
        sideGuess,
        sendChat,
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
