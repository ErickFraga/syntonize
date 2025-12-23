'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useGameState } from '@/hooks/useGameState'
import Lobby from '@/components/Lobby/Lobby'
import Game from '@/components/Game/Game'
import Results from '@/components/Results/Results'
import styles from './page.module.css'

export default function RoomPage() {
    const params = useParams()
    const router = useRouter()
    const code = params.code as string

    const {
        room,
        currentPlayer,
        timer,
        error,
        isConnected,
        isSeer,
        isReady,
        readyPlayers,
        joinRoom,
        rejoinRoom,
        leaveRoom,
        startGame,
        giveClue,
        submitGuess,
        kickPlayer,
        setReady
    } = useGameState()

    const [isLoading, setIsLoading] = useState(true)
    const [joinError, setJoinError] = useState<string | null>(null)
    const [hasAttemptedJoin, setHasAttemptedJoin] = useState(false)

    // Ref to track current room value (fixes closure issue in async functions)
    const roomRef = useRef(room)
    roomRef.current = room

    useEffect(() => {
        console.log('[RoomPage] useEffect triggered:', { isConnected, roomCode: room?.code, hasAttemptedJoin })

        // Wait for socket connection
        if (!isConnected) {
            console.log('[RoomPage] Waiting for socket connection...')
            return
        }

        // Already in a room
        if (room?.code === code.toUpperCase()) {
            console.log('[RoomPage] Already in correct room, stopping loading')
            setIsLoading(false)
            return
        }

        // Already attempted join
        if (hasAttemptedJoin) {
            console.log('[RoomPage] Already attempted join, skipping')
            return
        }

        const attemptJoin = async () => {
            setHasAttemptedJoin(true)

            const savedNickname = sessionStorage.getItem('syntonize-nickname')
            const savedRoom = sessionStorage.getItem('syntonize-room')
            const sessionToken = localStorage.getItem('syntonize-session-token')

            console.log('[RoomPage] attemptJoin:', { savedNickname, savedRoom, sessionToken: sessionToken?.slice(0, 10), currentRoom: room?.code })

            // Case 1: User just created/joined this room (has nickname)
            if (savedNickname && savedRoom === code.toUpperCase()) {
                console.log('[RoomPage] Case 1: Has nickname and matching room, trying rejoin')
                const rejoinResult = await rejoinRoom(code.toUpperCase())
                console.log('[RoomPage] Rejoin result:', rejoinResult)
                if (rejoinResult.success) {
                    setIsLoading(false)
                    return
                }
            }

            // Case 2: User has nickname but different room - try to join
            if (savedNickname) {
                console.log('[RoomPage] Case 2: Has nickname, trying to join')
                try {
                    const result = await joinRoom(code.toUpperCase(), savedNickname)
                    console.log('[RoomPage] Join result:', result)
                    if (result.success) {
                        setIsLoading(false)
                        return
                    }

                    // If nickname in use, redirect to home
                    if (result.error === 'Nickname já em uso') {
                        console.log('[RoomPage] Nickname in use, redirecting to home')
                        sessionStorage.removeItem('syntonize-nickname')
                        router.push('/')
                        return
                    }

                    setJoinError(result.error || 'Erro ao entrar na sala')
                    setIsLoading(false)
                } catch {
                    setJoinError('Erro de conexão')
                    setIsLoading(false)
                }
                return
            }

            // Case 3: Check if there's a session token - if so, session restoration is in progress
            if (sessionToken) {
                console.log('[RoomPage] Case 3: Has token, waiting for session restoration...')
                // Token exists, session might be restoring - wait a bit then check again
                await new Promise(resolve => setTimeout(resolve, 500))

                // Use ref to get current room value (not the stale closure value)
                const currentRoom = roomRef.current
                console.log('[RoomPage] After wait, room:', currentRoom?.code)

                // If room was set during wait, we're good
                if (currentRoom) {
                    console.log('[RoomPage] Room restored during wait!')
                    setIsLoading(false)
                    return
                }

                // Token exists but session didn't restore - token might be invalid
                console.log('[RoomPage] Token invalid, clearing and redirecting')
                localStorage.removeItem('syntonize-session-token')
            }

            // No nickname and no valid session - redirect to home
            console.log('[RoomPage] No valid session, redirecting to home')
            router.push('/')
        }

        attemptJoin()
    }, [code, isConnected, room, hasAttemptedJoin, joinRoom, rejoinRoom, router])

    const handleLeave = () => {
        leaveRoom()
        router.push('/')
    }

    const copyRoomLink = () => {
        // Use /join/ route for invite links so users can enter their nickname
        const baseUrl = window.location.origin
        const inviteUrl = `${baseUrl}/join/${room?.code || code}`
        navigator.clipboard.writeText(inviteUrl)
    }

    if (isLoading || !isConnected) {
        return (
            <main className="page">
                <div className={styles.loading}>
                    <div className={styles.spinner} />
                    <p>Conectando à sala...</p>
                </div>
            </main>
        )
    }

    if (joinError) {
        return (
            <main className="page">
                <div className={`glass ${styles.errorCard}`}>
                    <h2>😕 Ops!</h2>
                    <p>{joinError}</p>
                    <button className="btn btn-primary" onClick={() => router.push('/')}>
                        Voltar ao Início
                    </button>
                </div>
            </main>
        )
    }

    if (!room) {
        return (
            <main className="page">
                <div className={styles.loading}>
                    <div className={styles.spinner} />
                    <p>Carregando sala...</p>
                </div>
            </main>
        )
    }

    return (
        <main className={styles.roomPage}>
            {error && <div className="error-toast">{error}</div>}

            <header className={styles.header}>
                <div className={styles.brand}>
                    <span>Syntonize</span>
                </div>

                {timer > 0 && room.currentRound?.phase === 'guessing' && (
                    <div className={`timer ${timer <= 10 ? 'warning' : ''} ${timer <= 5 ? 'danger' : ''}`}>
                        {timer}
                    </div>
                )}

                <button className={styles.leaveBtn} onClick={handleLeave}>
                    Sair
                </button>
            </header>

            <div className={styles.content}>
                {room.status === 'waiting' && (
                    <Lobby
                        room={room}
                        currentPlayer={currentPlayer}
                        onStartGame={startGame}
                        onCopyLink={copyRoomLink}
                        onKickPlayer={kickPlayer}
                    />
                )}

                {room.status === 'playing' && room.currentRound && (
                    <Game
                        room={room}
                        currentPlayer={currentPlayer}
                        isSeer={isSeer}
                        timer={timer}
                        isReady={isReady}
                        readyPlayers={readyPlayers}
                        onGiveClue={giveClue}
                        onSubmitGuess={submitGuess}
                        onSetReady={setReady}
                    />
                )}

                {room.status === 'finished' && (
                    <Results
                        room={room}
                        currentPlayer={currentPlayer}
                        onPlayAgain={startGame}
                        onLeave={handleLeave}
                    />
                )}
            </div>
        </main>
    )
}
