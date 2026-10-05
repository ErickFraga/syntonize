'use client'

import { LOCALES, LOCALE_NAMES, isLocale } from '@/i18n'
import { useT } from '@/i18n/I18nProvider'
import styles from './LanguageSelect.module.css'

interface LanguageSelectProps {
    /** Pin to the top-right corner of the page (home and invite pages). */
    floating?: boolean
}

/** Interface language picker; the choice is saved per browser. */
export default function LanguageSelect({ floating = false }: LanguageSelectProps) {
    const { locale, setLocale, t } = useT()
    return (
        <label className={`${styles.wrap} ${floating ? styles.floating : ''}`} title={t('common.language')}>
            <svg className={styles.icon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span className="sr-only">{t('common.language')}</span>
            <select
                className={styles.select}
                value={locale}
                onChange={(e) => {
                    const next = (e.target as unknown as { value: string }).value
                    if (isLocale(next)) setLocale(next)
                }}
            >
                {LOCALES.map(l => (
                    <option key={l} value={l}>{LOCALE_NAMES[l]}</option>
                ))}
            </select>
        </label>
    )
}
