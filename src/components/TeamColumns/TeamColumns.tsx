'use client'

import type { Room, Player, TeamId } from '@/types/game'
import { TEAM_RULES } from '@/types/game'
import Avatar from '@/components/ui/Avatar'
import { CrownIcon, XIcon, ArrowRightIcon } from '@/components/ui/Icons'
import { TEAM_IDS, teamColor, teamName } from '@/lib/teams'
import styles from './TeamColumns.module.css'

interface TeamColumnsProps {
    room: Room
    me: Player | null
    isHost: boolean
    onSetTeam: (playerId: string, team: TeamId) => void
    onKickPlayer: (playerId: string) => void
}

/** Lobby player list in team mode: one column per team, join/move buttons. */
export default function TeamColumns({ room, me, isHost, onSetTeam, onKickPlayer }: TeamColumnsProps) {
    return (
        <div className={styles.columns}>
            {TEAM_IDS.map(team => {
                const members = room.players.filter(p => p.team === team)
                const other: TeamId = team === 0 ? 1 : 0
                const short = members.filter(p => p.isConnected).length < TEAM_RULES.MIN_PER_TEAM
                return (
                    <section key={team} className={styles.team} style={{ '--team-color': teamColor(team) } as React.CSSProperties}>
                        <header className={styles.teamHead}>
                            <span className={styles.teamDot} />
                            <h3>{teamName(team)}</h3>
                            <span className={styles.count}>{members.length}</span>
                        </header>
                        <ul className={styles.list}>
                            {members.map(player => (
                                <li key={player.id} className={`${styles.member} ${player.isConnected ? '' : styles.offline}`}>
                                    <Avatar name={player.nickname} colorIndex={player.colorIndex} size="sm" offline={!player.isConnected} />
                                    <span className={styles.name}>
                                        {player.nickname}
                                        {player.isHost && <CrownIcon size={12} className={styles.crown} />}
                                        {player.id === me?.id && <span className={styles.you}>você</span>}
                                    </span>
                                    {isHost && player.id !== me?.id && (
                                        <>
                                            <button className={styles.iconBtn} onClick={() => onSetTeam(player.id, other)} title={`Mover ${player.nickname} para o ${teamName(other)}`} aria-label={`Mover ${player.nickname} para o ${teamName(other)}`}>
                                                <ArrowRightIcon size={15} className={team === 1 ? styles.flip : ''} />
                                            </button>
                                            <button className={`${styles.iconBtn} ${styles.kick}`} onClick={() => onKickPlayer(player.id)} title={`Remover ${player.nickname}`} aria-label={`Remover ${player.nickname}`}>
                                                <XIcon size={15} />
                                            </button>
                                        </>
                                    )}
                                </li>
                            ))}
                            {short && <li className={styles.placeholder}>Precisa de {TEAM_RULES.MIN_PER_TEAM} jogadores</li>}
                        </ul>
                        {me && me.team !== team && (
                            <button className="btn btn-secondary btn-sm btn-block" onClick={() => onSetTeam(me.id, team)}>
                                Entrar no {teamName(team)}
                            </button>
                        )}
                    </section>
                )
            })}
        </div>
    )
}
