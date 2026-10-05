'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Room, Player, SimpleResult } from '@/types/game'
import { LIMITS } from '@/types/game'
import Dial, { type DialMarker } from '@/components/Dial/Dial'
import Avatar from '@/components/ui/Avatar'
import CountdownRing from '@/components/ui/CountdownRing'
import { EyeIcon, LockIcon, CheckIcon, SkipIcon, LightbulbIcon, ChevronRightIcon, SparklesIcon } from '@/components/ui/Icons'
import Scoreboard from './Scoreboard'
import { sounds } from '@/lib/sounds'
import styles from './Game.module.css'

interface GameProps {
    room: Room
    me: Player | null
    isHost: boolean
    isSeer: boolean
    secondsLeft: number | null
    timerPhase: 'clue' | 'guess' | 'next' | null
    onGiveClue: (clue: string) => Promise<SimpleResult>
    onSubmitGuess: (position: number) => Promise<SimpleResult>
    onSetReady: () => void
    onNextRound: () => void
    onSkipRound: () => void
}

const ZONE_LABEL: Record<number, string> = {
    4: 'Na mosca!',
    3: 'Quase lá',
    2: 'Pegou a vibe',
    0: 'Passou longe',
}

export default function Game({
    room,
    me,
    isHost,
    isSeer,
    secondsLeft,
    timerPhase,
    onGiveClue,
    onSubmitGuess,
    onSetReady,
    onNextRound,
    onSkipRound,
}: GameProps) {
    const round = room.currentRound!
    const seer = room.players.find(p => p.id === round.seerId)
    const phase = round.phase

    const [clue, setClue] = useState('')
    const [clueError, setClueError] = useState<string | null>(null)
    const [sending, setSending] = useState(false)
    const [needle, setNeedle] = useState(50)
    const [justRevealed, setJustRevealed] = useState(false)

    // Reset local state whenever a new round starts (skipped rounds keep the
    // same number, so key on the start timestamp).
    useEffect(() => {
        setClue('')
        setClueError(null)
        setSending(false)
        setNeedle(50)
    }, [round.startedAt])

    useEffect(() => {
        if (phase === 'revealed') {
            setJustRevealed(true)
            const id = window.setTimeout(() => setJustRevealed(false), 1200)
            return () => window.clearTimeout(id)
        }
        setJustRevealed(false)
    }, [phase, round.startedAt])

    // Tick in the last seconds of a guess.
    useEffect(() => {
        if (timerPhase === 'guess' && secondsLeft !== null && secondsLeft <= 5 && secondsLeft > 0) sounds.tick()
    }, [secondsLeft, timerPhase])

    const myGuess = me ? round.guesses[me.id] : undefined
    const hasLocked = !!me?.hasGuessed
    const guessers = useMemo(() => room.players.filter(p => p.id !== round.seerId), [room.players, round.seerId])
    const lockedCount = guessers.filter(p => p.hasGuessed).length
    const connectedCount = room.players.filter(p => p.isConnected).length
    const readyCount = room.players.filter(p => p.isConnected && p.isReady).length

    const submitClue = async () => {
        if (!clue.trim() || sending) return
        setSending(true)
        setClueError(null)
        const result = await onGiveClue(clue.trim())
        setSending(false)
        if (!result.success) setClueError(result.error ?? 'Não deu para enviar a dica')
    }

    const lockGuess = async () => {
        const result = await onSubmitGuess(needle)
        if (result.success) sounds.lock()
    }

    const markers: DialMarker[] = phase === 'revealed'
        ? guessers
            .filter(p => round.guesses[p.id] !== undefined)
            .map(p => ({ id: p.id, name: p.nickname, colorIndex: p.colorIndex, position: round.guesses[p.id], dim: (round.zones[p.id] ?? 0) === 0 }))
        : []

    const showTarget = phase === 'revealed' || (isSeer && round.targetPosition !== null)
    const dialNeedle = phase === 'revealed' ? null : isSeer ? null : hasLocked && myGuess !== undefined ? myGuess : needle

    const totalForTimer = timerPhase === 'guess' ? room.settings.timePerGuess : timerPhase === 'clue' ? room.settings.timePerClue : room.settings.timeBetweenRounds

    const resultRows = useMemo(() => {
        if (phase !== 'revealed') return []
        return room.players
            .filter(p => round.scores[p.id] !== undefined)
            .map(p => ({ player: p, points: round.scores[p.id] ?? 0, zone: round.zones[p.id], closest: round.closestIds.includes(p.id), isSeer: p.id === round.seerId }))
            .sort((a, b) => b.points - a.points || (a.isSeer ? 1 : 0) - (b.isSeer ? 1 : 0))
    }, [phase, room.players, round])

    return (
        <div className={styles.game}>
            <div className={styles.main}>
                {/* Round bar */}
                <div className={`${styles.roundBar} anim-fade-in`}>
                    <div className={styles.roundInfo}>
                        <span className="chip chip-accent">Rodada {round.roundNumber}</span>
                        <span className={styles.seerChip}>
                            <EyeIcon size={16} />
                            <span>Vidente</span>
                            {seer && <Avatar name={seer.nickname} colorIndex={seer.colorIndex} size="sm" offline={!seer.isConnected} />}
                            <strong>{seer?.nickname ?? '…'}{isSeer ? ' (você)' : ''}</strong>
                        </span>
                    </div>
                    {secondsLeft !== null && timerPhase && timerPhase !== 'next' && (
                        <CountdownRing seconds={secondsLeft} total={totalForTimer} label={timerPhase === 'guess' ? 'palpite' : 'dica'} />
                    )}
                </div>

                {/* Device */}
                <section className={`card-solid ${styles.device}`} key={round.startedAt}>
                    <Dial
                        target={showTarget ? round.targetPosition : null}
                        covered={!showTarget}
                        revealing={phase === 'revealed' && justRevealed}
                        needle={dialNeedle}
                        onNeedleChange={setNeedle}
                        interactive={phase === 'guessing' && !isSeer && !hasLocked}
                        locked={hasLocked}
                        markers={markers}
                    />

                    <div className={styles.concepts}>
                        <span className={styles.conceptLeft}>◀ {round.spectrumCard.leftConcept}</span>
                        <span className={styles.conceptRight}>{round.spectrumCard.rightConcept} ▶</span>
                    </div>

                    <div className={styles.clueArea}>
                        {round.clue ? (
                            <div className={`${styles.clue} anim-pop`}>
                                <span className="eyebrow">Dica de {seer?.nickname}</span>
                                <strong>&ldquo;{round.clue}&rdquo;</strong>
                            </div>
                        ) : (
                            <div className={styles.cluePending}>
                                <span className="eyebrow">Dica</span>
                                <span className={styles.cluePlaceholder}>{isSeer ? 'sua vez de pensar numa dica' : `${seer?.nickname ?? 'o Vidente'} está pensando…`}</span>
                            </div>
                        )}
                    </div>
                </section>

                {/* Phase panel */}
                <section className={`card ${styles.panel} anim-fade-up`} key={`${round.startedAt}-${phase}-${hasLocked}`}>
                    {phase === 'waiting_clue' && isSeer && (
                        <div className={styles.seerPanel}>
                            <div className={styles.panelHead}>
                                <LightbulbIcon size={22} />
                                <div>
                                    <h3>Você é o Vidente</h3>
                                    <p className="muted">O alvo está marcado no dial. Dê uma dica que leve todo mundo até lá, sem usar as palavras da carta.</p>
                                </div>
                            </div>
                            <form
                                className={styles.clueForm}
                                onSubmit={(e) => {
                                    e.preventDefault()
                                    submitClue()
                                }}
                            >
                                <input
                                    className={`input ${styles.clueInput}`}
                                    placeholder="Ex: pizza fria de ontem"
                                    value={clue}
                                    maxLength={LIMITS.CLUE_MAX}
                                    onChange={(e) => {
                                        setClue(e.target.value)
                                        setClueError(null)
                                    }}
                                    autoFocus
                                    autoComplete="off"
                                />
                                <button type="submit" className="btn btn-primary" disabled={!clue.trim() || sending}>
                                    {sending ? <span className="spinner spinner-sm" /> : <SparklesIcon />}
                                    Enviar dica
                                </button>
                            </form>
                            <div className={styles.clueMeta}>
                                {clueError ? <span className={styles.error}>{clueError}</span> : <span className="muted">Pode ser uma coisa, um lugar, uma situação… vale criatividade.</span>}
                                <span className={styles.counter}>{clue.length}/{LIMITS.CLUE_MAX}</span>
                            </div>
                        </div>
                    )}

                    {phase === 'waiting_clue' && !isSeer && (
                        <div className={styles.waitingPanel}>
                            <span className="dots"><span /><span /><span /></span>
                            <p>Esperando <strong>{seer?.nickname}</strong> dar a dica…</p>
                            {isHost && (
                                <button className="btn btn-ghost btn-sm" onClick={onSkipRound} title="Pula para o próximo Vidente">
                                    <SkipIcon size={16} /> Pular rodada
                                </button>
                            )}
                        </div>
                    )}

                    {phase === 'guessing' && isSeer && (
                        <div className={styles.waitingPanel}>
                            <p>Agora é com eles. <strong>{lockedCount}/{guessers.length}</strong> já travaram o palpite.</p>
                            <LockedList players={guessers} />
                        </div>
                    )}

                    {phase === 'guessing' && !isSeer && !hasLocked && (
                        <div className={styles.guessPanel}>
                            <div className={styles.guessHint}>
                                <p>Toque ou arraste no mostrador: o ponteiro vai para onde você apontar.</p>
                                <span className={styles.needleValue}>{needle}</span>
                            </div>
                            <div className={styles.fineTune}>
                                <span className="eyebrow">Ajuste fino</span>
                                <span className={styles.fineTuneButtons}>
                                    <button className="btn btn-secondary btn-sm" onClick={() => setNeedle(v => Math.max(0, v - 1))} aria-label="Um para a esquerda">−1</button>
                                    <button className="btn btn-secondary btn-sm" onClick={() => setNeedle(v => Math.min(100, v + 1))} aria-label="Um para a direita">+1</button>
                                </span>
                            </div>
                            <button className="btn btn-primary btn-lg btn-block" onClick={lockGuess}>
                                <LockIcon /> Travar palpite
                            </button>
                        </div>
                    )}

                    {phase === 'guessing' && !isSeer && hasLocked && (
                        <div className={styles.waitingPanel}>
                            <span className={styles.lockedBadge}><CheckIcon size={16} /> Palpite travado em {myGuess}</span>
                            <p>Esperando os outros… <strong>{lockedCount}/{guessers.length}</strong></p>
                            <LockedList players={guessers} />
                        </div>
                    )}

                    {phase === 'revealed' && (
                        <div className={styles.revealPanel}>
                            <header className={styles.revealHead}>
                                <h3>Resultado da rodada</h3>
                                <span className="chip">alvo em {round.targetPosition}</span>
                            </header>
                            <ul className={styles.resultList}>
                                {resultRows.map(({ player, points, zone, closest, isSeer: rowIsSeer }, i) => (
                                    <li key={player.id} className={`${styles.resultRow} ${player.id === me?.id ? styles.resultMe : ''} anim-fade-up`} style={{ animationDelay: `${0.3 + i * 0.07}s` }}>
                                        <Avatar name={player.nickname} colorIndex={player.colorIndex} size="sm" />
                                        <span className={styles.resultName}>{player.nickname}</span>
                                        <span className={styles.resultLabel}>
                                            {rowIsSeer ? (
                                                <span className={styles.seerTag}><EyeIcon size={13} /> Vidente</span>
                                            ) : (
                                                <>
                                                    <span className={`${styles.zoneTag} ${styles[`zoneTag${zone ?? 0}`]}`}>{zone ?? 0}</span>
                                                    {ZONE_LABEL[zone ?? 0]}
                                                    {closest && <span className={styles.closestTag}>mais perto +1</span>}
                                                </>
                                            )}
                                        </span>
                                        <span className={`${styles.resultPoints} ${points === 0 ? styles.resultZero : ''}`}>+{points}</span>
                                    </li>
                                ))}
                                {guessers.filter(p => round.guesses[p.id] === undefined).map(p => (
                                    <li key={p.id} className={`${styles.resultRow} ${styles.resultSkipped}`}>
                                        <Avatar name={p.nickname} colorIndex={p.colorIndex} size="sm" offline />
                                        <span className={styles.resultName}>{p.nickname}</span>
                                        <span className={styles.resultLabel}>não palpitou</span>
                                        <span className={`${styles.resultPoints} ${styles.resultZero}`}>+0</span>
                                    </li>
                                ))}
                            </ul>

                            <footer className={styles.readyBar}>
                                <div className={styles.readyInfo}>
                                    <strong>{readyCount}/{connectedCount}</strong> prontos
                                    {secondsLeft !== null && timerPhase === 'next' && <span className="muted"> · próxima em {secondsLeft}s</span>}
                                </div>
                                <div className={styles.readyActions}>
                                    {me?.isReady ? (
                                        <span className={styles.lockedBadge}><CheckIcon size={16} /> Você está pronto</span>
                                    ) : (
                                        <button className="btn btn-primary" onClick={onSetReady}>
                                            <CheckIcon /> Pronto!
                                        </button>
                                    )}
                                    {isHost && (
                                        <button className="btn btn-ghost btn-sm" onClick={onNextRound}>
                                            Próxima rodada <ChevronRightIcon size={16} />
                                        </button>
                                    )}
                                </div>
                            </footer>
                        </div>
                    )}
                </section>
            </div>

            <aside className={styles.sidebar}>
                <Scoreboard room={room} meId={me?.id ?? null} />
            </aside>
        </div>
    )
}

function LockedList({ players }: { players: Player[] }) {
    return (
        <ul className={styles.lockedList}>
            {players.map(p => (
                <li key={p.id} className={`${styles.lockedItem} ${p.hasGuessed ? styles.lockedDone : ''}`} title={p.nickname}>
                    <Avatar name={p.nickname} colorIndex={p.colorIndex} size="sm" offline={!p.isConnected} />
                    {p.hasGuessed && <span className={styles.lockedCheck}><CheckIcon size={10} /></span>}
                </li>
            ))}
        </ul>
    )
}
