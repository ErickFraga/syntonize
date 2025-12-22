'use client'

import { Room, Player } from '@/types/game'
import styles from './Lobby.module.css'

interface LobbyProps {
    room: Room
    currentPlayer: Player | null
    onStartGame: () => void
    onCopyLink: () => void
}

export default function Lobby({ room, currentPlayer, onStartGame, onCopyLink }: LobbyProps) {
    const isHost = currentPlayer?.isHost
    const canStart = room.players.length >= 2

    return (
        <div className={styles.lobby}>
            <div className={styles.header}>
                <h1 className={styles.title}>Sala de Espera</h1>
                <p className={styles.subtitle}>
                    Compartilhe o link para seus amigos entrarem!
                </p>
            </div>

            <button className={`btn btn-secondary ${styles.shareBtn}`} onClick={onCopyLink}>
                📋 Copiar Link da Sala
            </button>

            <div className={`glass ${styles.playersList}`}>
                <h3>Jogadores ({room.players.length})</h3>
                <ul>
                    {room.players.map((player, index) => (
                        <li
                            key={player.id}
                            className={`${styles.playerItem} animate-slideIn`}
                            style={{ animationDelay: `${index * 0.1}s` }}
                        >
                            <span className={styles.playerAvatar}>
                                {player.nickname.charAt(0).toUpperCase()}
                            </span>
                            <span className={styles.playerName}>
                                {player.nickname}
                                {player.isHost && <span className={styles.hostBadge}>Host</span>}
                                {player.id === currentPlayer?.id && <span className={styles.youBadge}>Você</span>}
                            </span>
                            <span className={`${styles.statusDot} ${player.isConnected ? styles.online : ''}`} />
                        </li>
                    ))}
                </ul>
            </div>

            {isHost ? (
                <div className={styles.hostControls}>
                    <button
                        className="btn btn-primary"
                        onClick={onStartGame}
                        disabled={!canStart}
                    >
                        {canStart ? '🎮 Iniciar Jogo' : 'Aguardando jogadores...'}
                    </button>
                    {!canStart && (
                        <p className={styles.waitingText}>
                            Mínimo 2 jogadores para começar
                        </p>
                    )}
                </div>
            ) : (
                <div className={styles.waitingHost}>
                    <div className={styles.waitingAnimation}>
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                    <p>Aguardando o host iniciar o jogo...</p>
                </div>
            )}
        </div>
    )
}
