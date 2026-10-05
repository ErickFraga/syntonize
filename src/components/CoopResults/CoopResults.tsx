'use client'

import { useMemo } from 'react'
import type { Room, Player } from '@/types/game'
import { SCORING } from '@/types/game'
import { computeTeamStats } from '@shared/gameLogic'
import Avatar from '@/components/ui/Avatar'
import { TrophyIcon, RotateIcon, HomeIcon, LogOutIcon, TargetIcon, EyeIcon } from '@/components/ui/Icons'
import { teamColor } from '@/lib/teams'
import RoundHistory from '@/components/RoundHistory/RoundHistory'
import { useT } from '@/i18n/I18nProvider'
import resultStyles from '@/components/Results/Results.module.css'
import styles from '@/components/TeamResults/TeamResults.module.css'

interface CoopResultsProps {
    room: Room
    me: Player | null
    isHost: boolean
    onPlayAgain: () => void
    onBackToLobby: () => void
    onLeave: () => void
    /** Starts with the round history open (static preview). */
    historyOpen?: boolean
}

const CONFETTI = Array.from({ length: 36 }, (_, i) => ({
    left: (i * 37) % 100,
    delay: (i % 9) * 0.25,
    duration: 3 + (i % 5) * 0.6,
    rotate: (i * 53) % 360,
}))

/** Rating of the group, from the share of the maximum score (4 per round). */
export function coopRating(score: number, rounds: number): 0 | 1 | 2 | 3 | 4 {
    const share = rounds > 0 ? score / (rounds * SCORING.BULLSEYE_POINTS) : 0
    return share >= 0.9 ? 4 : share >= 0.7 ? 3 : share >= 0.5 ? 2 : share >= 0.25 ? 1 : 0
}

/** End screen of the cooperative mode: the group beat the goal or did not. */
export default function CoopResults({ room, me, isHost, onPlayAgain, onBackToLobby, onLeave, historyOpen = false }: CoopResultsProps) {
    const { t } = useT()
    const won = room.winnerTeam === 0
    const score = room.teamScores[0]
    const goal = room.settings.targetScore
    const rounds = room.roundHistory.length
    const stats = useMemo(() => computeTeamStats(room), [room])
    const nameOf = (id?: string) => room.players.find(p => p.id === id)?.nickname ?? '—'
    const bestSeer = [...stats.seers].sort((x, y) => y.points / y.rounds - x.points / x.rounds)[0]

    return (
        <div className={resultStyles.results}>
            {won && (
                <div className={resultStyles.confetti} aria-hidden="true">
                    {CONFETTI.map((c, i) => (
                        <span
                            key={i}
                            style={{
                                left: `${c.left}%`,
                                animationDelay: `${c.delay}s`,
                                animationDuration: `${c.duration}s`,
                                background: teamColor(0),
                                transform: `rotate(${c.rotate}deg)`,
                            }}
                        />
                    ))}
                </div>
            )}

            <header className={`${resultStyles.hero} anim-fade-up`}>
                <span className={resultStyles.trophy}><TrophyIcon size={34} /></span>
                <span className="eyebrow">{t('results.over')}</span>
                <h1 className={resultStyles.title}>{won ? t('coop.results.won') : t('coop.results.lost')}</h1>
                <p className="muted">{t('coop.results.summary', { score, goal, count: rounds })}</p>
            </header>

            <section className={`${styles.teams} anim-fade-up`} style={{ animationDelay: '0.1s', gridTemplateColumns: '1fr' }}>
                <div
                    className={`card ${styles.team} ${won ? styles.winner : ''}`}
                    style={{ '--team-color': teamColor(0) } as React.CSSProperties}
                >
                    <div className={styles.teamHead}>
                        <span className={styles.dot} />
                        <h2>{t(`coop.results.rating.${coopRating(score, rounds)}`)}</h2>
                        {won && <TrophyIcon size={18} className={styles.trophy} />}
                    </div>
                    <span className={styles.score}>{score}<small> / {goal} {t('results.pointsUnit')}</small></span>
                    <ul className={styles.members}>
                        {room.players.map(p => (
                            <li key={p.id} className={styles.member}>
                                <Avatar name={p.nickname} colorIndex={p.colorIndex} size="sm" />
                                <span>{p.nickname}{p.id === me?.id ? t('common.youSuffix') : ''}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            <section className={`${resultStyles.highlights} anim-fade-up`} style={{ animationDelay: '0.25s' }}>
                <div className={`card ${resultStyles.highlight}`}>
                    <span className={resultStyles.highlightIcon}><TargetIcon size={20} /></span>
                    <span className={resultStyles.highlightLabel}>{t('teamResults.bullseyes')}</span>
                    <strong>{stats.teams[0].bullseyes}</strong>
                    <span className="muted">{t('coop.results.ofRounds', { count: rounds })}</span>
                </div>
                <div className={`card ${resultStyles.highlight}`}>
                    <span className={resultStyles.highlightIcon}><EyeIcon size={20} /></span>
                    <span className={resultStyles.highlightLabel}>{t('results.bestSeer')}</span>
                    <strong>{bestSeer ? nameOf(bestSeer.playerId) : '—'}</strong>
                    <span className="muted">{bestSeer ? t('results.perClue', { n: (bestSeer.points / bestSeer.rounds).toFixed(1) }) : t('results.noClues')}</span>
                </div>
            </section>

            <section className={`${resultStyles.actions} anim-fade-up`} style={{ animationDelay: '0.3s' }}>
                {isHost ? (
                    <>
                        <button className="btn btn-primary btn-lg" onClick={onPlayAgain}>
                            <RotateIcon /> {t('results.playAgain')}
                        </button>
                        <button className="btn btn-secondary" onClick={onBackToLobby}>
                            <HomeIcon /> {t('results.backToLobby')}
                        </button>
                    </>
                ) : (
                    <p className={resultStyles.waitHost}>
                        <span className="dots"><span /><span /><span /></span>
                        {t('results.waitHost')}
                    </p>
                )}
                <RoundHistory room={room} meId={me?.id ?? null} variant="results" defaultOpen={historyOpen} />
                <button className="btn btn-ghost" onClick={onLeave}>
                    <LogOutIcon /> {t('results.leave')}
                </button>
            </section>
        </div>
    )
}
