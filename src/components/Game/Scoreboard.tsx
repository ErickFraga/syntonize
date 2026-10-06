'use client'

import { activePlayers } from '@shared/gameLogic'
import type { Room } from '@/types/game'
import Avatar from '@/components/ui/Avatar'
import { TrophyIcon, EyeIcon, CheckIcon, CrownIcon } from '@/components/ui/Icons'
import { useT } from '@/i18n/I18nProvider'
import styles from './Scoreboard.module.css'

interface ScoreboardProps {
    room: Room
    meId: string | null
}

export default function Scoreboard({ room, meId }: ScoreboardProps) {
    const { t } = useT()
    const round = room.currentRound
    const sorted = [...activePlayers(room)].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname))
    const target = room.settings.targetScore
    const leader = sorted[0]?.score ?? 0

    return (
        <div className={`card ${styles.board}`}>
            <header className={styles.header}>
                <h3><TrophyIcon size={18} /> {t('score.title')}</h3>
                <span className="chip">{t('common.goal', { n: target })}</span>
            </header>

            <ol className={styles.list}>
                {sorted.map((player, index) => {
                    const pct = Math.max(0, Math.min(100, (player.score / target) * 100))
                    const isSeer = round?.seerId === player.id
                    const showLock = round?.phase === 'guessing' && !isSeer
                    const showReady = round?.phase === 'revealed'
                    return (
                        <li
                            key={player.id}
                            className={`${styles.row} ${player.id === meId ? styles.me : ''} ${player.isConnected ? '' : styles.offline}`}
                        >
                            <span className={`${styles.rank} ${index === 0 && leader > 0 ? styles.rankLeader : ''}`}>{index + 1}</span>
                            <Avatar name={player.nickname} colorIndex={player.colorIndex} size="sm" offline={!player.isConnected} />
                            <div className={styles.info}>
                                <span className={styles.name}>
                                    {player.nickname}
                                    {player.isHost && <CrownIcon size={12} className={styles.crown} />}
                                    {isSeer && <span className={styles.seer}><EyeIcon size={12} /></span>}
                                </span>
                                <span className={styles.bar}>
                                    <span className={styles.fill} style={{ width: `${pct}%` }} />
                                </span>
                            </div>
                            <span className={styles.status}>
                                {showLock && player.hasGuessed && <CheckIcon size={14} />}
                                {showReady && player.isReady && <CheckIcon size={14} />}
                            </span>
                            <span className={styles.score}>{player.score}</span>
                        </li>
                    )
                })}
            </ol>

            {room.roundHistory.length > 0 && (
                <footer className={styles.footer}>
                    {room.settings.maxRounds > 0
                        ? t('score.roundOf', { n: `${room.roundHistory.length}${round?.phase !== 'revealed' ? ' + 1' : ''}`, max: room.settings.maxRounds })
                        : t('score.played', { count: room.roundHistory.length })}
                </footer>
            )}
        </div>
    )
}
