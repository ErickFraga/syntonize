import { cookies, headers } from 'next/headers'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, matchLocale, type Locale } from '@/i18n'

/** Same rule as the root layout: saved choice, else Accept-Language. */
export function ogLocale(): Locale {
    const saved = cookies().get(LOCALE_COOKIE)?.value
    if (isLocale(saved)) return saved
    return matchLocale(headers().get('accept-language')) ?? DEFAULT_LOCALE
}
