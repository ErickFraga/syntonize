'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { SCORING } from '@/types/game'
import { playerColor, initials } from '@/components/ui/Avatar'
import { useT } from '@/i18n/I18nProvider'
import styles from './Dial.module.css'

export interface DialMarker {
    id: string
    name: string
    colorIndex: number
    position: number
    /** Dim markers that scored nothing. */
    dim?: boolean
}

interface DialProps {
    /** Target position; null hides the wedge entirely. */
    target: number | null
    /** Draw the opaque "screen" over the face (target hidden from this viewer). */
    covered?: boolean
    /**
     * Reveal moment. The screen already swings open by itself as soon as
     * `covered` turns false (one render before this flag), and the markers wait
     * for it; kept so callers can keep flagging the moment.
     */
    revealing?: boolean
    /** Controlled needle position; null hides the needle. */
    needle: number | null
    onNeedleChange?: (position: number) => void
    onNeedleCommit?: (position: number) => void
    interactive?: boolean
    /** Needle is locked in (after submitting). */
    locked?: boolean
    markers?: DialMarker[]
    className?: string
}

// Geometry (viewBox units). The face is a semicircle centred at (CX, CY).
const CX = 200
const CY = 212
const R = 184
const MARGIN_X = 30
const MARGIN_Y = 46
const VB = { x: -MARGIN_X, y: -MARGIN_Y, w: 400 + MARGIN_X * 2, h: 232 + MARGIN_Y }

// Clip for the screen: it turns around the hub and disappears below the face line.
const LID_CLIP = { x: VB.x, y: VB.y, w: VB.w, h: CY - VB.y }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** Point on the arc at `position` (0 = far left, 100 = far right). */
function pt(position: number, radius: number): [number, number] {
    const a = Math.PI - (position / 100) * Math.PI
    return [CX + radius * Math.cos(a), CY - radius * Math.sin(a)]
}

