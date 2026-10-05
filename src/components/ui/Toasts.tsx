'use client'

import type { Toast } from '@/hooks/useGameState'
import styles from './Toasts.module.css'

export default function Toasts({ toasts }: { toasts: Toast[] }) {
    if (toasts.length === 0) return null
    return (
        <div className={styles.stack} role="status" aria-live="polite">
            {toasts.map(t => (
                <div key={t.id} className={`${styles.toast} ${styles[t.kind]}`}>
                    <span className={styles.dot} />
                    <span>{t.message}</span>
                </div>
            ))}
        </div>
    )
}
