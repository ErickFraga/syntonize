'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useGameState } from '@/hooks/useGameState'
import styles from './page.module.css'

export default function JoinPage() {
    const params = useParams()
    const router = useRouter()
    const code = (params.code as string).toUpperCase()

    const { joinRoom, getRoomInfo, isConnected, error, sessionRestored, room } = useGameState()

    const [nickname, setNickname] = useState('')
    const [hostName, setHostName] = useState<string | null>(null)
    const [playerCount, setPlayerCount] = useState<number>(0)
    const [isJoining, setIsJoining] = useState(false)
    const [localError, setLocalError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    // Redirect to room if session was restored OR if we're already in a room
    useEffect(() => {
        if (sessionRestored) {
            router.push(`/room/${sessionRestored}`)
        } else if (room) {
            router.push(`/room/${room.code}`)
        }
    }, [sessionRestored, room, router])

    // Fetch room info to get host name via socket
    useEffect(() => {
        if (!isConnected) return

        const fetchRoomInfo = async () => {
            try {
                const result = await getRoomInfo(code)
                if (result.success) {
                    setHostName(result.hostName || null)
                    setPlayerCount(result.playerCount || 0)
                } else {
                    setLocalError(result.error || 'Sala não encontrada')
                }
            } catch {
                setLocalError('Erro ao buscar informações da sala')
            } finally {
                setIsLoading(false)
            }
        }

        fetchRoomInfo()
    }, [code, isConnected, getRoomInfo])

    const handleJoin = async () => {
        if (!nickname.trim()) {
            setLocalError('Digite seu nickname')
            return
        }

        setIsJoining(true)
        setLocalError(null)

        try {
            const result = await joinRoom(code, nickname.trim())
            if (result.success) {
                router.push(`/room/${code}`)
            } else {
                setLocalError(result.error || 'Erro ao entrar na sala')
            }
        } catch {
            setLocalError('Erro de conexão')
        } finally {
            setIsJoining(false)
        }
    }

    if (!isConnected || isLoading) {
        return (
            <main className="page">
                <div className={styles.loading}>
                    <div className={styles.spinnerIcon} />
                    <p>Conectando...</p>
                </div>
            </main>
        )
    }

    if (localError && !hostName) {
        return (
            <main className="page">
                <div className={`glass ${styles.errorCard}`}>
                    <h2>😕 Ops!</h2>
                    <p>{localError}</p>
                    <button className="btn btn-primary" onClick={() => router.push('/')}>
                        Voltar ao Início
                    </button>
                </div>
            </main>
        )
    }

    return (
        <main className="page">
            {(error || localError) && (
                <div className="error-toast">{error || localError}</div>
            )}

            <div className={styles.container}>
                <div className={styles.header}>
                    <h1 className={styles.title}>
                        <span className={styles.titleGradient}>Syntonize</span>
                    </h1>
                    <p className={styles.subtitle}>
                        {hostName ? `Sala de ${hostName}` : `Entrar na sala ${code}`}
                    </p>
                </div>

                <div className={`glass ${styles.card}`}>
                    <div className={styles.roomBadge}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        <span>Código: {code}</span>
                        {playerCount > 0 && <span className={styles.playerCount}>• {playerCount} jogador{playerCount !== 1 ? 'es' : ''}</span>}
                    </div>

                    <div className={styles.form}>
                        <div className={styles.inputGroup}>
                            <label htmlFor="nickname">Seu Nickname</label>
                            <input
                                id="nickname"
                                type="text"
                                className="input"
                                placeholder="Como quer ser chamado?"
                                value={nickname}
                                onChange={(e) => setNickname(e.target.value)}
                                maxLength={20}
                                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                                autoFocus
                            />
                        </div>

                        <button
                            className="btn btn-primary"
                            onClick={handleJoin}
                            disabled={!isConnected || isJoining}
                        >
                            {isJoining ? (
                                <>
                                    <div className={styles.btnSpinner} />
                                    Entrando...
                                </>
                            ) : (
                                <>
                                    Entrar na Sala
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M5 12h14" />
                                        <path d="m12 5 7 7-7 7" />
                                    </svg>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                <button
                    className={styles.backLink}
                    onClick={() => router.push('/')}
                >
                    Ou crie sua própria sala
                </button>
            </div>
        </main>
    )
}
