'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import styles from './Spectrum.module.css'

interface PlayerGuess {
    id: string
    nickname: string
    position: number
}

interface SpectrumProps {
    targetPosition: number | null
    guessPosition: number | null
    playerGuesses?: PlayerGuess[]
    isInteractive: boolean
    onPositionChange?: (position: number) => void
}

export default function Spectrum({
    targetPosition,
    guessPosition,
    playerGuesses,
    isInteractive,
    onPositionChange
}: SpectrumProps) {
    const barRef = useRef<HTMLDivElement>(null)
    const [isDragging, setIsDragging] = useState(false)

    const calculatePosition = useCallback((clientX: number) => {
        if (!barRef.current) return 50

        const rect = barRef.current.getBoundingClientRect()
        const x = clientX - rect.left
        const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100))
        return Math.round(percentage)
    }, [])

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!isInteractive) return
        setIsDragging(true)
        const pos = calculatePosition(e.clientX)
        onPositionChange?.(pos)
    }

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging || !isInteractive) return
        const pos = calculatePosition(e.clientX)
        onPositionChange?.(pos)
    }, [isDragging, isInteractive, calculatePosition, onPositionChange])

    const handleMouseUp = useCallback(() => {
        setIsDragging(false)
    }, [])

    const handleTouchStart = (e: React.TouchEvent) => {
        if (!isInteractive) return
        setIsDragging(true)
        const pos = calculatePosition(e.touches[0].clientX)
        onPositionChange?.(pos)
    }

    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (!isDragging || !isInteractive) return
        const pos = calculatePosition(e.touches[0].clientX)
        onPositionChange?.(pos)
    }, [isDragging, isInteractive, calculatePosition, onPositionChange])

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove)
            window.addEventListener('mouseup', handleMouseUp)
            window.addEventListener('touchmove', handleTouchMove)
            window.addEventListener('touchend', handleMouseUp)
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
            window.removeEventListener('touchmove', handleTouchMove)
            window.removeEventListener('touchend', handleMouseUp)
        }
    }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove])

    return (
        <div className={styles.spectrum}>
            <div
                ref={barRef}
                className={`${styles.bar} ${isInteractive ? styles.interactive : ''}`}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
            >
                {/* Gradient bar */}
                <div className={styles.gradient} />

                {/* Target zone - only show when revealed */}
                {targetPosition !== null && (
                    <div
                        className={styles.targetZone}
                        style={{ left: `${targetPosition}%` }}
                    >
                        <div className={styles.targetBullseye} />
                        <div className={styles.targetClose} />
                        <div className={styles.targetAcceptable} />
                        <div className={styles.targetCenter} />
                    </div>
                )}

                {/* Player guesses */}
                {playerGuesses?.map((guess, index) => (
                    <div
                        key={guess.id}
                        className={styles.playerMarker}
                        style={{
                            left: `${guess.position}%`,
                            animationDelay: `${index * 0.1}s`
                        }}
                    >
                        <div className={styles.markerDot} />
                        <span className={styles.markerLabel}>{guess.nickname}</span>
                    </div>
                ))}

                {/* Current guess pointer */}
                {guessPosition !== null && (
                    <div
                        className={`${styles.guessPointer} ${isDragging ? styles.dragging : ''}`}
                        style={{ left: `${guessPosition}%` }}
                    >
                        <div className={styles.pointerArrow}>▼</div>
                        <span className={styles.pointerLabel}>Seu palpite</span>
                    </div>
                )}
            </div>

            {/* Scale markers */}
            <div className={styles.scale}>
                <span>0</span>
                <span>25</span>
                <span>50</span>
                <span>75</span>
                <span>100</span>
            </div>
        </div>
    )
}
