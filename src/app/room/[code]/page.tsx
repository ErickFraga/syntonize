'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useGameState, useCountdown } from '@/hooks/useGameState'
import { session } from '@/lib/socket'
import { isMuted, setMuted } from '@/lib/sounds'
import { normalizeRoomCode, canSendChatText } from '@shared/gameLogic'
import type { Message } from '@/types/game'
import Lobby from '@/components/Lobby/Lobby'
import Game from '@/components/Game/Game'
import Results from '@/components/Results/Results'
import TeamGame from '@/components/TeamGame/TeamGame'
import TeamResults from '@/components/TeamResults/TeamResults'
import Chat from '@/components/Chat/Chat'
import Logo from '@/components/ui/Logo'
import Toasts from '@/components/ui/Toasts'
import LanguageSelect from '@/components/LanguageSelect/LanguageSelect'
import { useT } from '@/i18n/I18nProvider'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { LogOutIcon, VolumeIcon, VolumeOffIcon, WifiOffIcon, CopyIcon, CheckIcon } from '@/components/ui/Icons'
import styles from './page.module.css'

type Stage = 'connecting' | 'resolving' | 'ready' | 'redirecting'

export default function RoomPage() {
    const params = useParams()
    const router = useRouter()
    const { t, msg } = useT()
    const code = normalizeRoomCode(String(params.code ?? ''))

    const {
        room, me, isHost, isSeer, isConnected, wasKicked, sessionLost, toasts, timer, serverOffset, remoteNeedle, chat,
        pushToast, joinRoom, leaveRoom, kickPlayer, updateSettings, setTeam, moveNeedle, sideGuess, sendChat, startGame, giveClue,
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
        if (wasKicked || sessionLost) return
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
                pushToast({ kind: 'error', message: msg(result.error, 'error.joinRoom') })
                router.replace(`/join/${code}`)
            }
        }, 900)
        return () => window.clearTimeout(id)
    }, [isConnected, room, code, stage, wasKicked, sessionLost, joinRoom, router, pushToast])

    const handleLeave = () => {
        if (room?.status === 'playing' && !window.confirm(t('room.leaveConfirm'))) return
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
            pushToast({ kind: 'success', message: t('room.linkCopied') })
            window.setTimeout(() => setCopied(false), 1800)
        } catch {
            pushToast({ kind: 'warning', message: t('room.codeIs', { code: room.code }) })
        }
    }

    const notify = (message: string, kind: 'info' | 'success' | 'warning' | 'error' = 'info') => pushToast({ kind, message })
    const notifyError = (r: { success: boolean; error?: Message }) => { if (!r.success && r.error) notify(msg(r.error), 'error') }

    if (wasKicked) {
        return (
            <main className="page">
                <div className={`card ${styles.stateCard} anim-pop`}>
                    <Logo size="sm" />
                    <h1>{t('room.kickedTitle')}</h1>
                    <p className="muted">{t('room.kickedText')}</p>
                    <button className="btn btn-primary" onClick={() => router.push('/')}>{t('room.backHome')}</button>
                </div>
            </main>
        )
    }

    if (sessionLost) {
        return (
            <main className="page">
                <div className={`card ${styles.stateCard} anim-pop`}>
                    <Logo size="sm" />
                    <h1>{t('room.sessionLostTitle')}</h1>
                    <p className="muted">{t('room.sessionLostText')}</p>
                    <button className="btn btn-primary" onClick={() => router.push('/')}>{t('room.backHome')}</button>
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
                    <p className="muted">{!isConnected ? t('common.connecting') : t('room.joining')}</p>
                </div>
            </main>
        )
    }

    const inGame = room.status === 'playing' && !!room.currentRound
    const chatPanel = (
        <Chat
            messages={chat}
            meId={me?.id ?? null}
            playerCount={room.players.length}
            onSend={sendChat}
            docked={inGame}
            textLocked={me && !canSendChatText(room, me.id) ? t('chat.seerLocked') : null}
        />
    )

    return (
        <main className={styles.room}>
            <Toasts toasts={toasts} />

            <header className={styles.header}>
                <div className={styles.brand}>
                    <Logo size="sm" />
                </div>

                <button className={styles.codeChip} onClick={copyCode} title={t('room.copyInvite')}>
                    <span className={styles.codeLabel}>{t('room.codeLabel')}</span>
                    <span className={styles.codeValue}>{room.code}</span>
                    {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                </button>

                <div className={styles.headerActions}>
                    {!isConnected && (
                        <span className={styles.offline}><WifiOffIcon size={16} /> {t('common.reconnecting')}</span>
                    )}
                    <LanguageSelect />
                    <ThemeToggle />
                    <button className="btn-icon" onClick={toggleMute} title={muted ? t('room.unmute') : t('room.mute')} aria-label={muted ? t('room.unmute') : t('room.mute')}>
                        {muted ? <VolumeOffIcon size={18} /> : <VolumeIcon size={18} />}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={handleLeave}>
                        <LogOutIcon size={16} /> {t('room.leave')}
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
                        onKickPlayer={(id) => kickPlayer(id).then(notifyError)}
                        onUpdateSettings={(s) => updateSettings(s).then(notifyError)}
                        onSetTeam={(id, team) => setTeam(id, team).then(notifyError)}
                        onNotify={notify}
                    />
                )}

                {room.status === 'playing' && room.currentRound?.teamPlay && (
                    <TeamGame
                        room={room}
                        me={me}
                        isHost={isHost}
                        isSeer={isSeer}
                        secondsLeft={secondsLeft}
                        timerPhase={timer?.phase ?? null}
                        remoteNeedle={remoteNeedle}
                        onGiveClue={giveClue}
                        onSubmitGuess={submitGuess}
                        onNeedleMove={moveNeedle}
                        onSideGuess={sideGuess}
                        onSetReady={setReady}
                        onNextRound={nextRound}
                        onSkipRound={skipRound}
                        chat={chatPanel}
                    />
                )}

                {room.status === 'playing' && room.currentRound && !room.currentRound.teamPlay && (
                    <Game
                        room={room}
                        me={me}
                        isHost={isHost}
                        isSeer={isSeer}
                        secondsLeft={secondsLeft}
                        timerPhase={timer?.phase === 'side' ? null : timer?.phase ?? null}
                        onGiveClue={giveClue}
                        onSubmitGuess={submitGuess}
                        onSetReady={setReady}
                        onNextRound={nextRound}
                        onSkipRound={skipRound}
                        chat={chatPanel}
                    />
                )}

                {!inGame && chatPanel}

                {room.status === 'finished' && room.settings.mode === 'teams' && (
                    <TeamResults
                        room={room}
                        me={me}
                        isHost={isHost}
                        onPlayAgain={startGame}
                        onBackToLobby={backToLobby}
                        onLeave={handleLeave}
                    />
                )}

                {room.status === 'finished' && room.settings.mode !== 'teams' && (
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
