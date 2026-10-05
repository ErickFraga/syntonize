'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { encodeQr, qrToSvgPath } from '@/lib/qrcode'
import { XIcon } from '@/components/ui/Icons'
import styles from './QrCode.module.css'

/** Light margin around the code, in modules (the standard asks for 4 so scanners lock on). */
const QUIET_ZONE = 4

interface QrSvgProps {
    value: string
    /** Accessible name; without it the SVG is decorative (the parent carries the label). */
    label?: string
}

function QrSvg({ value, label }: QrSvgProps) {
    const { path, size } = useMemo(() => {
        const qr = encodeQr(value)
        return { path: qrToSvgPath(qr.modules, QUIET_ZONE), size: qr.size + QUIET_ZONE * 2 }
    }, [value])
    return (
        <svg className={styles.svg} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
            <rect width={size} height={size} className={styles.svgBg} />
            <path d={path} fill="currentColor" />
        </svg>
    )
}

const ExpandIcon = ({ size = 14 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" />
    </svg>
)

interface QrFullscreenProps {
    value: string
    code: string
    onClose: () => void
}

/** Full-screen view so a whole table can point their phones at it. Closes on Esc or any click. */
export function QrFullscreen({ value, code, onClose }: QrFullscreenProps) {
    const closeRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null
        closeRef.current?.focus()
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => {
            window.removeEventListener('keydown', onKey)
            previous?.focus()
        }
    }, [onClose])

    return (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="QR code da sala" onClick={onClose}>
            <button ref={closeRef} className={`btn btn-ghost ${styles.close}`} onClick={onClose} aria-label="Fechar">
                <XIcon size={20} />
            </button>
            <div className={styles.big}>
                <QrSvg value={value} label={`QR code do convite para a sala ${code}`} />
            </div>
            <div className={styles.bigCaption}>
                <span className={styles.bigLabel}>Aponte a câmera para entrar</span>
                <span className={styles.bigCode}>{code}</span>
            </div>
        </div>
    )
}

interface QrCodeProps {
    /** Text encoded in the QR (the invite link). */
    value: string
    /** Room code shown under the enlarged QR. */
    code: string
    className?: string
}

export default function QrCode({ value, code, className }: QrCodeProps) {
    const [open, setOpen] = useState(false)
    return (
        <>
            <button className={`${styles.thumb} ${className ?? ''}`} onClick={() => setOpen(true)} title="Ampliar QR code" aria-label={`Ampliar QR code do convite para a sala ${code}`}>
                <QrSvg value={value} />
                <span className={styles.thumbHint}><ExpandIcon /></span>
            </button>
            {open && <QrFullscreen value={value} code={code} onClose={() => setOpen(false)} />}
        </>
    )
}
