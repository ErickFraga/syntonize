'use client'

import { useEffect, useState } from 'react'
import type { CustomCard, RoomSettings } from '@/types/game'
import { LIMITS } from '@/types/game'
import { customCardKey, formatCustomCards, parseCustomCardLines, sanitizeCustomCards, type ParsedCustomCards } from '@shared/customCards'
import { useT } from '@/i18n/I18nProvider'
import { CopyIcon, XIcon, RotateIcon } from '@/components/ui/Icons'
import lobbyStyles from '../Lobby/Lobby.module.css'
import styles from './CustomCards.module.css'

/** The host's last list, offered again in the next room they create. */
export const CUSTOM_CARDS_STORAGE_KEY = 'syntonize:customCards'

function loadStored(): CustomCard[] {
    try {
        const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(CUSTOM_CARDS_STORAGE_KEY)
        return (raw && sanitizeCustomCards(JSON.parse(raw))) || []
    } catch {
        return []
    }
}

interface CustomCardsProps {
    /** The host gets the cards; guests get an empty list and only the count. */
    cards: CustomCard[]
    count: number
    isHost: boolean
    /** Active packs: with none, the list cannot drop below the minimum. */
    packCount: number
    onUpdateSettings: (settings: Partial<RoomSettings>) => void
    onNotify: (message: string, kind?: 'info' | 'success' | 'warning' | 'error') => void
}

/** Lobby section where the host types their own pairs (guests only see how many). */
export default function CustomCards({ cards, count, isHost, packCount, onUpdateSettings, onNotify }: CustomCardsProps) {
    const { t } = useT()
    const [text, setText] = useState('')
    const [rejected, setRejected] = useState<ParsedCustomCards['rejected']>([])
    const [stored, setStored] = useState<CustomCard[]>(() => (isHost ? loadStored() : []))

    // Remember the host's list for the next room (copying the text covers export/import).
    useEffect(() => {
        if (!isHost || cards.length === 0) return
        try {
            window.localStorage.setItem(CUSTOM_CARDS_STORAGE_KEY, JSON.stringify(cards))
            setStored(cards)
        } catch {
            /* private mode: nothing to remember */
        }
    }, [isHost, cards])

    if (!isHost) {
        return (
            <div className={lobbyStyles.setting}>
                <div className={lobbyStyles.settingText}>
                    <span className={lobbyStyles.settingTitle}>{t('custom.title')}</span>
                    <span className={lobbyStyles.settingHint}>{count > 0 ? t('custom.guestHint') : t('custom.none')}</span>
                </div>
                {count > 0 && <span className={`chip ${styles.guestCount}`}>{t('custom.count', { count })}</span>}
            </div>
        )
    }

    const full = cards.length >= LIMITS.CUSTOM_CARDS_MAX
    const lockedAtMinimum = packCount === 0 && cards.length <= LIMITS.CUSTOM_CARDS_MIN_DECK
    const limits = { min: LIMITS.CUSTOM_CARD_TEXT_MIN, max: LIMITS.CUSTOM_CARD_TEXT_MAX }

    const add = () => {
        const parsed = parseCustomCardLines(text, cards)
        setRejected(parsed.rejected)
        // Refused lines stay in the box so the host can fix them.
        setText(parsed.rejected.map(r => r.text).join('\n'))
        if (parsed.added.length === 0) return
        onUpdateSettings({ customCards: [...cards, ...parsed.added] })
        onNotify(t('custom.added', { count: parsed.added.length }), 'success')
    }

    const remove = (index: number) => onUpdateSettings({ customCards: cards.filter((_, i) => i !== index) })

    const copyList = async () => {
        try {
            await navigator.clipboard.writeText(formatCustomCards(cards))
            onNotify(t('custom.copied'), 'success')
        } catch {
            onNotify(t('lobby.copyFailed'), 'warning')
        }
    }

    return (
        <div className={lobbyStyles.setting}>
            <div className={styles.header}>
                <div className={lobbyStyles.settingText}>
                    <span className={lobbyStyles.settingTitle}>{t('custom.title')}</span>
                    <span className={lobbyStyles.settingHint}>{t('custom.hint', limits)}</span>
                </div>
                <span className={`chip ${cards.length > 0 ? 'chip-sky' : ''}`} aria-label={t('custom.count', { count: cards.length })}>
                    {cards.length}/{LIMITS.CUSTOM_CARDS_MAX}
                </span>
            </div>

            <div className={styles.editor}>
                <textarea
                    className={`input ${styles.textarea}`}
                    rows={3}
                    value={text}
                    placeholder={t('custom.placeholder')}
                    aria-label={t('custom.title')}
                    disabled={full}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault()
                            add()
                        }
                    }}
                />
                <button className="btn btn-primary btn-sm" disabled={full || !text.trim()} onClick={add}>
                    {t('custom.add')}
                </button>
            </div>

            {rejected.length > 0 && (
                <ul className={styles.errors} role="alert">
                    {rejected.map(r => (
                        <li key={r.line}>{t(`custom.error.${r.problem}`, { line: r.line, min: limits.min, max: r.problem === 'limit' ? LIMITS.CUSTOM_CARDS_MAX : limits.max })}</li>
                    ))}
                </ul>
            )}

            {cards.length > 0 && (
                <ul className={styles.list} aria-label={t('custom.count', { count: cards.length })}>
                    {cards.map((card, index) => {
                        const label = `${card.left} | ${card.right}`
                        return (
                            <li key={customCardKey(card)} className={styles.card}>
                                <span className={styles.side}>{card.left}</span>
                                <span className={styles.arrow} aria-hidden="true">↔</span>
                                <span className={styles.side}>{card.right}</span>
                                <button
                                    className={styles.remove}
                                    disabled={lockedAtMinimum}
                                    title={t('custom.remove', { card: label })}
                                    aria-label={t('custom.remove', { card: label })}
                                    onClick={() => remove(index)}
                                >
                                    <XIcon size={12} />
                                </button>
                            </li>
                        )
                    })}
                </ul>
            )}

            {(cards.length > 0 || stored.length > 0) && (
                <div className={styles.actions}>
                    {cards.length === 0 && stored.length > 0 && (
                        <button className="btn btn-secondary btn-sm" onClick={() => onUpdateSettings({ customCards: stored })}>
                            <RotateIcon size={16} />
                            {t('custom.reuse', { count: stored.length })}
                        </button>
                    )}
                    {cards.length > 0 && (
                        <button className="btn btn-ghost btn-sm" onClick={copyList}>
                            <CopyIcon size={16} />
                            {t('custom.copy')}
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
