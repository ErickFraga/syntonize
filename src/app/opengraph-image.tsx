import { ImageResponse } from 'next/og'
import { OgCard, OG_SIZE } from '@/lib/og/OgCard'
import { homeCopy } from '@/lib/og/inviteCopy'
import { ogLocale } from '@/lib/og/locale'

export const runtime = 'nodejs'
export const alt = 'Syntonize'
export const size = OG_SIZE
export const contentType = 'image/png'

export default function OpengraphImage() {
    return new ImageResponse(<OgCard {...homeCopy(ogLocale())} />, size)
}
