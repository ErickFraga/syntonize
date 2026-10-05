'use client'

// Tiny synthesized sound effects (no assets): a WebAudio oscillator per note.
// Everything is silenced by the mute toggle, persisted in localStorage.

import { session } from './socket'

type Note = { freq: number; at: number; dur: number; type?: OscillatorType; gain?: number }

let ctx: AudioContext | null = null
let muted: boolean | null = null

function context(): AudioContext | null {
    if (typeof window === 'undefined') return null
    try {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Ctor) return null
        if (!ctx) ctx = new Ctor()
        if (ctx.state === 'suspended') void ctx.resume()
        return ctx
    } catch {
        return null
    }
}

function play(notes: Note[]): void {
    if (isMuted()) return
    const ac = context()
    if (!ac) return
    const start = ac.currentTime + 0.01
    for (const n of notes) {
        const osc = ac.createOscillator()
        const gain = ac.createGain()
        osc.type = n.type ?? 'sine'
        osc.frequency.setValueAtTime(n.freq, start + n.at)
        const g = n.gain ?? 0.08
        gain.gain.setValueAtTime(0.0001, start + n.at)
        gain.gain.exponentialRampToValueAtTime(g, start + n.at + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + n.at + n.dur)
        osc.connect(gain).connect(ac.destination)
        osc.start(start + n.at)
        osc.stop(start + n.at + n.dur + 0.05)
    }
}

export function isMuted(): boolean {
    if (muted === null) muted = session.isMuted()
    return muted
}

export function setMuted(value: boolean): void {
    muted = value
    session.setMuted(value)
}

export const sounds = {
    tick: () => play([{ freq: 880, at: 0, dur: 0.06, type: 'square', gain: 0.03 }]),
    lock: () => play([{ freq: 520, at: 0, dur: 0.08 }, { freq: 780, at: 0.07, dur: 0.12 }]),
    /** Soft blip for a chat message or reaction from someone else. */
    chat: () => play([{ freq: 988, at: 0, dur: 0.05, gain: 0.04 }, { freq: 1319, at: 0.05, dur: 0.08, gain: 0.03 }]),
    clue: () => play([{ freq: 660, at: 0, dur: 0.1 }, { freq: 880, at: 0.1, dur: 0.16 }]),
    roundStart: () => play([{ freq: 440, at: 0, dur: 0.1 }, { freq: 554, at: 0.1, dur: 0.1 }, { freq: 659, at: 0.2, dur: 0.18 }]),
    reveal: () => play([
        { freq: 392, at: 0, dur: 0.12, type: 'triangle' },
        { freq: 523, at: 0.12, dur: 0.12, type: 'triangle' },
        { freq: 659, at: 0.24, dur: 0.12, type: 'triangle' },
        { freq: 784, at: 0.36, dur: 0.35, type: 'triangle', gain: 0.1 },
    ]),
    finish: () => play([
        { freq: 523, at: 0, dur: 0.15, type: 'triangle' },
        { freq: 659, at: 0.15, dur: 0.15, type: 'triangle' },
        { freq: 784, at: 0.3, dur: 0.15, type: 'triangle' },
        { freq: 1046, at: 0.45, dur: 0.5, type: 'triangle', gain: 0.1 },
    ]),
}
