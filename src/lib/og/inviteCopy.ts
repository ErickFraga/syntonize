// Texts of the Open Graph images. Pure (locale in, strings out), so it is
// unit-tested. Reuses the home hero keys so the preview reads like the site.

import { translate, splitPlaceholders, type Locale } from '../../i18n/index.ts'
import { LIMITS } from '../../../shared/types.ts'
import type { PublicRoomInfo } from '../../../shared/publicRoom.ts'

export interface OgCopy {
    /** Headline: first line plain, second line highlighted. */
    line1: string
    line2: string
    phrase: string
    chips: [string, string]
    /** Spectrum card under the dial. */
    card: { left: string; right: string }
}

function spectrumCard(locale: Locale): OgCopy['card'] {
    const [left = '', right = ''] = translate(locale, 'home.step1Example').split('↔').map(s => s.trim())
    return { left, right }
}

export function homeCopy(locale: Locale): OgCopy {
    return {
        line1: translate(locale, 'home.taglineStart').trim(),
        line2: translate(locale, 'home.taglineEnd'),
        phrase: translate(locale, 'meta.ogDescription'),
        chips: [
            translate(locale, 'home.factPlayers', { min: LIMITS.MIN_PLAYERS, max: LIMITS.MAX_PLAYERS }),
            translate(locale, 'home.factDevices'),
        ],
        card: spectrumCard(locale),
    }
}

/** Splits "Entre na sala de {host}" so the host lands on the highlighted line. */
function joinHeadline(locale: Locale, host: string): { line1: string; line2: string } {
    const parts = splitPlaceholders(translate(locale, 'meta.joinTitle'))
    const at = parts.findIndex(p => 'key' in p && p.key === 'host')
    const text = (ps: typeof parts) => ps.map(p => ('text' in p ? p.text : host)).join('').trim()
    if (at <= 0) return { line1: '', line2: text(parts) }
    return { line1: text(parts.slice(0, at)), line2: text(parts.slice(at)) }
}

/** `info` null means the room was not found (or the lookup failed). */
export function inviteCopy(locale: Locale, info: PublicRoomInfo | null, code: string): OgCopy {
    const home = homeCopy(locale)
    const codeChip = code ? `${translate(locale, 'room.codeLabel')} ${code}` : home.chips[0]
    if (!info) return { ...home, chips: [codeChip, home.chips[1]] }
    const players = translate(locale, 'meta.joinPlayers', { count: info.playerCount })
    return {
        ...joinHeadline(locale, info.hostName),
        phrase: info.status === 'playing' ? `${players} · ${translate(locale, 'join.inProgress')}` : players,
        chips: [codeChip, home.chips[1]],
        card: home.card,
    }
}
