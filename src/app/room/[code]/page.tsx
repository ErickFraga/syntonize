'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useGameState, useCountdown } from '@/hooks/useGameState'
import { session } from '@/lib/socket'
import { isMuted, setMuted } from '@/lib/sounds'
import { normalizeRoomCode } from '@shared/gameLogic'
import Lobby from '@/components/Lobby/Lobby'
import Game from '@/components/Game/Game'
import Results from '@/components/Results/Results'
import Logo from '@/components/ui/Logo'
import Toasts from '@/components/ui/Toasts'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { LogOutIcon, VolumeIcon, VolumeOffIcon, WifiOffIcon, CopyIcon, CheckIcon } from '@/components/ui/Icons'
import styles from './page.module.css'

type Stage = 'connecting' | 'resolving' | 'ready' | 'redirecting'

export default function RoomPage() {
    const params = useParams()
    const router = useRouter()
    const code = normalizeRoomCode(String(params.code ?? ''))

    const {
        room, me, isHost, isSeer, isConnected, wasKicked, toasts, timer, serverOffset,
        pushToast, joinRoom, leaveRoom, kickPlayer, updateSettings, startGame, giveClue,
        submitGuess, setReady, nextRound, skipRound, backToLobby,
    } = useGameState()

    const secondsLeft = useCountdown(timer, serverOffset)
    const [stage, setStage] = useState<Stage>('connecting')
    const [muted, setMutedState] = useState(false)
    const [copied, setCopied] = useState(false)
    const attemptedJoin = useRef(false)

    useEffect(() => {
        setMutedState(isMuted())
    }, [])

    // Resolve how this tab gets into the room:
    //  1. the socket already restored a session for this room -> ready
    //  2. we have a saved nickname -> join (or re-join) with it
    //  3. nothing to go on -> invite page, which asks for a nickname
    useEffect(() => {
        if (wasKicked) return
        if (!isConnected) {
            if (stage === 'connecting' || stage === 'resolving') setStage('connecting')
            return
        }
        if (room) {
            if (room.code !== code) {
                setStage('redirecting')
                router.replace(`/room/${room.code}`)
                return
            }
            setStage('ready')
            return
        }
        if (stage === 'ready') {
            // Had a room, lost it (left/kicked/deleted) -> home
            return
        }
        setStage('resolving')
        if (attemptedJoin.current) return

        // Give the server a moment to restore the session before falling back.
        const id = window.setTimeout(async () => {
            if (attemptedJoin.current) return
            attemptedJoin.current = true
            const nickname = session.getNickname()
            if (!nickname) {
                router.replace(`/join/${code}`)
                return
            }
            const result = await joinRoom(code, nickname)
            if (!result.success) {
                pushToast({ kind: 'error', message: result.error ?? 'Não deu para entrar na sala' })
                router.replace(`/join/${code}`)
            }
        }, 900)
        return () => window.clearTimeout(id)
    }, [isConnected, room, code, stage, wasKicked, joinRoom, router, pushToast])

    const handleLeave = () => {
        if (room?.status === 'playing' && !window.confirm('Sair agora? Você perde seu lugar na partida.')) return
        leaveRoom()
        router.push('/')
    }

    const toggleMute = () => {
        const next = !muted
        setMuted(next)
        setMutedState(next)
    }

    const copyCode = async () => {
        if (!room) return
        try {
            await navigator.clipboard.writeText(`${window.location.origin}/join/${room.code}`)
            setCopied(true)
            pushToast({ kind: 'success', message: 'Link de convite copiado!' })
            window.setTimeout(() => setCopied(false), 1800)
        } catch {
            pushToast({ kind: 'warning', message: `Código da sala: ${room.code}` })
        }
    }

    const notify = (message: string, kind: 'info' | 'success' | 'warning' | 'error' = 'info') => pushToast({ kind, message })

    if (wasKicked) {
        return (
            <main className="page">
                <div className={`card ${styles.stateCard} anim-pop`}>
                    <Logo size="sm" />
                    <h1>Você foi removido da sala</h1>
                    <p className="muted">O anfitrião tirou você da partida. Sem drama: dá para criar a sua própria.</p>
                    <button className="btn btn-primary" onClick={() => router.push('/')}>Voltar ao início</button>
                </div>
            </main>
        )
    }

    if (!room || stage !== 'ready') {
        return (
            <main className="page">
                <div className={`${styles.loading} anim-fade-in`}>
                    <Logo size="md" />
                    <span className="spinner" />
                    <p className="muted">{!isConnected ? 'Conectando ao servidor…' : 'Entrando na sala…'}</p>
                </div>
            </main>
        )
    }

    return (
        <main className={styles.room}>
            <Toasts toasts={toasts} />

            <header className={styles.header}>
                <div className={styles.brand}>
                    <Logo size="sm" />
                </div>

                <button className={styles.codeChip} onClick={copyCode} title="Copiar link de convite">
                    <span className={styles.codeLabel}>sala</span>
                    <span className={styles.codeValue}>{room.code}</span>
                    {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                </button>

                <div className={styles.headerActions}>
                    {!isConnected && (
                        <span className={styles.offline}><WifiOffIcon size={16} /> reconectando…</span>
                    )}
                    <ThemeToggle />
                    <button className="btn-icon" onClick={toggleMute} title={muted ? 'Ativar sons' : 'Silenciar'} aria-label={muted ? 'Ativar sons' : 'Silenciar'}>
                        {muted ? <VolumeOffIcon size={18} /> : <VolumeIcon size={18} />}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={handleLeave}>
                        <LogOutIcon size={16} /> Sair
                    </button>
                </div>
            </header>

            <div className={styles.content}>
                {room.status === 'waiting' && (
                    <Lobby
                        room={room}
                        me={me}
                        isHost={isHost}
                        onStartGame={startGame}
                        onKickPlayer={(id) => kickPlayer(id).then(r => { if (!r.success && r.error) notify(r.error, 'error') })}
                        onUpdateSettings={(s) => updateSettings(s).then(r => { if (!r.success && r.error) notify(r.error, 'error') })}
                        onNotify={notify}
                    />
                )}

                {room.status === 'playing' && room.currentRound && (
                    <Game
                        room={room}
                        me={me}
                        isHost={isHost}
                        isSeer={isSeer}
                        secondsLeft={secondsLeft}
                        timerPhase={timer?.phase ?? null}
                        onGiveClue={giveClue}
                        onSubmitGuess={submitGuess}
                        onSetReady={setReady}
                        onNextRound={nextRound}
                        onSkipRound={skipRound}
                    />
                )}

                {room.status === 'finished' && (
                    <Results
                        room={room}
                        me={me}
                        isHost={isHost}
                        onPlayAgain={startGame}
                        onBackToLobby={backToLobby}
                        onLeave={handleLeave}
                    />
                )}
            </div>
        </main>
    )
}
