import { ImageResponse } from 'next/og'
import { OgCard, OG_SIZE } from '@/lib/og/OgCard'
import { fetchRoomPreview } from '@/lib/og/roomPreview'
import { inviteCopy } from '@/lib/og/inviteCopy'
import { normalizeRoomCode } from '@shared/gameLogic'

export const runtime = 'nodejs'
// Room state changes all the time: never render at build time.
export const dynamic = 'force-dynamic'
export const alt = 'Convite para uma sala do Syntonize'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function JoinOpengraphImage({ params }: { params: { code: string } }) {
    const code = normalizeRoomCode(params.code)
    // Unknown room or failed lookup falls back to a generic invite.
    const info = code.length === 6 ? await fetchRoomPreview(code) : null
    return new ImageResponse(<OgCard {...inviteCopy(info, code)} />, size)
}
