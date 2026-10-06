'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { Room, GameRound, SkippedRound, RoundPlayer, TeamId } from '@/types/game'
import Dial, { type DialMarker } from '@/components/Dial/Dial'
import Avatar from '@/components/ui/Avatar'
import { HistoryIcon, XIcon, EyeIcon, ChevronLeftIcon, ChevronRightIcon, SkipIcon } from '@/components/ui/Icons'
import { teamColor, teamKey } from '@/lib/teams'
import { useT } from '@/i18n/I18nProvider'
import gameStyles from '@/components/Game/Game.module.css'
import styles from './RoundHistory.module.css'

interface RoundHistoryProps {
    /** Room with the history merged back in (see useGameState). */
    room: Room
    meId: string | null
    /** Small button for the round bar, or a regular one for the results screen. */
    variant?: 'bar' | 'results'
    /** Starts open (used by the static preview). */
    defaultOpen?: boolean
}

const ZONE_LABEL = { 4: 'zone.4', 3: 'zone.3', 2: 'zone.2', 0: 'zone.0' } as const
const SIDE_LABEL = { left: 'side.left', right: 'side.right' } as const
const SKIP_LABEL = {
    host: 'history.skip.host',
    clue_timeout: 'history.skip.clue_timeout',
    seer_left: 'history.skip.seer_left',
    seer_kicked: 'history.skip.seer_kicked',
    seer_disconnected: 'history.skip.seer_disconnected',
} as const

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'

type Entry =
    | { kind: 'round'; at: number; round: GameRound }
    | { kind: 'skipped'; at: number; skipped: SkippedRound }

/** Revealed and skipped rounds, newest first. */
function entriesOf(room: Room): Entry[] {
    const entries: Entry[] = [
        ...room.roundHistory.map(round => ({ kind: 'round' as const, at: round.revealedAt ?? round.startedAt, round })),
        ...room.skippedRounds.map(skipped => ({ kind: 'skipped' as const, at: skipped.skippedAt, skipped })),
    ]
    return entries.sort((a, b) => b.at - a.at)
}

/** Round history: a button that opens a side panel (desktop) or a bottom sheet (mobile). */
export default function RoundHistory({ room, meId, variant = 'bar', defaultOpen = false }: RoundHistoryProps) {
    const { t } = useT()
    const [open, setOpen] = useState(defaultOpen)
    const panelRef = useRef<HTMLElement>(null)
    const closeRef = useRef<HTMLButtonElement>(null)
    const titleId = useId()
    const count = room.roundHistory.length

    // Modal behaviour: focus inside, Tab trapped in the panel, Esc closes,
    // page scroll locked, focus back on the button afterwards.
    useEffect(() => {
        if (!open) return
        const previous = document.activeElement as HTMLElement | null
        closeRef.current?.focus()
        const overflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                setOpen(false)
                return
            }
            const panel = panelRef.current
            if (e.key !== 'Tab' || !panel) return
            const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
            if (items.length === 0) return
            const first = items[0]
            const last = items[items.length - 1]
            const inside = panel.contains(document.activeElement)
            if (e.shiftKey && (!inside || document.activeElement === first)) {
                e.preventDefault()
                last.focus()
            } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
                e.preventDefault()
                first.focus()
            }
        }
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('keydown', onKey)
            document.body.style.overflow = overflow
            previous?.focus()
        }
    }, [open])

    const entries = entriesOf(room)

    return (
        <>
            <button
                type="button"
                className={variant === 'bar' ? `btn btn-secondary btn-sm ${styles.trigger}` : 'btn btn-secondary'}
                onClick={() => setOpen(true)}
                aria-haspopup="dialog"
                aria-label={t('history.openLabel', { count })}
                title={t('history.title')}
            >
                <HistoryIcon size={variant === 'bar' ? 16 : 18} />
                <span className={variant === 'bar' ? styles.triggerText : undefined}>{t(variant === 'bar' ? 'history.open' : 'history.openResults')}</span>
                {variant === 'bar' && count > 0 && <span className={styles.count} aria-hidden="true">{count}</span>}
            </button>

            {open && (
                <div className={styles.layer}>
                    <div className={styles.backdrop} onClick={() => setOpen(false)} aria-hidden="true" />
                    <section ref={panelRef} className={styles.panel} role="dialog" aria-modal="true" aria-labelledby={titleId}>
                        <span className={styles.grabber} aria-hidden="true" />
                        <header className={styles.head}>
                            <div className={styles.headText}>
                                <h2 id={titleId} className={styles.title}><HistoryIcon size={20} /> {t('history.title')}</h2>
                                <span className={styles.summary}>{t('history.summary', { count })}</span>
                            </div>
                            <button ref={closeRef} type="button" className={`btn-icon ${styles.close}`} onClick={() => setOpen(false)} aria-label={t('history.close')}>
                                <XIcon size={18} />
                            </button>
                        </header>

                        {/* Focusable so the list scrolls with the keyboard too. */}
                        <div className={styles.list} tabIndex={0}>
                            {entries.length === 0 && <p className={styles.empty}>{t('history.empty')}</p>}
                            {entries.map(entry => entry.kind === 'round'
                                ? <RoundEntry key={`r${entry.round.startedAt}`} round={entry.round} room={room} meId={meId} />
                                : <SkippedEntry key={`s${entry.skipped.startedAt}`} skipped={entry.skipped} />)}
                        </div>
                    </section>
                </div>
            )}
        </>
    )
}

