// Shared 1200×630 layout for the Open Graph images. Left: logo, two-line
// headline (second line highlighted), short phrase, two chips. Right: the
// dial, slightly tilted, over a spectrum card. Uses only the font bundled
// with next/og (no network at build or request time).

import { OgDial, OG_COLORS } from './OgDial'
import type { OgCopy } from './inviteCopy'

export const OG_SIZE = { width: 1200, height: 630 }

const GRADIENT = `linear-gradient(100deg, ${OG_COLORS.teal} 0%, ${OG_COLORS.violet} 50%, ${OG_COLORS.pink} 100%)`

/** Same drawing as components/ui/Logo, sized for the card. */
function OgLogo() {
    return (
        <div style={{ display: 'flex', alignItems: 'center' }}>
            <svg width={64} height={40} viewBox="0 0 48 30" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0" stopColor={OG_COLORS.teal} />
                        <stop offset="0.5" stopColor={OG_COLORS.violet} />
                        <stop offset="1" stopColor={OG_COLORS.pink} />
                    </linearGradient>
                </defs>
                <path d="M3 27 A21 21 0 0 1 45 27 Z" fill="#f6efe3" />
                <path d="M24 27 L31.5 8.2 A21 21 0 0 1 38.6 14.3 Z" fill="url(#logoGrad)" opacity="0.95" />
                <path d="M3 27 A21 21 0 0 1 45 27" fill="none" stroke={OG_COLORS.ink} strokeWidth="2.5" strokeLinecap="round" />
                <path d="M21.5 27 L24 9 L26.5 27 Z" fill={OG_COLORS.needle} stroke="#fff" strokeWidth="0.8" strokeLinejoin="round" />
                <circle cx="24" cy="27" r="3.2" fill={OG_COLORS.ink} stroke="#fff" strokeWidth="1" />
            </svg>
            <div style={{ display: 'flex', marginLeft: 14, fontSize: 40, letterSpacing: -1, backgroundImage: GRADIENT, backgroundClip: 'text', color: 'transparent' }}>
                Syntonize
            </div>
        </div>
    )
}

/** Card arrows as SVG: the bundled font has no ◀ ▶ glyphs. */
function Arrow({ dir, color }: { dir: 'left' | 'right'; color: string }) {
    return (
        <svg width={16} height={18} viewBox="0 0 16 18" xmlns="http://www.w3.org/2000/svg">
            <path d={dir === 'left' ? 'M0 9 L16 0 L16 18 Z' : 'M16 9 L0 0 L0 18 Z'} fill={color} />
        </svg>
    )
}

function Chip({ label, color }: { label: string; color: string }) {
    return (
        <div
            style={{
                display: 'flex',
                fontSize: 24,
                padding: '8px 20px',
                marginRight: 14,
                borderRadius: 999,
                border: `2px solid ${color}`,
                color,
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
            }}
        >
            {label}
        </div>
    )
}

export function OgCard({ line1, line2, phrase, chips, card }: OgCopy) {
    const longest = Math.max(line1.length, line2.length)
    const headSize = longest > 18 ? 58 : longest > 13 ? 68 : 80
    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 48px 0 72px',
                backgroundColor: OG_COLORS.bg,
                backgroundImage: [
                    'radial-gradient(circle at 12% 0%, rgba(143, 123, 255, 0.35), transparent 55%)',
                    'radial-gradient(circle at 100% 100%, rgba(255, 93, 143, 0.25), transparent 55%)',
                ].join(', '),
                color: OG_COLORS.text,
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', width: 560 }}>
                <OgLogo />
                <div style={{ display: 'flex', flexDirection: 'column', marginTop: 28, fontSize: headSize, lineHeight: 1.08, letterSpacing: -2 }}>
                    {line1 && <div style={{ display: 'flex', color: OG_COLORS.text }}>{line1}</div>}
                    <div style={{ display: 'flex', backgroundImage: GRADIENT, backgroundClip: 'text', color: 'transparent' }}>{line2}</div>
                </div>
                <div style={{ display: 'flex', fontSize: 27, lineHeight: 1.35, color: OG_COLORS.text2, marginTop: 22 }}>{phrase}</div>
                <div style={{ display: 'flex', marginTop: 30 }}>
                    <Chip label={chips[0]} color={OG_COLORS.teal} />
                    <Chip label={chips[1]} color={OG_COLORS.pink} />
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: 'rotate(-3deg)' }}>
                <OgDial width={500} />
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        width: 440,
                        marginTop: 18,
                        padding: '14px 24px',
                        borderRadius: 16,
                        backgroundColor: OG_COLORS.bg2,
                        border: '2px solid rgba(255, 255, 255, 0.1)',
                        fontSize: 28,
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', color: OG_COLORS.teal }}>
                        <Arrow dir="left" color={OG_COLORS.teal} />
                        <div style={{ display: 'flex', marginLeft: 12 }}>{card.left}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', color: OG_COLORS.pink }}>
                        <div style={{ display: 'flex', marginRight: 12 }}>{card.right}</div>
                        <Arrow dir="right" color={OG_COLORS.pink} />
                    </div>
                </div>
            </div>
        </div>
    )
}
