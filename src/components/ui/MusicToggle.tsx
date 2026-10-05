'use client'

import { useEffect, useRef, useState } from 'react'
import { armMusic, getMusicState, setMusicOn, setMusicVolume, subscribeMusic, type MusicState } from '@/lib/music'
import { useT } from '@/i18n/I18nProvider'
import { MusicIcon, MusicOffIcon } from './Icons'
import styles from './MusicToggle.module.css'

/**
 * Background music control: the button opens a small panel with on/off and
 * volume. Hidden when the track cannot be played (missing file, no Web Audio).
 */
export default function MusicToggle({ className = '', initialOpen = false }: { className?: string; initialOpen?: boolean }) {
    const { t } = useT()
    const [music, setMusic] = useState<MusicState>({ on: false, volume: 0, status: 'idle' })
    const [open, setOpen] = useState(initialOpen)
    const wrapRef = useRef<HTMLDivElement>(null)
    const panelId = 'music-panel'

    useEffect(() => {
        setMusic(getMusicState())
        armMusic()
        return subscribeMusic(setMusic)
    }, [])

    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
        const onPointer = (e: PointerEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
        }
        window.addEventListener('keydown', onKey)
        window.addEventListener('pointerdown', onPointer)
        return () => {
            window.removeEventListener('keydown', onKey)
            window.removeEventListener('pointerdown', onPointer)
        }
    }, [open])

    if (music.status === 'unavailable') return null

    const playing = music.on
    const hint = music.on && (music.status === 'ready' || music.status === 'idle' || music.status === 'loading')
        ? t('music.startsOnTap')
        : null

    return (
        <div ref={wrapRef} className={`${styles.wrap} ${className}`}>
            <button
                type="button"
                className={`btn-icon ${playing ? styles.active : ''}`}
                onClick={() => setOpen(v => !v)}
                title={t('music.title')}
                aria-label={t('music.title')}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-controls={panelId}
            >
                {playing ? <MusicIcon size={18} /> : <MusicOffIcon size={18} />}
            </button>

            {open && (
                <div id={panelId} className={`${styles.panel} anim-pop`} role="dialog" aria-label={t('music.title')}>
                    <span className={styles.title}>{t('music.title')}</span>
                    <div className={styles.row}>
                        <button
                            type="button"
                            className={`btn btn-sm ${playing ? 'btn-secondary' : 'btn-primary'}`}
                            onClick={() => setMusicOn(!playing)}
                            aria-pressed={playing}
                        >
                            {playing ? <MusicOffIcon size={14} /> : <MusicIcon size={14} />}
                            {playing ? t('music.turnOff') : t('music.turnOn')}
                        </button>
                    </div>
                    <label className={styles.volume}>
                        <span className="sr-only">{t('music.volume')}</span>
                        <MusicIcon size={14} className={styles.volumeIcon} />
                        <input
                            type="range"
                            className={styles.range}
                            min={0}
                            max={100}
                            step={5}
                            value={Math.round(music.volume * 100)}
                            onChange={(e) => setMusicVolume(Number((e.target as unknown as { value: string }).value) / 100)}
                            aria-label={t('music.volume')}
                            disabled={!playing}
                        />
                        <span className={styles.value}>{Math.round(music.volume * 100)}%</span>
                    </label>
                    {hint && <span className={styles.hint}>{hint}</span>}
                </div>
            )}
        </div>
    )
}
