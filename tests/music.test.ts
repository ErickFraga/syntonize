import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_MUSIC_PREFS, MUSIC_MAX_GAIN, clampVolume, gainFor, parseMusicPrefs, serializeMusicPrefs } from '../src/lib/musicPrefs.ts'

describe('background music preferences', () => {
    test('defaults: on, quiet', () => {
        assert.deepEqual(parseMusicPrefs(null), DEFAULT_MUSIC_PREFS)
        assert.deepEqual(parseMusicPrefs(''), DEFAULT_MUSIC_PREFS)
        assert.ok(DEFAULT_MUSIC_PREFS.on)
        assert.ok(DEFAULT_MUSIC_PREFS.volume <= 0.35, 'first-time volume stays low')
    })

    test('round-trips through storage', () => {
        const prefs = { on: false, volume: 0.45 }
        assert.deepEqual(parseMusicPrefs(serializeMusicPrefs(prefs)), prefs)
    })

    test('ignores garbage and clamps the volume', () => {
        assert.deepEqual(parseMusicPrefs('{not json'), DEFAULT_MUSIC_PREFS)
        assert.deepEqual(parseMusicPrefs('42'), DEFAULT_MUSIC_PREFS)
        assert.equal(parseMusicPrefs('{"on":"yes","volume":7}').volume, 1)
        assert.equal(parseMusicPrefs('{"on":true,"volume":-1}').volume, 0)
        assert.equal(parseMusicPrefs('{"on":true,"volume":"x"}').volume, DEFAULT_MUSIC_PREFS.volume)
        assert.equal(parseMusicPrefs('{"on":"yes"}').on, DEFAULT_MUSIC_PREFS.on)
        assert.equal(clampVolume(0.123), 0.12)
    })

    test('gain curve: silent at 0, capped, and quieter than linear in the middle', () => {
        assert.equal(gainFor(0), 0)
        assert.equal(gainFor(1), MUSIC_MAX_GAIN)
        assert.ok(gainFor(0.5) < MUSIC_MAX_GAIN / 2)
        assert.ok(gainFor(0.3) > 0 && gainFor(0.3) < gainFor(0.5))
    })
})
