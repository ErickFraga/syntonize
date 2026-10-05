'use client'

import type { RoomSettings, CardPack } from '@/types/game'
import { CARD_LOCALES, CARD_PACKS, LIMITS } from '@/types/game'
import { PACK_SIZES } from '@shared/cards/index'
import { LOCALE_NAMES, type TranslationKey } from '@/i18n'
import { useT } from '@/i18n/I18nProvider'
import { CheckIcon } from '@/components/ui/Icons'
import lobbyStyles from '../Lobby/Lobby.module.css'
import styles from './CardPackPicker.module.css'

interface CardPackPickerProps {
    settings: RoomSettings
    isHost: boolean
    /** Custom cards in the deck (they count towards the total and the minimum). */
    customCount: number
    onUpdateSettings: (settings: Partial<RoomSettings>) => void
}

const PACK_LABELS: Record<CardPack, { name: TranslationKey; hint: TranslationKey }> = {
    classic: { name: 'packs.classic', hint: 'packs.classicHint' },
    food: { name: 'packs.food', hint: 'packs.foodHint' },
    pop: { name: 'packs.pop', hint: 'packs.popHint' },
    people: { name: 'packs.people', hint: 'packs.peopleHint' },
    spicy: { name: 'packs.spicy', hint: 'packs.spicyHint' },
}

/** Lobby rows for the card language and the active packs (read-only for guests). */
export default function CardPackPicker({ settings, isHost, customCount, onUpdateSettings }: CardPackPickerProps) {
    const { t } = useT()
    const active = settings.packs
    const total = active.reduce((sum, pack) => sum + PACK_SIZES[pack], 0) + customCount
    // The last pack can only go off when the custom cards are enough to play.
    const lastPackLocked = active.length === 1 && customCount < LIMITS.CUSTOM_CARDS_MIN_DECK

    const toggle = (pack: CardPack) => {
        const on = active.includes(pack)
        if (on && lastPackLocked) return
        onUpdateSettings({ packs: on ? active.filter(p => p !== pack) : [...active, pack] })
    }

    return (
        <>
            <div className={lobbyStyles.setting}>
                <div className={lobbyStyles.settingText}>
                    <span className={lobbyStyles.settingTitle}>{t('lobby.cardLanguage')}</span>
                    <span className={lobbyStyles.settingHint}>{t('lobby.cardLanguageHint')}</span>
                </div>
                <div className={lobbyStyles.segmented} role="radiogroup" aria-label={t('lobby.cardLanguage')}>
                    {CARD_LOCALES.map(locale => (
                        <button
                            key={locale}
                            role="radio"
                            lang={locale}
                            aria-checked={locale === settings.cardLocale}
                            className={`${lobbyStyles.segment} ${locale === settings.cardLocale ? lobbyStyles.segmentActive : ''}`}
                            disabled={!isHost}
                            onClick={() => onUpdateSettings({ cardLocale: locale })}
                        >
                            {LOCALE_NAMES[locale]}
                        </button>
                    ))}
                </div>
            </div>
            <div className={lobbyStyles.setting}>
                <div className={lobbyStyles.settingText}>
                    <span className={lobbyStyles.settingTitle}>{t('lobby.packs')}</span>
                    <span className={lobbyStyles.settingHint}>{t('lobby.packsHint', { count: total, min: LIMITS.CUSTOM_CARDS_MIN_DECK })}</span>
                </div>
                <div className={styles.packs} role="group" aria-label={t('lobby.packs')}>
                    {CARD_PACKS.map(pack => {
                        const on = active.includes(pack)
                        return (
                            <button
                                key={pack}
                                aria-pressed={on}
                                className={`${styles.pack} ${on ? styles.packOn : ''}`}
                                disabled={!isHost || (on && lastPackLocked)}
                                title={t(PACK_LABELS[pack].hint)}
                                onClick={() => toggle(pack)}
                            >
                                <span className={styles.check} aria-hidden="true">{on && <CheckIcon size={14} />}</span>
                                <span className={styles.packText}>
                                    <span className={styles.packName}>
                                        {t(PACK_LABELS[pack].name)}
                                        {pack === 'spicy' && <span className={styles.adult}>{t('packs.adultBadge')}</span>}
                                    </span>
                                    <span className={styles.packCount}>{t('packs.cards', { count: PACK_SIZES[pack] })}</span>
                                </span>
                            </button>
                        )
                    })}
                </div>
            </div>
        </>
    )
}
