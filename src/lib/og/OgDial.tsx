// Static dial for Open Graph images (rendered by Satori via next/og).
// Same geometry and colors as components/Dial, but self-contained: Satori
// has no CSS variables or classes, and does not draw <text> inside SVG, so
// the wedge numbers are positioned divs over the drawing.

import { SCORING } from '../../../shared/types.ts'

// Mirrors globals.css (tema Noturno) and Dial.module.css.
export const OG_COLORS = {
    bg: '#271A3A',
    surface: '#36254F',
    line: '#140A22',
    bezel: '#46315F',
    face: '#FFFDF8',
    ink: '#3B1F5C',
    zone2: '#FFD96A',
    zone3: '#FFBE7D',
    zone4: '#FF6F9C',
    needle: '#FF6F9C',
    sky: '#8CCBFF',
    pink: '#FF6F9C',
    pink2: '#FFA8C5',
    text: '#FFF1E0',
    text2: '#CDB8EA',
    onAccent: '#1B0F2B',
} as const

const CX = 200
const CY = 212
const R = 184
const MARGIN = 14
const VB = { x: -MARGIN, y: CY - R - 10 - MARGIN, w: 400 + MARGIN * 2, h: R + 10 + MARGIN * 2 + 8 }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

function pt(position: number, radius: number): [number, number] {
    const a = Math.PI - (position / 100) * Math.PI
    return [CX + radius * Math.cos(a), CY - radius * Math.sin(a)]
}

function sectorPath(p0: number, p1: number, radius: number): string {
    const [x0, y0] = pt(p0, radius)
    const [x1, y1] = pt(p1, radius)
    return `M${CX} ${CY} L${x0.toFixed(2)} ${y0.toFixed(2)} A${radius} ${radius} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`
}

function arcPath(p0: number, p1: number, radius: number): string {
    const [x0, y0] = pt(p0, radius)
    const [x1, y1] = pt(p1, radius)
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${radius} ${radius} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

const ZONE_FILL: Record<number, string> = { 2: OG_COLORS.zone2, 3: OG_COLORS.zone3, 4: OG_COLORS.zone4 }

function wedgeZones(target: number) {
    const b = SCORING.BULLSEYE_RANGE
    const c = SCORING.CLOSE_RANGE
    const a = SCORING.ACCEPTABLE_RANGE
    return [
        { from: target - a, to: target - c, points: 2 },
        { from: target - c, to: target - b, points: 3 },
        { from: target - b, to: target + b, points: 4 },
        { from: target + b, to: target + c, points: 3 },
        { from: target + c, to: target + a, points: 2 },
    ]
}

const TICKS = (() => {
    const ticks: Array<{ x1: number; y1: number; x2: number; y2: number; big: boolean }> = []
    for (let p = 0; p <= 100; p += 2.5) {
        const big = p % 25 === 0
        const mid = p % 12.5 === 0
        const [x1, y1] = pt(p, R - 2)
        const [x2, y2] = pt(p, R - (big ? 18 : mid ? 12 : 7))
        ticks.push({ x1, y1, x2, y2, big })
    }
    return ticks
})()

/** Height for a given width (keeps the viewBox aspect ratio). */
export function ogDialHeight(width: number): number {
    return Math.round((width * VB.h) / VB.w)
}

interface OgDialProps {
    width: number
    target?: number
    needle?: number
}

export function OgDial({ width, target = 64, needle = 63 }: OgDialProps) {
    const height = ogDialHeight(width)
    const scale = width / VB.w
    const zones = wedgeZones(target)
    const needleTip = pt(needle, R - 6)
    const angle = Math.PI - (needle / 100) * Math.PI
    // Unit vector perpendicular to the needle, for its base.
    const nx = Math.sin(angle) * 8
    const ny = Math.cos(angle) * 8

    return (
        <div style={{ position: 'relative', display: 'flex', width, height }}>
            <svg width={width} height={height} viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} xmlns="http://www.w3.org/2000/svg">
                <path d={sectorPath(0, 100, R + 10)} fill={OG_COLORS.bezel} stroke={OG_COLORS.line} strokeWidth={2} />
                <path d={sectorPath(0, 100, R)} fill={OG_COLORS.face} />
                {zones.map((z, i) => (
                    <path
                        key={i}
                        d={sectorPath(clamp(z.from, 0, 100), clamp(z.to, 0, 100), R)}
                        fill={ZONE_FILL[z.points]}
                        stroke={OG_COLORS.ink}
                        strokeWidth={1.5}
                    />
                ))}
                {TICKS.map((t, i) => (
                    <line
                        key={i}
                        x1={t.x1.toFixed(1)}
                        y1={t.y1.toFixed(1)}
                        x2={t.x2.toFixed(1)}
                        y2={t.y2.toFixed(1)}
                        stroke={OG_COLORS.ink}
                        strokeOpacity={t.big ? 1 : 0.45}
                        strokeWidth={t.big ? 2.5 : 1.5}
                        strokeLinecap="round"
                    />
                ))}
                <path d={arcPath(0, 100, R)} fill="none" stroke={OG_COLORS.ink} strokeWidth={3} />
                <path
                    d={`M${(CX - nx).toFixed(2)} ${(CY - ny).toFixed(2)} L${needleTip[0].toFixed(2)} ${needleTip[1].toFixed(2)} L${(CX + nx).toFixed(2)} ${(CY + ny).toFixed(2)} Z`}
                    fill={OG_COLORS.needle}
                    stroke={OG_COLORS.face}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                />
                <circle cx={CX} cy={CY} r={16} fill={OG_COLORS.ink} stroke={OG_COLORS.face} strokeWidth={2} />
                <circle cx={CX} cy={CY} r={5} fill={OG_COLORS.needle} />
            </svg>
            {zones.map((z, i) => {
                const [x, y] = pt((z.from + z.to) / 2, R * 0.68)
                const size = (z.points === 4 ? 30 : 22) * scale
                return (
                    <div
                        key={i}
                        style={{
                            position: 'absolute',
                            left: (x - VB.x) * scale - size,
                            top: (y - VB.y) * scale - size / 2,
                            width: size * 2,
                            height: size,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: size,
                            fontWeight: 700,
                            color: OG_COLORS.ink,
                        }}
                    >
                        {String(z.points)}
                    </div>
                )
            })}
        </div>
    )
}
