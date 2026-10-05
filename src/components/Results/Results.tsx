'use client'

import { useMemo } from 'react'
import type { Room, Player } from '@/types/game'
import { computeStats } from '@shared/gameLogic'
import Avatar from '@/components/ui/Avatar'
import { TrophyIcon, RotateIcon, HomeIcon, LogOutIcon, TargetIcon, EyeIcon, SparklesIcon } from '@/components/ui/Icons'
import { useT } from '@/i18n/I18nProvider'
import styles from './Results.module.css'

interface ResultsProps {
    room: Room
    me: Player | null
    isHost: boolean
    onPlayAgain: () => void
    onBackToLobby: () => void
    onLeave: () => void
}

const CONFETTI = Array.from({ length: 36 }, (_, i) => ({
    left: (i * 37) % 100,
    delay: (i % 9) * 0.25,
    duration: 3 + (i % 5) * 0.6,
    color: ['#2ee6d6', '#8f7bff', '#ff5d8f', '#ffb347', '#5be37d', '#f9e547'][i % 6],
    rotate: (i * 53) % 360,
}))

export default function Results({ room, me, isHost, onPlayAgain, onBackToLobby, onLeave }: ResultsProps) {
    const { t } = useT()
    const sorted = useMemo(() => [...room.players].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname)), [room.players])
    const winner = sorted[0]
    const isWinner = !!me && winner?.id === me.id
    const stats = useMemo(() => computeStats(room), [room])
    const podium = sorted.slice(0, 3)
    const rest = sorted.slice(3)

    const statOf = (id: string) => stats.find(s => s.playerId === id)
    const sharpshooter = [...stats].sort((a, b) => b.bullseyes - a.bullseyes)[0]
    const bestSeer = [...stats].filter(s => s.roundsAsSeer > 0).sort((a, b) => b.seerPoints / b.roundsAsSeer - a.seerPoints / a.roundsAsSeer)[0]
    const nameOf = (id?: string) => room.players.find(p => p.id === id)?.nickname ?? '—'

    return (
        <div className={styles.results}>
            {isWinner && (
                <div className={styles.confetti} aria-hidden="true">
                    {CONFETTI.map((c, i) => (
                        <span
                            key={i}
                            style={{
                                left: `${c.left}%`,
                                animationDelay: `${c.delay}s`,
                                animationDuration: `${c.duration}s`,
                                background: c.color,
                                transform: `rotate(${c.rotate}deg)`,
                            }}
                        />
                    ))}
                </div>
            )}

            <header className={`${styles.hero} anim-fade-up`}>
                <span className={styles.trophy}><TrophyIcon size={34} /></span>
                <span className="eyebrow">{t('results.over')}</span>
                <h1 className={styles.title}>
                    {isWinner ? t('results.youWon') : t('results.won', { name: winner?.nickname ?? '' })}
                </h1>
                <p className="muted">
                    {t('results.summary', { points: winner?.score ?? 0, count: room.roundHistory.length })}
                </p>
            </header>

            <section className={`${styles.podium} anim-fade-up`} style={{ animationDelay: '0.1s' }}>
                {[podium[1], podium[0], podium[2]].map((player, slot) => {
                    if (!player) return <div key={`empty-${slot}`} className={styles.podiumEmpty} />
                    const place = slot === 1 ? 1 : slot === 0 ? 2 : 3
                    return (
                        <div key={player.id} className={`${styles.podiumSpot} ${styles[`place${place}`]}`}>
                            <Avatar name={player.nickname} colorIndex={player.colorIndex} size={place === 1 ? 'xl' : 'lg'} ring />
                            <span className={styles.podiumName}>
                                {player.nickname}
                                {player.id === me?.id && <span className={styles.youTag}>{t('common.you')}</span>}
                            </span>
                            <span className={styles.podiumScore}>{t('results.points', { n: player.score })}</span>
                            <div className={styles.podiumBlock}>
                                <span>{t('results.place', { n: place })}</span>
                            </div>
                        </div>
                    )
                })}
            </section>

            {rest.length > 0 && (
                <section className={`card ${styles.restList} anim-fade-up`} style={{ animationDelay: '0.2s' }}>
                    <ol start={4}>
                        {rest.map((player, i) => (
                            <li key={player.id} className={styles.restRow}>
                                <span className={styles.restRank}>{t('results.place', { n: i + 4 })}</span>
                                <Avatar name={player.nickname} colorIndex={player.colorIndex} size="sm" />
                                <span className={styles.restName}>{player.nickname}{player.id === me?.id ? t('common.youSuffix') : ''}</span>
                                <span className={styles.restScore}>{t('results.points', { n: player.score })}</span>
                            </li>
                        ))}
                    </ol>
                </section>
            )}

            <section className={`${styles.highlights} anim-fade-up`} style={{ animationDelay: '0.25s' }}>
                <div className={`card ${styles.highlight}`}>
                    <span className={styles.highlightIcon}><TargetIcon size={20} /></span>
                    <span className={styles.highlightLabel}>{t('results.sharpshooter')}</span>
                    <strong>{sharpshooter && sharpshooter.bullseyes > 0 ? nameOf(sharpshooter.playerId) : '—'}</strong>
                    <span className="muted">{t('results.bullseyes', { count: sharpshooter?.bullseyes ?? 0 })}</span>
                </div>
                <div className={`card ${styles.highlight}`}>
                    <span className={styles.highlightIcon}><EyeIcon size={20} /></span>
                    <span className={styles.highlightLabel}>{t('results.bestSeer')}</span>
                    <strong>{bestSeer ? nameOf(bestSeer.playerId) : '—'}</strong>
                    <span className="muted">{bestSeer ? t('results.perClue', { n: (bestSeer.seerPoints / bestSeer.roundsAsSeer).toFixed(1) }) : t('results.noClues')}</span>
                </div>
                <div className={`card ${styles.highlight}`}>
                    <span className={styles.highlightIcon}><SparklesIcon size={20} /></span>
                    <span className={styles.highlightLabel}>{t('results.bestRound')}</span>
                    <strong>{me ? `+${statOf(me.id)?.bestRound ?? 0}` : '—'}</strong>
                    <span className="muted">{me ? t('results.closestCount', { count: statOf(me.id)?.closest ?? 0 }) : ''}</span>
                </div>
            </section>

            <section className={`${styles.actions} anim-fade-up`} style={{ animationDelay: '0.3s' }}>
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
                    <p className={styles.waitHost}>
                        <span className="dots"><span /><span /><span /></span>
                        {t('results.waitHost')}
                    </p>
                )}
                <button className="btn btn-ghost" onClick={onLeave}>
                    <LogOutIcon /> {t('results.leave')}
                </button>
            </section>
        </div>
    )
}
