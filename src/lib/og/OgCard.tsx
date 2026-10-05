// Shared 1200×630 layout for the Open Graph images: text on the left, dial on
// the right. Uses only the font bundled with next/og (no network at build or
// request time).

import { OgDial, OG_COLORS } from './OgDial'

export const OG_SIZE = { width: 1200, height: 630 }

interface OgCardProps {
    /** Small line above the title (e.g. the brand on invite cards). */
    eyebrow?: string
    title: string
    subtitle: string
    /** Optional pill under the subtitle (e.g. room code). */
    badge?: string
}

export function OgCard({ eyebrow, title, subtitle, badge }: OgCardProps) {
    const titleSize = title.length > 22 ? 64 : title.length > 14 ? 80 : 104
    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 56px 0 80px',
                backgroundColor: OG_COLORS.bg,
                backgroundImage: [
                    'radial-gradient(circle at 12% 0%, rgba(143, 123, 255, 0.35), transparent 55%)',
                    'radial-gradient(circle at 100% 100%, rgba(255, 93, 143, 0.25), transparent 55%)',
                ].join(', '),
                color: OG_COLORS.text,
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', width: 540 }}>
                {eyebrow && (
                    <div style={{ display: 'flex', fontSize: 34, color: OG_COLORS.teal, marginBottom: 12, letterSpacing: 1 }}>
                        {eyebrow}
                    </div>
                )}
                <div
                    style={{
                        display: 'flex',
                        fontSize: titleSize,
                        lineHeight: 1.05,
                        letterSpacing: -2,
                        backgroundImage: `linear-gradient(100deg, ${OG_COLORS.teal} 0%, ${OG_COLORS.violet} 50%, ${OG_COLORS.pink} 100%)`,
                        backgroundClip: 'text',
                        color: 'transparent',
                    }}
                >
                    {title}
                </div>
                <div style={{ display: 'flex', fontSize: 38, lineHeight: 1.25, color: OG_COLORS.text2, marginTop: 24 }}>
                    {subtitle}
                </div>
                {badge && (
                    <div style={{ display: 'flex', marginTop: 36 }}>
                        <div
                            style={{
                                display: 'flex',
                                fontSize: 30,
                                padding: '10px 24px',
                                borderRadius: 999,
                                border: `2px solid ${OG_COLORS.violet}`,
                                color: OG_COLORS.text,
                                backgroundColor: OG_COLORS.bg2,
                            }}
                        >
                            {badge}
                        </div>
                    </div>
                )}
            </div>
            <OgDial width={540} />
        </div>
    )
}
