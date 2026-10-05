// Texts of the invite Open Graph image. Pure, so it is unit-tested.

import type { PublicRoomInfo } from '../../../shared/publicRoom.ts'

export interface InviteCopy {
    eyebrow: string
    title: string
    subtitle: string
    badge?: string
}

export function playersLabel(count: number): string {
    return count === 1 ? '1 jogador na sala' : `${count} jogadores na sala`
}

/** `info` null means the room was not found (or the lookup failed). */
export function inviteCopy(info: PublicRoomInfo | null, code: string): InviteCopy {
    const badge = code ? `Sala ${code}` : undefined
    if (!info) return { eyebrow: 'Syntonize', title: 'Bora jogar?', subtitle: 'Leia a mente dos seus amigos', badge }
    const players = playersLabel(info.playerCount)
    return {
        eyebrow: 'Syntonize',
        title: `Entre na sala de ${info.hostName}`,
        subtitle: info.status === 'playing' ? `${players} · partida rolando` : players,
        badge,
    }
}
