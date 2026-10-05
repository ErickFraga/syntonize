'use client'

import { useEffect, useRef, useState } from 'react'
import type { Room, Player, SimpleResult, Side, TimerPhase, TeamId } from '@/types/game'
import { LIMITS, TEAM_RULES } from '@/types/game'
import type { RemoteNeedle } from '@/hooks/useGameState'
import Dial from '@/components/Dial/Dial'
import Avatar from '@/components/ui/Avatar'
import CountdownRing from '@/components/ui/CountdownRing'
import { EyeIcon, LockIcon, CheckIcon, SkipIcon, LightbulbIcon, ChevronRightIcon, ChevronLeftIcon, SparklesIcon, UsersIcon } from '@/components/ui/Icons'
import TeamScoreboard from './TeamScoreboard'
import { teamColor, teamName } from '@/lib/teams'
import { sounds } from '@/lib/sounds'
import gameStyles from '@/components/Game/Game.module.css'
import styles from './TeamGame.module.css'

interface TeamGameProps {
    room: Room
    me: Player | null
    isHost: boolean
    isSeer: boolean
    secondsLeft: number | null
    timerPhase: TimerPhase | null
    remoteNeedle: RemoteNeedle | null
    onGiveClue: (clue: string) => Promise<SimpleResult>
    onSubmitGuess: (position: number) => Promise<SimpleResult>
    onNeedleMove: (position: number) => void
    onSideGuess: (side: Side) => Promise<SimpleResult>
    onSetReady: () => void
    onNextRound: () => void
    onSkipRound: () => void
    /** Chat panel, rendered under the scoreboard. */
    chat?: React.ReactNode
}

const ZONE_LABEL: Record<number, string> = {
    4: 'Na mosca!',
    3: 'Quase lá',
    2: 'Pegou a vibe',
    0: 'Passou longe',
}

const SIDE_LABEL: Record<Side, string> = { left: 'esquerda', right: 'direita' }

