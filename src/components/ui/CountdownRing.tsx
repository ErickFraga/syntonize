'use client'

import styles from './CountdownRing.module.css'

interface CountdownRingProps {
    seconds: number
    total: number
    label?: string
    size?: number
}

/** Circular countdown; turns orange under 10s and red under 5s. */
export default function CountdownRing({ seconds, total, label, size = 56 }: CountdownRingProps) {
    const radius = 22
    const circumference = 2 * Math.PI * radius
    const ratio = total > 0 ? Math.max(0, Math.min(1, seconds / total)) : 0
    const tone = seconds <= 5 ? styles.danger : seconds <= 10 ? styles.warning : ''

    return (
        <div className={`${styles.ring} ${tone}`} style={{ width: size, height: size }} role="timer" aria-label={`${seconds} segundos`}>
            <svg viewBox="0 0 56 56" aria-hidden="true">
                <circle className={styles.track} cx="28" cy="28" r={radius} />
                <circle
                    className={styles.progress}
                    cx="28"
                    cy="28"
                    r={radius}
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - ratio)}
                />
            </svg>
            <span className={styles.value}>{seconds}</span>
            {label && <span className={styles.label}>{label}</span>}
        </div>
    )
}
