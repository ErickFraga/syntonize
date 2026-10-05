import styles from './Logo.module.css'

interface LogoProps {
    size?: 'sm' | 'md' | 'lg'
    withWordmark?: boolean
}

/** Marca: um mostrador em miniatura com a cunha e o ponteiro, mais o logotipo. */
export default function Logo({ size = 'md', withWordmark = true }: LogoProps) {
    return (
        <span className={`${styles.logo} ${styles[size]}`}>
            <svg viewBox="0 0 48 30" className={styles.mark} aria-hidden="true">
                <path d="M3 27 A21 21 0 0 1 45 27 Z" fill="#FFFDF8" stroke="var(--line)" strokeWidth="2.5" />
                <path d="M24 27 L31.5 8.2 A21 21 0 0 1 38.6 14.3 Z" fill="#FF6F9C" stroke="var(--line)" strokeWidth="1.5" />
                <path d="M21.5 27 L24 9 L26.5 27 Z" fill="#3B1F5C" />
                <circle cx="24" cy="27" r="3.2" fill="#3B1F5C" />
            </svg>
            {withWordmark && <span className={styles.word}>Syntonize</span>}
        </span>
    )
}
