// Background music preferences and gain curve: pure, DOM-free (also imported
// by the tests through the server tsconfig, which has no DOM lib). The player
// itself lives in music.ts.

/** Slider position (0–1) a first-time visitor gets: quiet, under the game sounds. */
export const MUSIC_DEFAULT_VOLUME = 0.3
/** Gain at slider 100%: the music never competes with the game sounds. */
export const MUSIC_MAX_GAIN = 0.6
export const MUSIC_STORAGE_KEY = 'syntonize:music'

export interface MusicPrefs {
    on: boolean
    /** Slider position, 0–1 (see `gainFor` for the actual gain). */
    volume: number
}

export type MusicStatus =
    | 'idle'          // preferences known, nothing loaded yet
    | 'loading'       // fetching/decoding the track
    | 'ready'         // decoded, waiting for a user gesture (autoplay policy)
    | 'playing'
    | 'paused'        // turned off by the user
    | 'unavailable'   // no Web Audio, or the track could not be loaded

export interface MusicState extends MusicPrefs {
    status: MusicStatus
}

export const DEFAULT_MUSIC_PREFS: MusicPrefs = { on: true, volume: MUSIC_DEFAULT_VOLUME }

export function clampVolume(value: unknown): number {
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n)) return MUSIC_DEFAULT_VOLUME
    return Math.min(1, Math.max(0, Math.round(n * 100) / 100))
}

/** Perceptual-ish curve: half the slider is well under half the loudness. */
export function gainFor(volume: number): number {
    const v = clampVolume(volume)
    return MUSIC_MAX_GAIN * Math.pow(v, 1.5)
}

/** Parses the stored preferences; anything odd falls back to the defaults. */
export function parseMusicPrefs(raw: string | null | undefined): MusicPrefs {
    if (!raw) return { ...DEFAULT_MUSIC_PREFS }
    try {
        const value = JSON.parse(raw) as Partial<MusicPrefs> | null
        if (!value || typeof value !== 'object') return { ...DEFAULT_MUSIC_PREFS }
        return {
            on: typeof value.on === 'boolean' ? value.on : DEFAULT_MUSIC_PREFS.on,
            volume: clampVolume(value.volume),
        }
    } catch {
        return { ...DEFAULT_MUSIC_PREFS }
    }
}

export function serializeMusicPrefs(prefs: MusicPrefs): string {
    return JSON.stringify({ on: prefs.on, volume: clampVolume(prefs.volume) })
}