function arcPath(p0: number, p1: number, radius: number): string {
    const [x0, y0] = pt(p0, radius)
    const [x1, y1] = pt(p1, radius)
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${radius} ${radius} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

function sectorPath(p0: number, p1: number, radius: number): string {
    const [x0, y0] = pt(p0, radius)
    const [x1, y1] = pt(p1, radius)
    return `M${CX} ${CY} L${x0.toFixed(2)} ${y0.toFixed(2)} A${radius} ${radius} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`
}

const FACE = sectorPath(0, 100, R)
const RIM = arcPath(0, 100, R)
const BASE = sectorPath(0, 100, R + 10)

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

export default function Dial({
    target,
    covered = false,
    needle,
    onNeedleChange,
    onNeedleCommit,
    interactive = false,
    locked = false,
    markers = [],
    className = '',
}: DialProps) {
    const { t } = useT()
    const svgRef = useRef<SVGSVGElement>(null)
    const [dragging, setDragging] = useState(false)
    const needleRef = useRef(needle)
    needleRef.current = needle
    // Remember whether this viewer had the screen, so it can swing open on the
    // reveal even after `covered` turns false (the Seer never had one).
    const hadCover = useRef(covered)
    if (covered) hadCover.current = true
    const lidOpening = !covered && hadCover.current

    const positionFromPointer = useCallback((clientX: number, clientY: number): number => {
        const svg = svgRef.current
        if (!svg) return 50
        const rect = svg.getBoundingClientRect()
        const scale = Math.min(rect.width / VB.w, rect.height / VB.h)
        const offsetX = (rect.width - VB.w * scale) / 2
        const offsetY = (rect.height - VB.h * scale) / 2
        const vx = (clientX - rect.left - offsetX) / scale + VB.x
        const vy = (clientY - rect.top - offsetY) / scale + VB.y
        const dx = vx - CX
        const dy = CY - vy
        // Below the hub the angle flips; clamp to the nearest end instead.
        if (dy < 0) return dx < 0 ? 0 : 100
        const angle = Math.atan2(dy, dx) // 0 = right, PI = left
        return Math.round(clamp((1 - angle / Math.PI) * 100, 0, 100))
    }, [])

    const handlePointerDown = (e: PointerEvent<SVGSVGElement>) => {
        if (!interactive) return
        e.preventDefault()
        svgRef.current?.setPointerCapture(e.pointerId)
        setDragging(true)
        onNeedleChange?.(positionFromPointer(e.clientX, e.clientY))
    }

    const handlePointerMove = (e: PointerEvent<SVGSVGElement>) => {
        if (!interactive || !dragging) return
        onNeedleChange?.(positionFromPointer(e.clientX, e.clientY))
    }

    const handlePointerUp = (e: PointerEvent<SVGSVGElement>) => {
        if (!dragging) return
        setDragging(false)
        try {
            svgRef.current?.releasePointerCapture(e.pointerId)
        } catch {
            /* already released */
        }
        onNeedleCommit?.(needleRef.current ?? 50)
    }

    const handleKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
        if (!interactive || needle === null) return
        const step = e.shiftKey ? 5 : 1
        let next: number | null = null
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = needle - step
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = needle + step
        if (e.key === 'Home') next = 0
        if (e.key === 'End') next = 100
        if (next === null) return
        e.preventDefault()
        onNeedleChange?.(clamp(next, 0, 100))
    }

    useEffect(() => {
        if (!interactive) setDragging(false)
    }, [interactive])

    const needleDeg = needle === null ? 0 : (needle / 100) * 180 - 90
    const zones = target === null ? [] : wedgeZones(target)

    return (
        <svg
            ref={svgRef}
            className={`${styles.dial} ${interactive ? styles.interactive : ''} ${dragging ? styles.dragging : ''} ${className}`}
            viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
            xmlns="http://www.w3.org/2000/svg"
            role={interactive ? 'slider' : 'img'}
            aria-label={interactive ? t('dial.slider') : t('dial.image')}
            aria-valuemin={interactive ? 0 : undefined}
            aria-valuemax={interactive ? 100 : undefined}
            aria-valuenow={interactive && needle !== null ? needle : undefined}
            tabIndex={interactive ? 0 : -1}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={handleKeyDown}
        >
            <defs>
                <clipPath id="dialLidClip">
                    <rect x={LID_CLIP.x} y={LID_CLIP.y} width={LID_CLIP.w} height={LID_CLIP.h} />
                </clipPath>
            </defs>

            {/* Aro e face */}
            <path d={BASE} className={styles.bezel} />
            <path d={FACE} className={styles.face} />

            {/* Target wedge: 2 | 3 | 4 | 3 | 2 */}
            {zones.length > 0 && (
                <g className={styles.wedge}>
                    {zones.map((z, i) => {
                        const [tx, ty] = pt((z.from + z.to) / 2, R * 0.68)
                        return (
                            <g key={i}>
                                <path
                                    d={sectorPath(clamp(z.from, 0, 100), clamp(z.to, 0, 100), R)}
                                    className={styles[`zone${z.points}`]}
                                />
                                <text x={tx} y={ty} className={`${styles.zoneLabel} ${z.points === 4 ? styles.zoneLabelBig : ''}`}>
                                    {z.points}
                                </text>
                            </g>
                        )
                    })}
                </g>
            )}

            {/* Screen that hides the target; on the reveal it turns around the hub and goes behind the face */}
            {(covered || hadCover.current) && (
                <g className={styles.cover} clipPath="url(#dialLidClip)">
                    <g className={`${styles.lid} ${lidOpening ? styles.lidOpen : ''}`} style={{ transformOrigin: `${CX}px ${CY}px` }}>
                        <path d={FACE} className={styles.coverFace} />
                        <text x={CX} y={CY - 78} className={styles.coverMark}>?</text>
                    </g>
                </g>
            )}

            {/* Ticks and rim */}
            <g className={styles.ticks}>
                {TICKS.map((t, i) => (
                    <line
                        key={i}
                        x1={t.x1.toFixed(1)}
                        y1={t.y1.toFixed(1)}
                        x2={t.x2.toFixed(1)}
                        y2={t.y2.toFixed(1)}
                        className={t.big ? styles.tickBig : styles.tick}
                    />
                ))}
            </g>
            <path d={RIM} className={styles.rim} />

            {/* Other players' guesses (reveal) */}
            {markers.map((m, i) => {
                const [x1, y1] = pt(m.position, R + 2)
                const [ax, ay] = pt(m.position, R + 24)
                const color = playerColor(m.colorIndex)
                return (
                    <g key={m.id} className={`${styles.marker} ${m.dim ? styles.markerDim : ''}`} style={{ animationDelay: `${(lidOpening ? 0.75 : 0.15) + i * 0.08}s` }}>
                        <line x1={CX} y1={CY} x2={x1.toFixed(1)} y2={y1.toFixed(1)} stroke={color} className={styles.markerLine} />
                        <circle cx={ax.toFixed(1)} cy={ay.toFixed(1)} r="14" fill={color} className={styles.markerDot} />
                        <text x={ax.toFixed(1)} y={ay.toFixed(1)} className={styles.markerText}>
                            {initials(m.name)}
                        </text>
                    </g>
                )
            })}

            {/* Needle */}
            {needle !== null && (
                <g
                    className={`${styles.needle} ${locked ? styles.needleLocked : ''}`}
                    style={{ transform: `rotate(${needleDeg}deg)`, transformOrigin: `${CX}px ${CY}px` }}
                >
                    <path d={`M${CX - 7} ${CY} L${CX} ${CY - (R - 6)} L${CX + 7} ${CY} Z`} className={styles.needleBody} />
                </g>
            )}

            {/* Hub */}
            <circle cx={CX} cy={CY} r="16" className={styles.hub} />
            <circle cx={CX} cy={CY} r="5" className={styles.hubDot} />
        </svg>
    )
}
