import { PLAYER_COLORS } from '@/types/game'
import styles from './Avatar.module.css'

interface AvatarProps {
    name: string
    colorIndex: number
    size?: 'sm' | 'md' | 'lg' | 'xl'
    offline?: boolean
    ring?: boolean
    className?: string
}

export function playerColor(colorIndex: number): string {
    return PLAYER_COLORS[((colorIndex % PLAYER_COLORS.length) + PLAYER_COLORS.length) % PLAYER_COLORS.length]
}

export function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return '?'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[1][0]).toUpperCase()
}

export default function Avatar({ name, colorIndex, size = 'md', offline = false, ring = false, className = '' }: AvatarProps) {
    const color = playerColor(colorIndex)
    return (
        <span
            className={`${styles.avatar} ${styles[size]} ${offline ? styles.offline : ''} ${ring ? styles.ring : ''} ${className}`}
            style={{ '--avatar-color': color } as React.CSSProperties}
            title={name}
            aria-hidden="true"
        >
            {initials(name)}
        </span>
    )
}
