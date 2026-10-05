'use client'

import { useState } from 'react'
import type { Room, Player, RoomSettings, TeamId, NumericSetting, GameMode } from '@/types/game'
import { SETTINGS_OPTIONS, LIMITS, TEAM_RULES, settingOptionsFor } from '@/types/game'
import Avatar from '@/components/ui/Avatar'
import TeamColumns from '@/components/TeamColumns/TeamColumns'
import { useT, type Translator } from '@/i18n/I18nProvider'
import type { TranslationKey } from '@/i18n'
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

const MODES: Array<{ value: GameMode; label: TranslationKey }> = [
    { value: 'ffa', label: 'lobby.modeFfa' },
    { value: 'teams', label: 'lobby.modeTeams' },
]

const SETTING_LABELS: Record<NumericSetting, { title: TranslationKey; hint: TranslationKey; format: (v: number, t: Translator['t']) => string }> = {
    targetScore: { title: 'settings.targetScore', hint: 'settings.targetScoreHint', format: v => `${v}` },
    maxRounds: { title: 'settings.maxRounds', hint: 'settings.maxRoundsHint', format: (v, t) => (v === 0 ? t('settings.unlimited') : `${v}`) },
    timePerGuess: { title: 'settings.timePerGuess', hint: 'settings.timePerGuessHint', format: (v, t) => t('settings.seconds', { n: v }) },
    timePerClue: { title: 'settings.timePerClue', hint: 'settings.timePerClueHint', format: (v, t) => (v === 0 ? t('settings.free') : t('settings.seconds', { n: v })) },
    timeBetweenRounds: { title: 'settings.timeBetweenRounds', hint: 'settings.timeBetweenRoundsHint', format: (v, t) => t('settings.seconds', { n: v }) },
}

