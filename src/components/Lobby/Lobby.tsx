'use client'

import { useState } from 'react'
import type { Room, Player, RoomSettings, TeamId, NumericSetting, GameMode } from '@/types/game'
import { SETTINGS_OPTIONS, LIMITS, TEAM_RULES, settingOptionsFor } from '@/types/game'
import Avatar from '@/components/ui/Avatar'
import TeamColumns from '@/components/TeamColumns/TeamColumns'
import { CopyIcon, CheckIcon, ShareIcon, PlayIcon, CrownIcon, XIcon, UsersIcon, SettingsIcon } from '@/components/ui/Icons'
import styles from './Lobby.module.css'

interface LobbyProps {
    room: Room
    me: Player | null
    isHost: boolean
    onStartGame: () => void
    onKickPlayer: (playerId: string) => void
    onUpdateSettings: (settings: Partial<RoomSettings>) => void
    onSetTeam: (playerId: string, team: TeamId) => void
    onNotify: (message: string, kind?: 'info' | 'success' | 'warning' | 'error') => void
}

const MODES: Array<{ value: GameMode; label: string }> = [
    { value: 'ffa', label: 'Todos contra todos' },
    { value: 'teams', label: 'Em equipes' },
]

const SETTING_LABELS: Record<NumericSetting, { title: string; hint: string; format: (v: number) => string }> = {
    targetScore: { title: 'Pontos para vencer', hint: 'A partida termina quando alguém chega lá', format: v => `${v}` },
    maxRounds: { title: 'Limite de rodadas', hint: 'Termina antes se o limite chegar primeiro', format: v => (v === 0 ? 'Sem limite' : `${v}`) },
    timePerGuess: { title: 'Tempo para palpitar', hint: 'Contado a partir da dica', format: v => `${v}s` },
    timePerClue: { title: 'Tempo para a dica', hint: 'O Vidente perde a vez se estourar', format: v => (v === 0 ? 'Livre' : `${v}s`) },
    timeBetweenRounds: { title: 'Pausa entre rodadas', hint: 'Ou quando todos estiverem prontos', format: v => `${v}s` },
}

