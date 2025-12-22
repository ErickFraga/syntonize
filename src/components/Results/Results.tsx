'use client'

import { Room, Player } from '@/types/game'
import styles from './Results.module.css'

interface ResultsProps {
    room: Room
    currentPlayer: Player | null
    onPlayAgain: () => void
    onLeave: () => void
}

export default function Results({ room, currentPlayer, onPlayAgain, onLeave }: ResultsProps) {
    const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score)
    const winner = sortedPlayers[0]
    const isHost = currentPlayer?.isHost
    const isWinner = currentPlayer?.id === winner?.id

    return (
        <div className={styles.results}>
            <div className={styles.celebration}>
                {isWinner ? '🎉' : '🏆'}
            </div>

            <h1 className={styles.title}>
                {isWinner ? 'Você Venceu!' : `${winner?.nickname} Venceu!`}
            </h1>

            <p className={styles.subtitle}>
                Com {winner?.score} pontos
            </p>

            <div className={`glass ${styles.podium}`}>
                <h3>Ranking Final</h3>
                <ol className={styles.rankingList}>
                    {sortedPlayers.map((player, index) => (
                        <li
                            key={player.id}
                            className={`${styles.rankItem} ${index < 3 ? styles[`place${index + 1}`] : ''}`}
                        >
                            <span className={styles.position}>
                                {index === 0 && '🥇'}
                                {index === 1 && '🥈'}
                                {index === 2 && '🥉'}
                                {index > 2 && `${index + 1}º`}
                            </span>
                            <span className={styles.playerName}>
                                {player.nickname}
                                {player.id === currentPlayer?.id && ' (Você)'}
                            </span>
                            <span className={styles.finalScore}>{player.score} pts</span>
                        </li>
                    ))}
                </ol>
            </div>

            <div className={styles.stats}>
                <div className={styles.statItem}>
                    <span className={styles.statValue}>{room.roundHistory.length}</span>
                    <span className={styles.statLabel}>Rodadas</span>
                </div>
                <div className={styles.statItem}>
                    <span className={styles.statValue}>{room.players.length}</span>
                    <span className={styles.statLabel}>Jogadores</span>
                </div>
            </div>

            <div className={styles.actions}>
                {isHost ? (
                    <button className="btn btn-primary" onClick={onPlayAgain}>
                        🔄 Jogar Novamente
                    </button>
                ) : (
                    <p className={styles.waitingHost}>Aguardando host iniciar nova partida...</p>
                )}
                <button className="btn btn-secondary" onClick={onLeave}>
                    Sair da Sala
                </button>
            </div>
        </div>
    )
}
