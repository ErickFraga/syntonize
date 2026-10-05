'use client'

// Background music: one looped track played through Web Audio (gapless loop,
// unlike <audio loop>), at a low volume. The browser only allows sound after
// a user gesture, so the track is preloaded on mount and started at the first
// tap or key press. Preferences (on/off and volume) live in localStorage.

export const MUSIC_SRC = '/audio/ambient-loop.mp3'
/** Slider position (0–1) a first-time visitor gets: quiet, under the game sounds. */
export const MUSIC_DEFAULT_VOLUME = 0.3
/** Gain at slider 100%: the music never competes with the game sounds. */
export const MUSIC_MAX_GAIN = 0.6
const STORAGE_KEY = 'syntonize:music'

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

// ============================================
// PLAYER (module singleton)
// ============================================

type Listener = (state: MusicState) => void

const listeners = new Set<Listener>()
let state: MusicState | null = null
let ctx: AudioContext | null = null
let gain: GainNode | null = null
let source: AudioBufferSourceNode | null = null
let buffer: AudioBuffer | null = null
let loading: Promise<AudioBuffer | null> | null = null
let gesturesArmed = false

const FADE_IN_S = 1.5
const FADE_OUT_S = 0.4

function storage(): Storage | undefined {
    try {
        return typeof window === 'undefined' ? undefined : window.localStorage
    } catch {
        return undefined
    }
}

function readPrefs(): MusicPrefs {
    try {
        return parseMusicPrefs(storage()?.getItem(STORAGE_KEY))
    } catch {
        return { ...DEFAULT_MUSIC_PREFS }
    }
}

function writePrefs(prefs: MusicPrefs): void {
    try {
        storage()?.setItem(STORAGE_KEY, serializeMusicPrefs(prefs))
    } catch {
        /* storage unavailable (private mode, etc.) */
    }
}

function current(): MusicState {
    if (!state) state = { ...readPrefs(), status: 'idle' }
    return state
}

function update(patch: Partial<MusicState>): void {
    state = { ...current(), ...patch }
    for (const listener of Array.from(listeners)) listener(state)
}

export function getMusicState(): MusicState {
    return current()
}

export function subscribeMusic(listener: Listener): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
}

function audioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (ctx) return ctx
    try {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Ctor) return null
        ctx = new Ctor()
        gain = ctx.createGain()
        gain.gain.value = 0.0001
        gain.connect(ctx.destination)
        return ctx
    } catch {
        return null
    }
}

/** Fetches and decodes the track once; null when it is missing or undecodable. */
function load(): Promise<AudioBuffer | null> {
    if (buffer) return Promise.resolve(buffer)
    if (loading) return loading
    const ac = audioContext()
    if (!ac) {
        update({ status: 'unavailable' })
        return Promise.resolve(null)
    }
    update({ status: 'loading' })
    loading = (async () => {
        try {
            const response = await fetch(MUSIC_SRC, { cache: 'force-cache' })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const bytes = await response.arrayBuffer()
            buffer = await ac.decodeAudioData(bytes)
            if (current().status === 'loading') update({ status: 'ready' })
            return buffer
        } catch {
            update({ status: 'unavailable' })
            return null
        } finally {
            loading = null
        }
    })()
    return loading
}

/** Starts the loop (needs a user gesture to have happened). No-op if already playing. */
async function play(): Promise<void> {
    const ac = audioContext()
    if (!ac || !gain) {
        update({ status: 'unavailable' })
        return
    }
    const track = await load()
    if (!track || !current().on) return
    if (ac.state === 'suspended') {
        try {
            await ac.resume()
        } catch {
            return
        }
    }
    if (ac.state !== 'running' || source) return
    source = ac.createBufferSource()
    source.buffer = track
    source.loop = true
    source.loopStart = 0
    source.loopEnd = track.duration
    source.connect(gain)
    const now = ac.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainFor(current().volume)), now + FADE_IN_S)
    source.start(now)
    update({ status: 'playing' })
}

function stop(): void {
    const ac = ctx
    const node = source
    source = null
    if (ac && gain && node) {
        const now = ac.currentTime
        gain.gain.cancelScheduledValues(now)
        gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + FADE_OUT_S)
        try {
            node.stop(now + FADE_OUT_S + 0.05)
        } catch {
            /* already stopped */
        }
    }
    if (current().status === 'playing') update({ status: 'ready' })
}

function onGesture(): void {
    const s = current()
    if (!s.on || s.status === 'unavailable') return
    if (s.status === 'playing') {
        // iOS suspends the context when the page goes to the background.
        if (ctx?.state === 'suspended') void ctx.resume()
        return
    }
    void play()
}

/**
 * Installs the one-time autoplay hook: the first tap or key press on the page
 * starts the music if it is on. Also preloads the track so the start is
 * instant. Safe to call many times (from every page that shows the control).
 */
export function armMusic(): void {
    if (typeof window === 'undefined' || gesturesArmed) return
    gesturesArmed = true
    for (const type of ['pointerdown', 'keydown', 'touchstart'] as const) {
        window.addEventListener(type, onGesture, { passive: true, capture: true })
    }
    if (current().on) void load()
}

export function setMusicOn(on: boolean): void {
    const prefs: MusicPrefs = { on, volume: current().volume }
    writePrefs(prefs)
    update(prefs)
    if (on) void play()
    else {
        stop()
        update({ status: 'paused' })
    }
}

export function setMusicVolume(volume: number): void {
    const prefs: MusicPrefs = { on: current().on, volume: clampVolume(volume) }
    writePrefs(prefs)
    update(prefs)
    if (ctx && gain && source) {
        const now = ctx.currentTime
        gain.gain.cancelScheduledValues(now)
        gain.gain.setTargetAtTime(Math.max(0.0001, gainFor(prefs.volume)), now, 0.05)
    }
}
