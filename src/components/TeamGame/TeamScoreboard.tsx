'use client'

import type { Room } from '@/types/game'
import Avatar from '@/components/ui/Avatar'
import { TrophyIcon, EyeIcon, CheckIcon, CrownIcon } from '@/components/ui/Icons'
import { TEAM_IDS, teamColor, teamName } from '@/lib/teams'
import styles from './TeamScoreboard.module.css'

interface TeamScoreboardProps {
    room: Room
    meId: string | null
}

export default function TeamScoreboard({ room, meId }: TeamScoreboardProps) {
    const round = room.currentRound
    const target = room.settings.targetScore
    const active = round?.teamPlay?.team ?? null

    return (
        <div className={`card ${styles.board}`}>
            <header className={styles.header}>
                <h3><TrophyIcon size={18} /> Placar</h3>
                <span className="chip">meta {target}</span>
            </header>

            {TEAM_IDS.map(team => {
                const score = room.teamScores[team]
                const pct = Math.max(0, Math.min(100, (score / target) * 100))
                const members = room.players.filter(p => p.team === team)
                return (
                    <section
                        key={team}
                        className={`${styles.team} ${active === team ? styles.active : ''}`}
                        style={{ '--team-color': teamColor(team) } as React.CSSProperties}
                    >
                        <div className={styles.teamHead}>
                            <span className={styles.dot} />
                            <span className={styles.teamName}>{teamName(team)}</span>
                            <span className={styles.score}>{score}</span>
                        </div>
                        <span className={styles.bar}><span className={styles.fill} style={{ width: `${pct}%` }} /></span>
                        <ul className={styles.members}>
                            {members.map(p => (
                                <li key={p.id} className={`${styles.member} ${p.id === meId ? styles.me : ''} ${p.isConnected ? '' : styles.offline}`} title={p.nickname}>
                                    <Avatar name={p.nickname} colorIndex={p.colorIndex} size="sm" offline={!p.isConnected} />
                                    <span className={styles.name}>{p.nickname}</span>
                                    {p.isHost && <CrownIcon size={12} className={styles.crown} />}
                                    {round?.seerId === p.id && <EyeIcon size={13} className={styles.seer} />}
                                    {round?.phase === 'revealed' && p.isReady && <CheckIcon size={13} className={styles.ready} />}
                                </li>
                            ))}
                        </ul>
                    </section>
                )
            })}

            {room.roundHistory.length > 0 && (
                <footer className={styles.footer}>
                    {room.settings.maxRounds > 0
                        ? `Rodada ${room.roundHistory.length}${round?.phase !== 'revealed' ? ' + 1' : ''} de ${room.settings.maxRounds}`
                        : `${room.roundHistory.length} rodada${room.roundHistory.length === 1 ? '' : 's'} jogada${room.roundHistory.length === 1 ? '' : 's'}`}
                </footer>
            )}
        </div>
    )
}
