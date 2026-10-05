// Tiny i18n core, no dependencies. Dictionaries are flat key -> text maps;
// pt-BR is the source of truth and the other locales are typed against it.

import type { Message } from '../../shared/types.ts'
import { ptBR, type Dictionary, type TranslationKey, type Entry } from './pt-BR.ts'
import { en } from './en.ts'
import { es } from './es.ts'

export type { TranslationKey, Dictionary, Entry }

export const LOCALES = ['pt-BR', 'en', 'es'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'pt-BR'

/** Shared with the server layout so SSR renders in the visitor's language. */
export const LOCALE_COOKIE = 'syntonize-locale'
export const LOCALE_STORAGE_KEY = 'syntonize:locale'

export const LOCALE_NAMES: Record<Locale, string> = {
    'pt-BR': 'Português',
    en: 'English',
    es: 'Español',
}

export const DICTIONARIES: Record<Locale, Dictionary> = { 'pt-BR': ptBR, en, es }

export type Params = Record<string, string | number>

export function isLocale(value: unknown): value is Locale {
    return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * Best match for a language tag or an Accept-Language header:
 * "es-AR" -> es, "en-US,en;q=0.9" -> en, "pt-PT" -> pt-BR, unknown -> null.
 */
export function matchLocale(input: string | null | undefined): Locale | null {
    if (!input) return null
    const tags = input.split(',').map(part => part.split(';')[0].trim().toLowerCase()).filter(Boolean)
    for (const tag of tags) {
        const base = tag.split('-')[0]
        if (base === 'pt') return 'pt-BR'
        if (base === 'en') return 'en'
        if (base === 'es') return 'es'
    }
    return null
}

/** Replaces {name} placeholders. */
export function interpolate(text: string, params?: Params): string {
    if (!params) return text
    return text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in params ? String(params[key]) : whole))
}

/** Picks the plural form by `params.count` (one vs other). */
function pick(entry: Entry, params?: Params): string {
    if (typeof entry === 'string') return entry
    return Number(params?.count) === 1 ? entry.one : entry.other
}

export function translate(locale: Locale, key: TranslationKey, params?: Params): string {
    const entry = DICTIONARIES[locale][key] ?? ptBR[key]
    return interpolate(pick(entry, params), params)
}

/** Text of a server message (error or room notice). */
export function translateMessage(locale: Locale, message: Message | string | null | undefined, fallback: TranslationKey = 'error.generic'): string {
    if (!message) return translate(locale, fallback)
    if (typeof message === 'string') return message
    const key = `msg.${message.code}` as TranslationKey
    if (!(key in ptBR)) return translate(locale, fallback)
    return translate(locale, key, message.params)
}

/** Splits a translated text on {placeholders} so callers can drop in rich nodes. */
export function splitPlaceholders(text: string): Array<{ text: string } | { key: string }> {
    const parts: Array<{ text: string } | { key: string }> = []
    let last = 0
    for (const match of text.matchAll(/\{(\w+)\}/g)) {
        if (match.index! > last) parts.push({ text: text.slice(last, match.index) })
        parts.push({ key: match[1] })
        last = match.index! + match[0].length
    }
    if (last < text.length) parts.push({ text: text.slice(last) })
    return parts
}
