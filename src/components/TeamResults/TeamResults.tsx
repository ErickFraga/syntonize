'use client'

import { useMemo } from 'react'
import type { Room, Player } from '@/types/game'
import { computeTeamStats } from '@shared/gameLogic'
import Avatar from '@/components/ui/Avatar'
import { TrophyIcon, RotateIcon, HomeIcon, LogOutIcon, TargetIcon, EyeIcon, SparklesIcon } from '@/components/ui/Icons'
import { TEAM_IDS, teamColor, teamName } from '@/lib/teams'
import resultStyles from '@/components/Results/Results.module.css'
import styles from './TeamResults.module.css'

interface TeamResultsProps {
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
    rotate: (i * 53) % 360,
}))

export default function TeamResults({ room, me, isHost, onPlayAgain, onBackToLobby, onLeave }: TeamResultsProps) {
    const winner = room.winnerTeam
    const myTeamWon = !!me && winner !== null && me.team === winner
    const stats = useMemo(() => computeTeamStats(room), [room])
    const [a, b] = room.teamScores
    const rounds = room.roundHistory.length
    const nameOf = (id?: string) => room.players.find(p => p.id === id)?.nickname ?? '—'
    const bestSeer = [...stats.seers].sort((x, y) => y.points / y.rounds - x.points / x.rounds)[0]
    const pair = (pick: (t: 0 | 1) => number) => `${pick(0)} × ${pick(1)}`

    return (
        <div className={resultStyles.results}>
            {myTeamWon && (
                <div className={resultStyles.confetti} aria-hidden="true">
                    {CONFETTI.map((c, i) => (
                        <span
                            key={i}
                            style={{
                                left: `${c.left}%`,
                                animationDelay: `${c.delay}s`,
                                animationDuration: `${c.duration}s`,
                                background: teamColor(winner!),
                                transform: `rotate(${c.rotate}deg)`,
                            }}
                        />
                    ))}
                </div>
            )}

            <header className={`${resultStyles.hero} anim-fade-up`}>
                <span className={resultStyles.trophy}><TrophyIcon size={34} /></span>
                <span className="eyebrow">Fim de partida</span>
                <h1 className={resultStyles.title}>
                    {winner === null ? 'Empate!' : myTeamWon ? 'Seu time venceu!' : `${teamName(winner)} venceu!`}
                </h1>
                <p className="muted">{a} × {b} em {rounds} rodada{rounds === 1 ? '' : 's'}</p>
            </header>

            <section className={`${styles.teams} anim-fade-up`} style={{ animationDelay: '0.1s' }}>
                {TEAM_IDS.map(team => (
                    <div
                        key={team}
                        className={`card ${styles.team} ${winner === team ? styles.winner : ''}`}
                        style={{ '--team-color': teamColor(team) } as React.CSSProperties}
                    >
                        <div className={styles.teamHead}>
                            <span className={styles.dot} />
                            <h2>{teamName(team)}</h2>
                            {winner === team && <TrophyIcon size={18} className={styles.trophy} />}
                        </div>
                        <span className={styles.score}>{room.teamScores[team]}<small> pts</small></span>
                        <ul className={styles.members}>
                            {room.players.filter(p => p.team === team).map(p => (
                                <li key={p.id} className={styles.member}>
                                    <Avatar name={p.nickname} colorIndex={p.colorIndex} size="sm" />
                                    <span>{p.nickname}{p.id === me?.id ? ' (você)' : ''}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </section>

            <section className={`${resultStyles.highlights} anim-fade-up`} style={{ animationDelay: '0.25s' }}>
                <div className={`card ${resultStyles.highlight}`}>
                    <span className={resultStyles.highlightIcon}><TargetIcon size={20} /></span>
                    <span className={resultStyles.highlightLabel}>Na mosca</span>
                    <strong>{pair(t => stats.teams[t].bullseyes)}</strong>
                    <span className="muted">{teamName(0)} × {teamName(1)}</span>
                </div>
                <div className={`card ${resultStyles.highlight}`}>
                    <span className={resultStyles.highlightIcon}><EyeIcon size={20} /></span>
                    <span className={resultStyles.highlightLabel}>Melhor Vidente</span>
                    <strong>{bestSeer ? nameOf(bestSeer.playerId) : '—'}</strong>
                    <span className="muted">{bestSeer ? `${(bestSeer.points / bestSeer.rounds).toFixed(1)} pts por dica` : 'sem dicas'}</span>
                </div>
                <div className={`card ${resultStyles.highlight}`}>
                    <span className={resultStyles.highlightIcon}><SparklesIcon size={20} /></span>
                    <span className={resultStyles.highlightLabel}>Esquerda ou direita</span>
                    <strong>{pair(t => stats.teams[t].sideHits)}</strong>
                    <span className="muted">chutes certos de lado</span>
                </div>
            </section>

            <section className={`${resultStyles.actions} anim-fade-up`} style={{ animationDelay: '0.3s' }}>
                {isHost ? (
                    <>
                        <button className="btn btn-primary btn-lg" onClick={onPlayAgain}>
                            <RotateIcon /> Jogar de novo
                        </button>
                        <button className="btn btn-secondary" onClick={onBackToLobby}>
                            <HomeIcon /> Voltar ao lobby
                        </button>
                    </>
                ) : (
                    <p className={resultStyles.waitHost}>
                        <span className="dots"><span /><span /><span /></span>
                        Esperando o anfitrião decidir a revanche…
                    </p>
                )}
                <button className="btn btn-ghost" onClick={onLeave}>
                    <LogOutIcon /> Sair da sala
                </button>
            </section>
        </div>
    )
}