export default function Lobby({ room, me, isHost, onStartGame, onKickPlayer, onUpdateSettings, onSetTeam, onNotify }: LobbyProps) {
    const { t } = useT()
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
            onNotify(what === 'code' ? t('lobby.codeCopied') : t('room.linkCopied'), 'success')
            window.setTimeout(() => setCopied(null), 2000)
        } catch {
            onNotify(t('lobby.copyFailed'), 'warning')
        }
    }

    const share = async () => {
        const nav = navigator as Navigator & { share?: (data: { title: string; text: string; url: string }) => Promise<void> }
        if (nav.share) {
            try {
                await nav.share({ title: 'Syntonize', text: t('lobby.shareText', { code: room.code }), url: inviteUrl })
                return
            } catch {
                /* user cancelled: fall through to copy */
            }
        }
        copy(inviteUrl, 'link')
    }

    return (
        <div className={styles.lobby}>
            <section className={`card ${styles.invite} anim-fade-up`}>
                <div className={styles.inviteText}>
                    <span className="eyebrow">{t('lobby.eyebrow')}</span>
                    <h1 className={styles.title}>{t('lobby.title')}</h1>
                    <p className="muted">{t('lobby.subtitle')}</p>
                </div>

                <div className={styles.codeBlock}>
                    <button className={styles.code} onClick={() => copy(room.code, 'code')} title={t('lobby.copyCode')}>
                        <span className={styles.codeLabel}>{t('lobby.codeLabel')}</span>
                        <span className={styles.codeValue}>{room.code}</span>
                        <span className={styles.codeCopy}>{copied === 'code' ? <CheckIcon size={16} /> : <CopyIcon size={16} />}</span>
                    </button>
                    <div className={styles.inviteActions}>
                        <button className="btn btn-secondary" onClick={() => copy(inviteUrl, 'link')}>
                            {copied === 'link' ? <CheckIcon /> : <CopyIcon />}
                            {t('lobby.copyLink')}
                        </button>
                        <button className="btn btn-primary" onClick={share}>
                            <ShareIcon />
                            {t('lobby.invite')}
                        </button>
                    </div>
                </div>
            </section>

            <div className={styles.columns}>
                <section className={`card ${styles.players} anim-fade-up`} style={{ animationDelay: '0.05s' }}>
                    <header className={styles.sectionHeader}>
                        <h2><UsersIcon size={20} /> {t('lobby.players')}</h2>
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
                                        {player.id === me?.id && <span className={styles.you}>{t('common.you')}</span>}
                                    </span>
                                    <span className={styles.playerMeta}>
                                        {player.isHost && <span className={styles.hostTag}><CrownIcon size={12} /> {t('lobby.host')}</span>}
                                        {!player.isConnected && <span className={styles.offlineTag}>{t('common.reconnecting')}</span>}
                                    </span>
                                </div>
                                {isHost && player.id !== me?.id && (
                                    <button className={styles.kick} onClick={() => onKickPlayer(player.id)} title={t('lobby.remove', { name: player.nickname })} aria-label={t('lobby.remove', { name: player.nickname })}>
                                        <XIcon size={16} />
                                    </button>
                                )}
                            </li>
                        ))}
                        {room.players.length < LIMITS.MIN_PLAYERS && (
                            <li className={styles.playerPlaceholder}>
                                <span className={styles.placeholderAvatar} />
                                <span>{t('lobby.waitingMore')}</span>
                            </li>
                        )}
                    </ul>
                    )}
                </section>

                <section className={`card ${styles.settings} anim-fade-up`} style={{ animationDelay: '0.1s' }}>
                    <header className={styles.sectionHeader}>
                        <h2><SettingsIcon size={20} /> {t('lobby.rules')}</h2>
                        {!isHost && <span className="chip">{t('lobby.hostOnly')}</span>}
                    </header>

                    <div className={styles.settingList}>
                        <div className={styles.setting}>
                            <div className={styles.settingText}>
                                <span className={styles.settingTitle}>{t('lobby.mode')}</span>
                                <span className={styles.settingHint}>{teams ? t('lobby.modeHintTeams') : t('lobby.modeHintFfa')}</span>
                            </div>
                            <div className={styles.segmented} role="radiogroup" aria-label={t('lobby.mode')}>
                                {MODES.map(m => (
                                    <button
                                        key={m.value}
                                        role="radio"
                                        aria-checked={m.value === room.settings.mode}
                                        className={`${styles.segment} ${m.value === room.settings.mode ? styles.segmentActive : ''}`}
                                        disabled={!isHost}
                                        onClick={() => onUpdateSettings({ mode: m.value })}
                                    >
                                        {t(m.label)}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {teams && (
                            <div className={styles.setting}>
                                <div className={styles.settingText}>
                                    <span className={styles.settingTitle}>{t('lobby.catchUp')}</span>
                                    <span className={styles.settingHint}>{t('lobby.catchUpHint')}</span>
                                </div>
                                <div className={styles.segmented} role="radiogroup" aria-label={t('lobby.catchUp')}>
                                    {[true, false].map(on => (
                                        <button
                                            key={String(on)}
                                            role="radio"
                                            aria-checked={on === room.settings.catchUp}
                                            className={`${styles.segment} ${on === room.settings.catchUp ? styles.segmentActive : ''}`}
                                            disabled={!isHost}
                                            onClick={() => onUpdateSettings({ catchUp: on })}
                                        >
                                            {on ? t('lobby.on') : t('lobby.off')}
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
                                        <span className={styles.settingTitle}>{t(meta.title)}</span>
                                        <span className={styles.settingHint}>{t(key === 'targetScore' && teams ? 'settings.targetScoreHintTeams' : meta.hint)}</span>
                                    </div>
                                    <div className={styles.segmented} role="radiogroup" aria-label={t(meta.title)}>
                                        {options.map(opt => (
                                            <button
                                                key={opt}
                                                role="radio"
                                                aria-checked={opt === value}
                                                className={`${styles.segment} ${opt === value ? styles.segmentActive : ''}`}
                                                disabled={!isHost}
                                                onClick={() => onUpdateSettings({ [key]: opt })}
                                            >
                                                {meta.format(opt, t)}
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
                            {canStart ? t('lobby.start') : connected >= LIMITS.MIN_PLAYERS ? t('lobby.perTeam', { min: TEAM_RULES.MIN_PER_TEAM }) : t('lobby.missing', { count: LIMITS.MIN_PLAYERS - connected })}
                        </button>
                        <p className="muted">{t('lobby.minHint', { min: LIMITS.MIN_PLAYERS })}</p>
                    </>
                ) : (
                    <div className={styles.waiting}>
                        <span className="dots"><span /><span /><span /></span>
                        <p>{t('lobby.waitingHost')}</p>
                    </div>
                )}
            </section>
        </div>
    )
}