export default function Lobby({ room, me, isHost, onStartGame, onKickPlayer, onUpdateSettings, onSetTeam, onNotify }: LobbyProps) {
    const [copied, setCopied] = useState<'code' | 'link' | null>(null)
    const connected = room.players.filter(p => p.isConnected).length
    const teams = room.settings.mode === 'teams'
    const teamsReady = !teams || ([0, 1] as TeamId[]).every(t => room.players.filter(p => p.team === t && p.isConnected).length >= TEAM_RULES.MIN_PER_TEAM)
    const canStart = connected >= LIMITS.MIN_PLAYERS && teamsReady

    const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}/join/${room.code}` : `/join/${room.code}`

    const copy = async (text: string, what: 'code' | 'link') => {
        try {
            await navigator.clipboard.writeText(text)
            setCopied(what)
            onNotify(what === 'code' ? 'Código copiado!' : 'Link de convite copiado!', 'success')
            window.setTimeout(() => setCopied(null), 2000)
        } catch {
            onNotify('Não deu para copiar. Selecione e copie manualmente.', 'warning')
        }
    }

    const share = async () => {
        const nav = navigator as Navigator & { share?: (data: { title: string; text: string; url: string }) => Promise<void> }
        if (nav.share) {
            try {
                await nav.share({ title: 'Syntonize', text: `Bora jogar Syntonize! Entra na minha sala ${room.code}`, url: inviteUrl })
                return
            } catch {
                /* user cancelled: fall through to copy */
            }
        }
        copy(inviteUrl, 'link')
    }

    return (
        <div className={styles.lobby}>
            <section className={`card-solid ${styles.invite} anim-fade-up`}>
                <div className={styles.inviteText}>
                    <span className="eyebrow">Sala de espera</span>
                    <h1 className={styles.title}>Chama a galera</h1>
                    <p className="muted">Compartilhe o código ou o link. Quem entrar aparece aqui na hora.</p>
                </div>

                <div className={styles.codeBlock}>
                    <button className={styles.code} onClick={() => copy(room.code, 'code')} title="Copiar código">
                        <span className={styles.codeLabel}>Código da sala</span>
                        <span className={styles.codeValue}>{room.code}</span>
                        <span className={styles.codeCopy}>{copied === 'code' ? <CheckIcon size={16} /> : <CopyIcon size={16} />}</span>
                    </button>
                    <div className={styles.inviteActions}>
                        <button className="btn btn-secondary" onClick={() => copy(inviteUrl, 'link')}>
                            {copied === 'link' ? <CheckIcon /> : <CopyIcon />}
                            Copiar link
                        </button>
                        <button className="btn btn-primary" onClick={share}>
                            <ShareIcon />
                            Convidar
                        </button>
                    </div>
                </div>
            </section>

            <div className={styles.columns}>
                <section className={`card ${styles.players} anim-fade-up`} style={{ animationDelay: '0.05s' }}>
                    <header className={styles.sectionHeader}>
                        <h2><UsersIcon size={20} /> Jogadores</h2>
                        <span className="chip">{room.players.length}/{LIMITS.MAX_PLAYERS}</span>
                    </header>

                    {teams ? (
                        <TeamColumns room={room} me={me} isHost={isHost} onSetTeam={onSetTeam} onKickPlayer={onKickPlayer} />
                    ) : (
                    <ul className={styles.playerList}>
                        {room.players.map((player, index) => (
                            <li key={player.id} className={`${styles.player} ${player.isConnected ? '' : styles.playerOffline} anim-pop`} style={{ animationDelay: `${index * 0.05}s` }}>
                                <Avatar name={player.nickname} colorIndex={player.colorIndex} offline={!player.isConnected} />
                                <div className={styles.playerInfo}>
                                    <span className={styles.playerName}>
                                        {player.nickname}
                                        {player.id === me?.id && <span className={styles.you}>você</span>}
                                    </span>
                                    <span className={styles.playerMeta}>
                                        {player.isHost && <span className={styles.hostTag}><CrownIcon size={12} /> Anfitrião</span>}
                                        {!player.isConnected && <span className={styles.offlineTag}>reconectando…</span>}
                                    </span>
                                </div>
                                {isHost && player.id !== me?.id && (
                                    <button className={styles.kick} onClick={() => onKickPlayer(player.id)} title={`Remover ${player.nickname}`} aria-label={`Remover ${player.nickname}`}>
                                        <XIcon size={16} />
                                    </button>
                                )}
                            </li>
                        ))}
                        {room.players.length < LIMITS.MIN_PLAYERS && (
                            <li className={styles.playerPlaceholder}>
                                <span className={styles.placeholderAvatar} />
                                <span>Esperando mais gente…</span>
                            </li>
                        )}
                    </ul>
                    )}
                </section>

                <section className={`card ${styles.settings} anim-fade-up`} style={{ animationDelay: '0.1s' }}>
                    <header className={styles.sectionHeader}>
                        <h2><SettingsIcon size={20} /> Regras da partida</h2>
                        {!isHost && <span className="chip">só o anfitrião edita</span>}
                    </header>

                    <div className={styles.settingList}>
                        <div className={styles.setting}>
                            <div className={styles.settingText}>
                                <span className={styles.settingTitle}>Modo de jogo</span>
                                <span className={styles.settingHint}>{teams ? 'Dois times, um palpite por time; o adversário chuta esquerda ou direita' : 'Cada um por si, todo mundo palpita'}</span>
                            </div>
                            <div className={styles.segmented} role="radiogroup" aria-label="Modo de jogo">
                                {MODES.map(m => (
                                    <button
                                        key={m.value}
                                        role="radio"
                                        aria-checked={m.value === room.settings.mode}
                                        className={`${styles.segment} ${m.value === room.settings.mode ? styles.segmentActive : ''}`}
                                        disabled={!isHost}
                                        onClick={() => onUpdateSettings({ mode: m.value })}
                                    >
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {teams && (
                            <div className={styles.setting}>
                                <div className={styles.settingText}>
                                    <span className={styles.settingTitle}>Revanche no 4</span>
                                    <span className={styles.settingHint}>Time que acerta na mosca e continua atrás joga de novo</span>
                                </div>
                                <div className={styles.segmented} role="radiogroup" aria-label="Revanche no 4">
                                    {[true, false].map(on => (
                                        <button
                                            key={String(on)}
                                            role="radio"
                                            aria-checked={on === room.settings.catchUp}
                                            className={`${styles.segment} ${on === room.settings.catchUp ? styles.segmentActive : ''}`}
                                            disabled={!isHost}
                                            onClick={() => onUpdateSettings({ catchUp: on })}
                                        >
                                            {on ? 'Ligada' : 'Desligada'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {(Object.keys(SETTINGS_OPTIONS) as NumericSetting[]).map(key => {
                            const meta = SETTING_LABELS[key]
                            const options = settingOptionsFor(room.settings.mode, key)
                            const value = room.settings[key]
                            return (
                                <div key={key} className={styles.setting}>
                                    <div className={styles.settingText}>
                                        <span className={styles.settingTitle}>{meta.title}</span>
                                        <span className={styles.settingHint}>{meta.hint}</span>
                                    </div>
                                    <div className={styles.segmented} role="radiogroup" aria-label={meta.title}>
                                        {options.map(opt => (
                                            <button
                                                key={opt}
                                                role="radio"
                                                aria-checked={opt === value}
                                                className={`${styles.segment} ${opt === value ? styles.segmentActive : ''}`}
                                                disabled={!isHost}
                                                onClick={() => onUpdateSettings({ [key]: opt })}
                                            >
                                                {meta.format(opt)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </section>
            </div>

            <section className={`${styles.footer} anim-fade-up`} style={{ animationDelay: '0.15s' }}>
                {isHost ? (
                    <>
                        <button className="btn btn-primary btn-lg" onClick={onStartGame} disabled={!canStart}>
                            <PlayIcon />
                            {canStart ? 'Começar partida' : connected >= LIMITS.MIN_PLAYERS ? `${TEAM_RULES.MIN_PER_TEAM} por time para começar` : `Faltam ${LIMITS.MIN_PLAYERS - connected} jogador${LIMITS.MIN_PLAYERS - connected > 1 ? 'es' : ''}`}
                        </button>
                        <p className="muted">Mínimo de {LIMITS.MIN_PLAYERS} jogadores. Dá para entrar depois que a partida começar também.</p>
                    </>
                ) : (
                    <div className={styles.waiting}>
                        <span className="dots"><span /><span /><span /></span>
                        <p>Esperando o anfitrião começar a partida…</p>
                    </div>
                )}
            </section>
        </div>
    )
}
