'use client'

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, Fragment, type ReactNode } from 'react'
import type { Message } from '@/types/game'
import {
    DEFAULT_LOCALE,
    LOCALE_COOKIE,
    LOCALE_STORAGE_KEY,
    isLocale,
    matchLocale,
    splitPlaceholders,
    translate,
    translateMessage,
    type Locale,
    type Params,
    type TranslationKey,
} from './index.ts'

export interface Translator {
    locale: Locale
    setLocale: (locale: Locale) => void
    /** Plain text with {placeholders} filled and plurals picked by `count`. */
    t: (key: TranslationKey, params?: Params) => string
    /** Same, but placeholders can be React nodes (bold names, links…). */
    rich: (key: TranslationKey, nodes: Record<string, ReactNode>) => ReactNode
    /** Text of a server message (error or notice code). */
    msg: (message: Message | string | null | undefined, fallback?: TranslationKey) => string
}

export function makeTranslator(locale: Locale, setLocale: (locale: Locale) => void = () => {}): Translator {
    return {
        locale,
        setLocale,
        t: (key, params) => translate(locale, key, params),
        rich: (key, nodes) => {
            const count = typeof nodes.count === 'number' ? { count: nodes.count } : undefined
            return splitPlaceholders(translate(locale, key, count)).map((part, i) =>
                createElement(Fragment, { key: i }, 'text' in part ? part.text : nodes[part.key] ?? `{${part.key}}`),
            )
        },
        msg: (message, fallback) => translateMessage(locale, message, fallback),
    }
}

export const I18nContext = createContext<Translator>(makeTranslator(DEFAULT_LOCALE))

function readStoredLocale(): Locale | null {
    try {
        const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
        return isLocale(stored) ? stored : null
    } catch {
        return null
    }
}

function persistLocale(locale: Locale): void {
    try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    } catch {
        /* storage unavailable */
    }
    // The cookie lets the server render <html lang> and metadata in this language next time.
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`
}

/**
 * Holds the interface language. The server picks the first render's locale
 * (cookie or Accept-Language); on the client, a saved choice wins, and on the
 * first visit we go with navigator.language and remember it.
 */
export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
    const [locale, setLocaleState] = useState<Locale>(initialLocale)

    useEffect(() => {
        const preferred = readStoredLocale() ?? matchLocale(navigator.language) ?? initialLocale
        persistLocale(preferred)
        setLocaleState(preferred)
    }, [initialLocale])

    useEffect(() => {
        document.documentElement.lang = locale
    }, [locale])

    const setLocale = useCallback((next: Locale) => {
        if (!isLocale(next)) return
        persistLocale(next)
        setLocaleState(next)
    }, [])

    const value = useMemo(() => makeTranslator(locale, setLocale), [locale, setLocale])
    return createElement(I18nContext.Provider, { value }, children)
}

export function useT(): Translator {
    return useContext(I18nContext)
}
