import styles from './Logo.module.css'

interface LogoProps {
    size?: 'sm' | 'md' | 'lg'
    withWordmark?: boolean
}

/** Brand mark: a tiny dial with its needle, plus the wordmark. */
export default function Logo({ size = 'md', withWordmark = true }: LogoProps) {
    return (
        <span className={`${styles.logo} ${styles[size]}`}>
            <svg viewBox="0 0 48 30" className={styles.mark} aria-hidden="true">
                <defs>
                    <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0" stopColor="#2ee6d6" />
                        <stop offset="0.5" stopColor="#8f7bff" />
                        <stop offset="1" stopColor="#ff5d8f" />
                    </linearGradient>
                </defs>
                <path d="M3 27 A21 21 0 0 1 45 27 Z" fill="#f6efe3" />
                <path d="M24 27 L31.5 8.2 A21 21 0 0 1 38.6 14.3 Z" fill="url(#logoGrad)" opacity="0.95" />
                <path d="M3 27 A21 21 0 0 1 45 27" fill="none" stroke="#1b1a2e" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M21.5 27 L24 9 L26.5 27 Z" fill="#d62828" stroke="#fff" strokeWidth="0.8" strokeLinejoin="round" />
                <circle cx="24" cy="27" r="3.2" fill="#1b1a2e" stroke="#fff" strokeWidth="1" />
            </svg>
            {withWordmark && <span className={`${styles.word} text-gradient`}>Syntonize</span>}
        </span>
    )
}