/** Game screen for team mode: one shared needle per team, then the left/right call. */
export default function TeamGame({
    room,
    me,
    isHost,
    isSeer,
    secondsLeft,
    timerPhase,
    remoteNeedle,
    onGiveClue,
    onSubmitGuess,
    onNeedleMove,
    onSideGuess,
    onSetReady,
    onNextRound,
    onSkipRound,
    chat,
}: TeamGameProps) {
    const round = room.currentRound!
    const play = round.teamPlay!
    const phase = round.phase
    const seer = room.players.find(p => p.id === round.seerId)
    const activeTeam = play.team
    const otherTeam: TeamId = activeTeam === 0 ? 1 : 0
    const onActiveTeam = me?.team === activeTeam
    const canDrag = phase === 'guessing' && onActiveTeam && !isSeer

    const [clue, setClue] = useState('')
    const [clueError, setClueError] = useState<string | null>(null)
    const [sending, setSending] = useState(false)
    const [needle, setNeedle] = useState(play.needle ?? 50)
    const [justRevealed, setJustRevealed] = useState(false)
    const seenNeedle = useRef(remoteNeedle)

    useEffect(() => {
        setClue('')
        setClueError(null)
        setSending(false)
        setNeedle(round.teamPlay?.needle ?? 50)
    }, [round.startedAt])

    // Teammates dragging: follow their needle (ignore the echo of my own moves).
    useEffect(() => {
        if (!remoteNeedle || remoteNeedle === seenNeedle.current) return
        seenNeedle.current = remoteNeedle
        if (remoteNeedle.by !== me?.id) setNeedle(remoteNeedle.position)
    }, [remoteNeedle, me?.id])

    useEffect(() => {
        if (phase === 'revealed') {
            setJustRevealed(true)
            const id = window.setTimeout(() => setJustRevealed(false), 1200)
            return () => window.clearTimeout(id)
        }
        setJustRevealed(false)
    }, [phase, round.startedAt])

    useEffect(() => {
        if ((timerPhase === 'guess' || timerPhase === 'side') && secondsLeft !== null && secondsLeft <= 5 && secondsLeft > 0) sounds.tick()
    }, [secondsLeft, timerPhase])

    const changeNeedle = (position: number) => {
        setNeedle(position)
        onNeedleMove(position)
    }

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

    const callSide = async (side: Side) => {
        const result = await onSideGuess(side)
        if (result.success) sounds.lock()
    }

    const locked = phase === 'side_guess' || phase === 'revealed'
    const showTarget = phase === 'revealed' || (isSeer && round.targetPosition !== null)
    const dialNeedle = locked ? play.guess : onActiveTeam ? needle : null
    const timerTotal = timerPhase === 'guess' ? room.settings.timePerGuess
        : timerPhase === 'clue' ? room.settings.timePerClue
            : timerPhase === 'side' ? TEAM_RULES.SIDE_GUESS_SECONDS
                : room.settings.timeBetweenRounds
    const timerLabel = timerPhase === 'guess' ? 'palpite' : timerPhase === 'side' ? 'lado' : 'dica'

    const lockedBy = room.players.find(p => p.id === play.lockedBy)
    const sideBy = room.players.find(p => p.id === play.sideBy)
    const connectedCount = room.players.filter(p => p.isConnected).length
    const readyCount = room.players.filter(p => p.isConnected && p.isReady).length
    const teamStyle = (team: TeamId) => ({ '--team-color': teamColor(team) } as React.CSSProperties)

    return (
        <div className={gameStyles.game}>
            <div className={gameStyles.main}>
                <div className={`${gameStyles.roundBar} anim-fade-in`}>
                    <div className={gameStyles.roundInfo}>
                        <span className="chip chip-accent">Rodada {round.roundNumber}</span>
                        <span className={styles.turnChip} style={teamStyle(activeTeam)}>
                            <span className={styles.dot} />
                            Vez do <strong>{teamName(activeTeam)}</strong>
                        </span>
                        <span className={gameStyles.seerChip}>
                            <EyeIcon size={16} />
                            <span>Vidente</span>
                            {seer && <Avatar name={seer.nickname} colorIndex={seer.colorIndex} size="sm" offline={!seer.isConnected} />}
                            <strong>{seer?.nickname ?? '…'}{isSeer ? ' (você)' : ''}</strong>
                        </span>
                    </div>
                    {secondsLeft !== null && timerPhase && timerPhase !== 'next' && (
                        <CountdownRing seconds={secondsLeft} total={timerTotal} label={timerLabel} />
                    )}
                </div>

                <section className={`card-solid ${gameStyles.device}`} key={round.startedAt}>
                    <Dial
                        target={showTarget ? round.targetPosition : null}
                        covered={!showTarget}
                        revealing={phase === 'revealed' && justRevealed}
                        needle={dialNeedle}
                        onNeedleChange={changeNeedle}
                        interactive={canDrag}
                        locked={locked}
                    />

                    <div className={gameStyles.concepts}>
                        <span className={gameStyles.conceptLeft}>◀ {round.spectrumCard.leftConcept}</span>
                        <span className={gameStyles.conceptRight}>{round.spectrumCard.rightConcept} ▶</span>
                    </div>

                    <div className={gameStyles.clueArea}>
                        {round.clue ? (
                            <div className={`${gameStyles.clue} anim-pop`}>
                                <span className="eyebrow">Dica de {seer?.nickname}</span>
                                <strong>&ldquo;{round.clue}&rdquo;</strong>
                            </div>
                        ) : (
                            <div className={gameStyles.cluePending}>
                                <span className="eyebrow">Dica</span>
                                <span className={gameStyles.cluePlaceholder}>{isSeer ? 'sua vez de pensar numa dica' : `${seer?.nickname ?? 'o Vidente'} está pensando…`}</span>
                            </div>
                        )}
                    </div>
                </section>

                <section className={`card ${gameStyles.panel} anim-fade-up`} key={`${round.startedAt}-${phase}`}>
                    {phase === 'waiting_clue' && isSeer && (
                        <div className={gameStyles.seerPanel}>
                            <div className={gameStyles.panelHead}>
                                <LightbulbIcon size={22} />
                                <div>
                                    <h3>Você é o Vidente do seu time</h3>
                                    <p className="muted">Só o seu time palpita nesta rodada. Dê uma dica que leve vocês até o alvo, sem usar as palavras da carta.</p>
                                </div>
                            </div>
                            <form
                                className={gameStyles.clueForm}
                                onSubmit={(e) => {
                                    e.preventDefault()
                                    submitClue()
                                }}
                            >
                                <input
                                    className={`input ${gameStyles.clueInput}`}
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
                            <div className={gameStyles.clueMeta}>
                                {clueError ? <span className={gameStyles.error}>{clueError}</span> : <span className="muted">Pode ser uma coisa, um lugar, uma situação… vale criatividade.</span>}
                                <span className={gameStyles.counter}>{clue.length}/{LIMITS.CLUE_MAX}</span>
                            </div>
                        </div>
                    )}

                    {phase === 'waiting_clue' && !isSeer && (
                        <div className={gameStyles.waitingPanel}>
                            <span className="dots"><span /><span /><span /></span>
                            <p>Esperando <strong>{seer?.nickname}</strong> dar a dica para o {teamName(activeTeam)}…</p>
                            {isHost && (
                                <button className="btn btn-ghost btn-sm" onClick={onSkipRound} title="Pula para o próximo Vidente">
                                    <SkipIcon size={16} /> Pular rodada
                                </button>
                            )}
                        </div>
                    )}

                    {phase === 'guessing' && canDrag && (
                        <div className={gameStyles.guessPanel}>
                            <div className={gameStyles.guessHint}>
                                <p>Gire o ponteiro junto com seu time. Todos veem o mesmo ponteiro; qualquer um trava o palpite do time.</p>
                                <span className={gameStyles.needleValue}>{needle}</span>
                            </div>
                            <div className={gameStyles.fineTune}>
                                <button className="btn btn-secondary btn-sm" onClick={() => changeNeedle(Math.max(0, needle - 1))} aria-label="Um para a esquerda">−1</button>
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    value={needle}
                                    onChange={(e) => changeNeedle(Number(e.target.value))}
                                    className={gameStyles.range}
                                    aria-label="Posição do ponteiro"
                                />
                                <button className="btn btn-secondary btn-sm" onClick={() => changeNeedle(Math.min(100, needle + 1))} aria-label="Um para a direita">+1</button>
                            </div>
                            <button className="btn btn-primary btn-lg btn-block" onClick={lockGuess}>
                                <LockIcon /> Travar palpite do time
                            </button>
                        </div>
                    )}

                    {phase === 'guessing' && !canDrag && (
                        <div className={gameStyles.waitingPanel}>
                            <span className="dots"><span /><span /><span /></span>
                            {onActiveTeam ? (
                                <p>Seu time está girando o ponteiro. Você vê tudo, mas não pode ajudar!</p>
                            ) : (
                                <p>O <strong>{teamName(activeTeam)}</strong> está decidindo onde fica o alvo. Prepare-se: depois vocês chutam se o alvo está à esquerda ou à direita do ponteiro deles.</p>
                            )}
                        </div>
                    )}

                    {phase === 'side_guess' && (
                        <div className={styles.sidePanel}>
                            <p className={styles.lockLine}>
                                <CheckIcon size={16} /> Palpite do {teamName(activeTeam)} travado em <strong>{play.guess}</strong>
                                {lockedBy ? <> por {lockedBy.nickname}</> : null}
                            </p>
                            {!onActiveTeam && me ? (
                                <>
                                    <h3>O alvo está à esquerda ou à direita do ponteiro?</h3>
                                    <p className="muted">Acertar vale {TEAM_RULES.SIDE_POINTS} ponto para o {teamName(otherTeam)}. Qualquer um do time pode escolher.</p>
                                    <div className={styles.sideButtons}>
                                        <button className="btn btn-secondary btn-lg" onClick={() => callSide('left')}>
                                            <ChevronLeftIcon /> Esquerda
                                        </button>
                                        <button className="btn btn-secondary btn-lg" onClick={() => callSide('right')}>
                                            Direita <ChevronRightIcon />
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className={gameStyles.waitingPanel}>
                                    <span className="dots"><span /><span /><span /></span>
                                    <p>O <strong>{teamName(otherTeam)}</strong> está chutando se o alvo está à esquerda ou à direita…</p>
                                </div>
                            )}
                        </div>
                    )}

                    {phase === 'revealed' && (
                        <div className={gameStyles.revealPanel}>
                            <header className={gameStyles.revealHead}>
                                <h3>Resultado da rodada</h3>
                                <span className="chip">alvo em {round.targetPosition}</span>
                            </header>
                            <ul className={styles.outcome}>
                                <li className={styles.outcomeRow} style={teamStyle(activeTeam)}>
                                    <span className={styles.dot} />
                                    <span className={styles.outcomeText}>
                                        <strong>{teamName(activeTeam)}</strong>
                                        <span className="muted">
                                            <span className={`${gameStyles.zoneTag} ${gameStyles[`zoneTag${play.zone ?? 0}`]}`}>{play.zone ?? 0}</span>
                                            {' '}{ZONE_LABEL[play.zone ?? 0]} · ponteiro em {play.guess}
                                        </span>
                                    </span>
                                    <span className={`${gameStyles.resultPoints} ${play.points[activeTeam] === 0 ? gameStyles.resultZero : ''}`}>+{play.points[activeTeam]}</span>
                                </li>
                                <li className={styles.outcomeRow} style={teamStyle(otherTeam)}>
                                    <span className={styles.dot} />
                                    <span className={styles.outcomeText}>
                                        <strong>{teamName(otherTeam)}</strong>
                                        <span className="muted">
                                            {play.side
                                                ? <>chutou <strong>{SIDE_LABEL[play.side]}</strong>{sideBy ? ` (${sideBy.nickname})` : ''}: {play.sideCorrect ? 'acertou!' : 'errou'}</>
                                                : 'não chutou o lado'}
                                        </span>
                                    </span>
                                    <span className={`${gameStyles.resultPoints} ${play.points[otherTeam] === 0 ? gameStyles.resultZero : ''}`}>+{play.points[otherTeam]}</span>
                                </li>
                            </ul>
                            {play.catchUp && room.status === 'playing' && (
                                <p className={styles.catchUp} style={teamStyle(activeTeam)}>
                                    <UsersIcon size={16} /> Na mosca e ainda atrás no placar: o {teamName(activeTeam)} joga de novo!
                                </p>
                            )}

                            <footer className={gameStyles.readyBar}>
                                <div className={gameStyles.readyInfo}>
                                    <strong>{readyCount}/{connectedCount}</strong> prontos
                                    {secondsLeft !== null && timerPhase === 'next' && <span className="muted"> · próxima em {secondsLeft}s</span>}
                                </div>
                                <div className={gameStyles.readyActions}>
                                    {me?.isReady ? (
                                        <span className={gameStyles.lockedBadge}><CheckIcon size={16} /> Você está pronto</span>
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

            <aside className={gameStyles.sidebar}>
                <TeamScoreboard room={room} meId={me?.id ?? null} />
                {chat}
            </aside>
        </div>
    )
}
