'use client'

import { Room, Player } from '@/types/game'
import styles from './Lobby.module.css'

// SVG Icons
const ClipboardIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
)

const PlayIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
)

const XIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
    </svg>
)

interface LobbyProps {
    room: Room
    currentPlayer: Player | null
    onStartGame: () => void
    onCopyLink: () => void
    onKickPlayer?: (playerId: string) => void
}

export default function Lobby({ room, currentPlayer, onStartGame, onCopyLink, onKickPlayer }: LobbyProps) {
    const isHost = currentPlayer?.isHost
    const canStart = room.players.length >= 2

    const handleKick = (playerId: string) => {
        if (onKickPlayer) {
            onKickPlayer(playerId)
        }
    }

    return (
        <div className={styles.lobby}>
            <div className={styles.header}>
                <h1 className={styles.title}>Sala de Espera</h1>
                <p className={styles.subtitle}>
                    Compartilhe o link para seus amigos entrarem!
                </p>
            </div>

            <button className={`btn btn-secondary ${styles.shareBtn}`} onClick={onCopyLink}>
                <ClipboardIcon />
                Copiar Link da Sala
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
                            <div className={styles.playerActions}>
                                <span className={`${styles.statusDot} ${player.isConnected ? styles.online : ''}`} />
                                {isHost && !player.isHost && player.id !== currentPlayer?.id && (
                                    <button
                                        className={styles.kickBtn}
                                        onClick={() => handleKick(player.id)}
                                        title="Remover jogador"
                                    >
                                        <XIcon />
                                    </button>
                                )}
                            </div>
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
                        {canStart ? (
                            <>
                                <PlayIcon />
                                Iniciar Jogo
                            </>
                        ) : (
                            'Aguardando jogadores...'
                        )}
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