/** Concepts of a card, as the strip under the dial. */
function CardStrip({ left, right }: { left: string; right: string }) {
    return (
        <div className={styles.concepts}>
            <span className={styles.conceptLeft}><ChevronLeftIcon size={16} strokeWidth={3.2} /> {left}</span>
            <span className={styles.conceptRight}>{right} <ChevronRightIcon size={16} strokeWidth={3.2} /></span>
        </div>
    )
}

function TeamChip({ team }: { team: TeamId }) {
    const { t } = useT()
    return (
        <span className={styles.teamChip} style={{ '--team-color': teamColor(team) } as React.CSSProperties}>
            <span className={styles.dot} /> {t(teamKey(team))}
        </span>
    )
}

function SeerLine({ seer, gone, isMe }: { seer: RoundPlayer | undefined; gone: boolean; isMe: boolean }) {
    const { t } = useT()
    return (
        <span className={styles.seer}>
            <EyeIcon size={14} />
            <span className={styles.seerLabel}>{t('common.seer')}</span>
            {seer && <Avatar name={seer.nickname} colorIndex={seer.colorIndex} size="sm" offline={gone} />}
            <strong>{seer?.nickname ?? t('history.someone')}{isMe ? t('common.youSuffix') : ''}</strong>
        </span>
    )
}

function RoundEntry({ round, room, meId }: { round: GameRound; room: Room; meId: string | null }) {
    const { t } = useT()
    const who = (id: string | null): RoundPlayer | undefined =>
        id === null ? undefined : round.roster.find(p => p.id === id) ?? room.players.find(p => p.id === id)
    const gone = (id: string) => !room.players.some(p => p.id === id)
    const seer = who(round.seerId)
    const play = round.teamPlay

    const markers: DialMarker[] = play ? [] : Object.entries(round.guesses).map(([id, position]) => {
        const p = who(id)
        return { id, name: p?.nickname ?? '?', colorIndex: p?.colorIndex ?? 0, position, dim: (round.zones[id] ?? 0) === 0 }
    })

    return (
        <article className={styles.entry} aria-label={t('common.round', { n: round.roundNumber })}>
            <header className={styles.entryHead}>
                <span className="chip chip-accent">{t('common.round', { n: round.roundNumber })}</span>
                {play && room.settings.mode !== 'coop' && <TeamChip team={play.team} />}
                <SeerLine seer={seer} gone={gone(round.seerId)} isMe={round.seerId === meId} />
            </header>

            <div className={styles.device}>
                <Dial
                    compact
                    target={round.targetPosition}
                    needle={play ? play.guess : null}
                    locked={!!play}
                    markers={markers}
                    label={t('history.dial', { n: round.roundNumber, target: round.targetPosition ?? '' })}
                />
                <CardStrip left={round.spectrumCard.leftConcept} right={round.spectrumCard.rightConcept} />
                {round.clue && <p className={styles.clue}>&ldquo;{round.clue}&rdquo;</p>}
            </div>

            {play ? <TeamOutcome round={round} who={who} coop={room.settings.mode === 'coop'} /> : (
                <ul className={styles.rows}>
                    {Object.entries(round.scores)
                        .map(([id, points]) => ({ id, points, isSeer: id === round.seerId }))
                        .sort((a, b) => b.points - a.points || (a.isSeer ? 1 : 0) - (b.isSeer ? 1 : 0))
                        .map(({ id, points, isSeer }) => {
                            const p = who(id)
                            const zone = round.zones[id] ?? 0
                            return (
                                <li key={id} className={`${styles.row} ${id === meId ? styles.rowMe : ''}`}>
                                    <Avatar name={p?.nickname ?? '?'} colorIndex={p?.colorIndex ?? 0} size="sm" offline={gone(id)} />
                                    <span className={styles.name}>
                                        {p?.nickname ?? t('history.someone')}{id === meId ? t('common.youSuffix') : ''}
                                        {gone(id) && <span className={styles.goneTag}>{t('history.gone')}</span>}
                                    </span>
                                    <span className={styles.label}>
                                        {isSeer ? (
                                            <span className={gameStyles.seerTag}><EyeIcon size={13} /> {t('common.seer')}</span>
                                        ) : (
                                            <>
                                                <span className={`${gameStyles.zoneTag} ${gameStyles[`zoneTag${zone}`]} ${styles.zone}`} title={t(ZONE_LABEL[zone])}>{zone}</span>
                                                {round.closestIds.includes(id) && <span className={gameStyles.closestTag}>{t('game.closest', { n: 1 })}</span>}
                                            </>
                                        )}
                                    </span>
                                    <span className={`${styles.points} ${points === 0 ? styles.pointsZero : ''}`}>+{points}</span>
                                </li>
                            )
                        })}
                </ul>
            )}
        </article>
    )
}

