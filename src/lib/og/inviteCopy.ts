// Texts of the Open Graph images. Pure (locale in, strings out), so it is
// unit-tested.

import { translate, type Locale } from '../../i18n/index.ts'
import type { PublicRoomInfo } from '../../../shared/publicRoom.ts'

export interface OgCopy {
    eyebrow?: string
    title: string
    subtitle: string
    badge?: string
}

export function homeCopy(locale: Locale): OgCopy {
    return { title: 'Syntonize', subtitle: translate(locale, 'meta.tagline') }
}

/** `info` null means the room was not found (or the lookup failed). */
export function inviteCopy(locale: Locale, info: PublicRoomInfo | null, code: string): OgCopy {
    const badge = code ? translate(locale, 'room.codeIs', { code }) : undefined
    if (!info) return { ...homeCopy(locale), eyebrow: translate(locale, 'join.invited'), badge }
    const players = translate(locale, 'meta.joinPlayers', { count: info.playerCount })
    return {
        eyebrow: 'Syntonize',
        title: translate(locale, 'meta.joinTitle', { host: info.hostName }),
        subtitle: info.status === 'playing' ? `${players} · ${translate(locale, 'join.inProgress')}` : players,
        badge,
    }
}
