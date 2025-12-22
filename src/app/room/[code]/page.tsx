'use client'

import { useEffect, useState } from 'react'
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
        joinRoom,
        rejoinRoom,
        leaveRoom,
        startGame,
        giveClue,
        submitGuess
    } = useGameState()

    const [isLoading, setIsLoading] = useState(true)
    const [joinError, setJoinError] = useState<string | null>(null)
    const [hasAttemptedJoin, setHasAttemptedJoin] = useState(false)

    useEffect(() => {
        // Wait for socket connection
        if (!isConnected) return

        // Already in a room
        if (room?.code === code.toUpperCase()) {
            setIsLoading(false)
            return
        }

        // Already attempted join
        if (hasAttemptedJoin) return

        const attemptJoin = async () => {
            setHasAttemptedJoin(true)

            const savedNickname = sessionStorage.getItem('syntonize-nickname')
            const savedRoom = sessionStorage.getItem('syntonize-room')

            // Case 1: User just created/joined this room (has nickname)
            if (savedNickname && savedRoom === code.toUpperCase()) {
                // Try rejoin first (reconnection scenario)
                const rejoinResult = await rejoinRoom(code.toUpperCase())
                if (rejoinResult.success) {
                    setIsLoading(false)
                    return
                }
            }

            // Case 2: User has nickname but different room - try to join
            if (savedNickname) {
                try {
                    const result = await joinRoom(code.toUpperCase(), savedNickname)
                    if (result.success) {
                        setIsLoading(false)
                        return
                    }

                    // If nickname in use, redirect to home
                    if (result.error === 'Nickname já em uso') {
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

            // Case 3: No nickname - redirect to home
            router.push('/')
        }

        attemptJoin()
    }, [code, isConnected, room, hasAttemptedJoin, joinRoom, rejoinRoom, router])

    const handleLeave = () => {
        leaveRoom()
        router.push('/')
    }

    const copyRoomLink = () => {
        const url = window.location.href
        navigator.clipboard.writeText(url)
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
                <div className={styles.roomInfo}>
                    <span className={styles.roomCode}>Sala: {room.code}</span>
                    <button className={styles.copyBtn} onClick={copyRoomLink} title="Copiar link">
                        📋
                    </button>
                </div>

                {timer > 0 && (
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
                    />
                )}

                {room.status === 'playing' && room.currentRound && (
                    <Game
                        room={room}
                        currentPlayer={currentPlayer}
                        isSeer={isSeer}
                        timer={timer}
                        onGiveClue={giveClue}
                        onSubmitGuess={submitGuess}
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