function TeamOutcome({ round, who, coop }: { round: GameRound; who: (id: string | null) => RoundPlayer | undefined; coop: boolean }) {
    const { t, rich } = useT()
    const play = round.teamPlay!
    const active = play.team
    const other: TeamId = active === 0 ? 1 : 0
    const zone = play.zone ?? 0
    const lockedBy = who(play.lockedBy)
    const sideBy = who(play.sideBy)
    const teamStyle = (team: TeamId) => ({ '--team-color': teamColor(team) } as React.CSSProperties)
    return (
        <ul className={styles.rows}>
            <li className={`${styles.row} ${styles.teamRow}`} style={teamStyle(active)}>
                <span className={styles.dot} />
                <span className={styles.teamText}>
                    <strong>{coop ? t('coop.team') : t(teamKey(active))}</strong>
                    <span className={styles.teamLine}>
                        <span className={`${gameStyles.zoneTag} ${gameStyles[`zoneTag${zone}`]} ${styles.zone}`}>{zone}</span>
                        {t(ZONE_LABEL[zone])} · {t('history.teamGuess', { n: play.guess ?? '' })}{lockedBy ? t('teamGame.lockedBy', { name: lockedBy.nickname }) : ''}
                    </span>
                </span>
                <span className={`${styles.points} ${play.points[active] === 0 ? styles.pointsZero : ''}`}>+{play.points[active]}</span>
            </li>
            {!coop && <li className={`${styles.row} ${styles.teamRow}`} style={teamStyle(other)}>
                <span className={styles.dot} />
                <span className={styles.teamText}>
                    <strong>{t(teamKey(other))}</strong>
                    <span className={styles.teamLine}>
                        {play.side
                            ? rich(play.sideCorrect ? 'teamGame.calledRight' : 'teamGame.calledWrong', { side: <strong>{t(SIDE_LABEL[play.side])}</strong>, by: sideBy ? ` (${sideBy.nickname})` : '' })
                            : t('teamGame.noCall')}
                    </span>
                </span>
                <span className={`${styles.points} ${play.points[other] === 0 ? styles.pointsZero : ''}`}>+{play.points[other]}</span>
            </li>}
        </ul>
    )
}

function SkippedEntry({ skipped }: { skipped: SkippedRound }) {
    const { t } = useT()
    return (
        <article className={`${styles.entry} ${styles.skipped}`} aria-label={t('history.skipped')}>
            <header className={styles.entryHead}>
                <span className="chip"><SkipIcon size={12} /> {t('history.skipped')}</span>
                {skipped.team !== null && <TeamChip team={skipped.team} />}
            </header>
            <CardStrip left={skipped.spectrumCard.leftConcept} right={skipped.spectrumCard.rightConcept} />
            <p className={styles.note}>{t(SKIP_LABEL[skipped.reason], { name: skipped.seer?.nickname ?? t('history.someone') })}</p>
        </article>
    )
}
