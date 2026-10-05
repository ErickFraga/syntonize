import { ImageResponse } from 'next/og'
import { OgCard, OG_SIZE } from '@/lib/og/OgCard'

export const runtime = 'nodejs'
export const alt = 'Syntonize — leia a mente dos seus amigos'
export const size = OG_SIZE
export const contentType = 'image/png'

export default function OpengraphImage() {
    return new ImageResponse(
        <OgCard title="Syntonize" subtitle="Leia a mente dos seus amigos" badge="Party game online · SINTONIA" />,
        size,
    )
}
