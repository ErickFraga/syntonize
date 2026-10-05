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
import RoundHistory from '@/components/RoundHistory/RoundHistory'
import { teamColor, teamKey } from '@/lib/teams'
import { useT } from '@/i18n/I18nProvider'
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
    /** Starts with the round history open (static preview). */
    historyOpen?: boolean
}

const ZONE_LABEL = { 4: 'zone.4', 3: 'zone.3', 2: 'zone.2', 0: 'zone.0' } as const
const SIDE_LABEL = { left: 'side.left', right: 'side.right' } as const

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
    historyOpen = false,
}: TeamGameProps) {
    const { t, rich, msg } = useT()
    const round = room.currentRound!
    const play = round.teamPlay!
    const phase = round.phase
    const seer = room.players.find(p => p.id === round.seerId)
    const activeTeam = play.team
    const otherTeam: TeamId = activeTeam === 0 ? 1 : 0
    const coop = room.settings.mode === 'coop'
    const onActiveTeam = coop ? !!me : me?.team === activeTeam
    const canDrag = phase === 'guessing' && onActiveTeam && !isSeer

    const [pickedSide, setPickedSide] = useState<Side | null>(null)
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
        if (!result.success) setClueError(msg(result.error, 'error.clue'))
    }

    const lockGuess = async () => {
        const result = await onSubmitGuess(needle)
        if (result.success) sounds.lock()
    }

    const confirmSide = async () => {
        if (!pickedSide) return
        const result = await onSideGuess(pickedSide)
        if (result.success) sounds.lock()
    }

    const locked = phase === 'side_guess' || phase === 'revealed'
    const showTarget = phase === 'revealed' || (isSeer && round.targetPosition !== null)
    const dialNeedle = locked ? play.guess : onActiveTeam ? needle : null
    const timerTotal = timerPhase === 'guess' ? room.settings.timePerGuess
        : timerPhase === 'clue' ? room.settings.timePerClue
            : timerPhase === 'side' ? TEAM_RULES.SIDE_GUESS_SECONDS
                : room.settings.timeBetweenRounds
    const timerLabel = t(timerPhase === 'guess' ? 'timer.guess' : timerPhase === 'side' ? 'timer.side' : 'timer.clue')
    const activeName = t(teamKey(activeTeam))
    const otherName = t(teamKey(otherTeam))

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
                        <span className="chip chip-accent">{t('common.round', { n: round.roundNumber })}</span>
                        <span className={styles.turnChip} style={teamStyle(activeTeam)}>
                            <span className={styles.dot} />
                            {coop ? <strong>{t('coop.turn')}</strong> : rich('teamGame.turn', { team: <strong>{activeName}</strong> })}
                        </span>
                        <span className={gameStyles.seerChip}>
                            <EyeIcon size={16} />
                            <span>{t('common.seer')}</span>
                            {seer && <Avatar name={seer.nickname} colorIndex={seer.colorIndex} size="sm" offline={!seer.isConnected} />}
                            <strong>{seer?.nickname ?? '…'}{isSeer ? t('common.youSuffix') : ''}</strong>
                        </span>
                    </div>
                    <div className={gameStyles.roundTools}>
                        <RoundHistory room={room} meId={me?.id ?? null} defaultOpen={historyOpen} />
                        {secondsLeft !== null && timerPhase && timerPhase !== 'next' && (
                            <CountdownRing seconds={secondsLeft} total={timerTotal} label={timerLabel} />
                        )}
                    </div>
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
                                <span className="eyebrow">{t('game.clueBy', { name: seer?.nickname ?? '' })}</span>
                                <strong>&ldquo;{round.clue}&rdquo;</strong>
                            </div>
                        ) : (
                            <div className={gameStyles.cluePending}>
                                <span className="eyebrow">{t('game.clue')}</span>
                                <span className={gameStyles.cluePlaceholder}>{isSeer ? t('game.yourTurnToThink') : t('game.seerThinking', { name: seer?.nickname ?? t('game.theSeer') })}</span>
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
                                    <h3>{t(coop ? 'game.youAreSeer' : 'teamGame.seerTitle')}</h3>
                                    <p className="muted">{t(coop ? 'coop.seerHelp' : 'teamGame.seerHelp')}</p>
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
                                    placeholder={t('game.cluePlaceholder')}
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
                                    {t('game.sendClue')}
                                </button>
                            </form>
                            <div className={gameStyles.clueMeta}>
                                {clueError ? <span className={gameStyles.error}>{clueError}</span> : <span className="muted">{t('game.clueTip')}</span>}
                                <span className={gameStyles.counter}>{clue.length}/{LIMITS.CLUE_MAX}</span>
                            </div>
                        </div>
                    )}

                    {phase === 'waiting_clue' && !isSeer && (
                        <div className={gameStyles.waitingPanel}>
                            <span className="dots"><span /><span /><span /></span>
                            <p>{coop ? rich('coop.waitingClue', { name: <strong>{seer?.nickname}</strong> }) : rich('teamGame.waitingClue', { name: <strong>{seer?.nickname}</strong>, team: activeName })}</p>
                            {isHost && (
                                <button className="btn btn-ghost btn-sm" onClick={onSkipRound} title={t('game.skipTitle')}>
                                    <SkipIcon size={16} /> {t('game.skip')}
                                </button>
                            )}
                        </div>
                    )}

                    {phase === 'guessing' && canDrag && (
                        <div className={gameStyles.guessPanel}>
                            <div className={gameStyles.guessHint}>
                                <p>{t(coop ? 'coop.dragHint' : 'teamGame.dragHint')}</p>
                                <span className={gameStyles.needleValue}>{needle}</span>
                            </div>
                            <div className={gameStyles.fineTune}>
                                <span className="eyebrow">{t('game.fineTune')}</span>
                                <span className={gameStyles.fineTuneButtons}>
                                    <button className="btn btn-secondary btn-sm" onClick={() => changeNeedle(Math.max(0, needle - 1))} aria-label={t('game.oneLeft')}>−1</button>
                                    <button className="btn btn-secondary btn-sm" onClick={() => changeNeedle(Math.min(100, needle + 1))} aria-label={t('game.oneRight')}>+1</button>
                                </span>
                            </div>
                            <button className="btn btn-primary btn-lg btn-block" onClick={lockGuess}>
                                <LockIcon /> {t(coop ? 'coop.lock' : 'teamGame.lock')}
                            </button>
                        </div>
                    )}

                    {phase === 'guessing' && !canDrag && (
                        <div className={gameStyles.waitingPanel}>
                            <span className="dots"><span /><span /><span /></span>
                            {onActiveTeam ? (
                                <p>{t(coop ? 'coop.watching' : 'teamGame.ownTeamWatching')}</p>
                            ) : (
                                <p>{rich('teamGame.otherDeciding', { team: <strong>{activeName}</strong> })}</p>
                            )}
                        </div>
                    )}

                    {phase === 'side_guess' && (
                        <div className={styles.sidePanel}>
                            <p className={styles.lockLine}>
                                <CheckIcon size={16} /> {rich('teamGame.lockedLine', { team: activeName, n: <strong>{play.guess}</strong> })}
                                {lockedBy ? t('teamGame.lockedBy', { name: lockedBy.nickname }) : null}
                            </p>
                            {!onActiveTeam && me ? (
                                <>
                                    <h3>{t('teamGame.sideQuestion')}</h3>
                                    <p className="muted">{t('teamGame.sideWorth', { count: TEAM_RULES.SIDE_POINTS, team: otherName })}</p>
                                    <div className={styles.sideButtons}>
                                        <button className={`btn btn-lg ${pickedSide === 'left' ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={pickedSide === 'left'} onClick={() => setPickedSide('left')}>
                                            <ChevronLeftIcon /> {t('teamGame.left')}
                                        </button>
                                        <button className={`btn btn-lg ${pickedSide === 'right' ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={pickedSide === 'right'} onClick={() => setPickedSide('right')}>
                                            {t('teamGame.right')} <ChevronRightIcon />
                                        </button>
                                    </div>
                                    <button className="btn btn-primary btn-lg btn-block" disabled={!pickedSide} onClick={confirmSide}>
                                        <CheckIcon /> {pickedSide ? t('teamGame.confirmSide', { side: t(SIDE_LABEL[pickedSide]) }) : t('teamGame.confirm')}
                                    </button>
                                </>
                            ) : (
                                <div className={gameStyles.waitingPanel}>
                                    <span className="dots"><span /><span /><span /></span>
                                    <p>{rich('teamGame.otherCalling', { team: <strong>{otherName}</strong> })}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {phase === 'revealed' && (
                        <div className={gameStyles.revealPanel}>
                            <header className={gameStyles.revealHead}>
                                <h3>{t('game.roundResult')}</h3>
                                <span className="chip">{t('game.targetAt', { n: round.targetPosition ?? '' })}</span>
                            </header>
                            <ul className={styles.outcome}>
                                <li className={styles.outcomeRow} style={teamStyle(activeTeam)}>
                                    <span className={styles.dot} />
                                    <span className={styles.outcomeText}>
                                        <strong>{coop ? t('coop.team') : activeName}</strong>
                                        <span className="muted">
                                            <span className={`${gameStyles.zoneTag} ${gameStyles[`zoneTag${play.zone ?? 0}`]}`}>{play.zone ?? 0}</span>
                                            {' '}{t('teamGame.needleAt', { zone: t(ZONE_LABEL[play.zone ?? 0]), n: play.guess ?? '' })}
                                        </span>
                                    </span>
                                    <span className={`${gameStyles.resultPoints} ${play.points[activeTeam] === 0 ? gameStyles.resultZero : ''}`}>+{play.points[activeTeam]}</span>
                                </li>
                                {!coop && (
                                <li className={styles.outcomeRow} style={teamStyle(otherTeam)}>
                                    <span className={styles.dot} />
                                    <span className={styles.outcomeText}>
                                        <strong>{otherName}</strong>
                                        <span className="muted">
                                            {play.side
                                                ? rich(play.sideCorrect ? 'teamGame.calledRight' : 'teamGame.calledWrong', { side: <strong>{t(SIDE_LABEL[play.side])}</strong>, by: sideBy ? ` (${sideBy.nickname})` : '' })
                                                : t('teamGame.noCall')}
                                        </span>
                                    </span>
                                    <span className={`${gameStyles.resultPoints} ${play.points[otherTeam] === 0 ? gameStyles.resultZero : ''}`}>+{play.points[otherTeam]}</span>
                                </li>
                                )}
                            </ul>
                            {play.catchUp && room.status === 'playing' && (
                                <p className={styles.catchUp} style={teamStyle(activeTeam)}>
                                    <UsersIcon size={16} /> {t('teamGame.catchUp', { team: activeName })}
                                </p>
                            )}

                            <footer className={gameStyles.readyBar}>
                                <div className={gameStyles.readyInfo}>
                                    {rich('game.readyCount', { count: <strong>{readyCount}/{connectedCount}</strong> })}
                                    {secondsLeft !== null && timerPhase === 'next' && <span className="muted">{t('game.nextIn', { n: secondsLeft })}</span>}
                                </div>
                                <div className={gameStyles.readyActions}>
                                    {me?.isReady ? (
                                        <span className={gameStyles.lockedBadge}><CheckIcon size={16} /> {t('game.youReady')}</span>
                                    ) : (
                                        <button className="btn btn-primary" onClick={onSetReady}>
                                            <CheckIcon /> {t('game.ready')}
                                        </button>
                                    )}
                                    {isHost && (
                                        <button className="btn btn-ghost btn-sm" onClick={onNextRound}>
                                            {t('game.nextRound')} <ChevronRightIcon size={16} />
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
