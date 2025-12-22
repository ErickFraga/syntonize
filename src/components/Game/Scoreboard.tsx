'use client'

import { Player } from '@/types/game'
import styles from './Scoreboard.module.css'

interface ScoreboardProps {
    players: Player[]
    targetScore: number
    currentSeerId: string
}

export default function Scoreboard({ players, targetScore, currentSeerId }: ScoreboardProps) {
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score)
    const maxScore = Math.max(...players.map(p => p.score), 1)

    return (
        <div className={`glass ${styles.scoreboard}`}>
            <h3 className={styles.title}>
                Placar
                <span className={styles.targetScore}>Meta: {targetScore} pts</span>
            </h3>

            <ul className={styles.playerList}>
                {sortedPlayers.map((player, index) => (
                    <li
                        key={player.id}
                        className={`${styles.playerItem} ${index < 3 ? styles[`rank${index + 1}`] : ''}`}
                    >
                        <div className={styles.playerInfo}>
                            <span className={styles.rank}>{index + 1}</span>
                            <span className={styles.avatar}>
                                {player.nickname.charAt(0).toUpperCase()}
                            </span>
                            <span className={styles.name}>
                                {player.nickname}
                                {player.id === currentSeerId && (
                                    <span className={styles.seerBadge}>👁️ Vidente</span>
                                )}
                            </span>
                        </div>

                        <div className={styles.scoreInfo}>
                            <div className={styles.progressBar}>
                                <div
                                    className={styles.progressFill}
                                    style={{ width: `${(player.score / targetScore) * 100}%` }}
                                />
                            </div>
                            <span className={styles.score}>{player.score}</span>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    )
}
