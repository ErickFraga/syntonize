'use client'

import { LOCALES, LOCALE_NAMES } from '@/i18n'
import { useT } from '@/i18n/I18nProvider'
import styles from './LanguageSelect.module.css'

interface LanguageSelectProps {
    /** Pin to the top-right corner of the page (home and invite pages). */
    floating?: boolean
}

/** Interface language pill (PT · EN · ES); the choice is saved per browser. */
export default function LanguageSelect({ floating = false }: LanguageSelectProps) {
    const { locale, setLocale, t } = useT()
    return (
        <div className={`${styles.wrap} ${floating ? styles.floating : ''}`} role="radiogroup" aria-label={t('common.language')}>
            {LOCALES.map(l => (
                <button
                    key={l}
                    type="button"
                    role="radio"
                    aria-checked={l === locale}
                    aria-label={LOCALE_NAMES[l]}
                    title={LOCALE_NAMES[l]}
                    className={`${styles.option} ${l === locale ? styles.active : ''}`}
                    onClick={() => setLocale(l)}
                >
                    {l.slice(0, 2).toUpperCase()}
                </button>
            ))}
        </div>
    )
}
