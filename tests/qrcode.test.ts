import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { encodeQr, qrToSvgPath, reedSolomon, formatBits, versionBits, byteCapacity, sizeForVersion, QR_MAX_VERSION } from '../src/lib/qrcode.ts'

// ---------------------------------------------------------------------------
// Reference values published with the standard / common tutorials (thonky.com).
// ---------------------------------------------------------------------------

/** Format strings for level M, masks 0–7 (after the 0x5412 XOR). */
const FORMAT_M = [
    '101010000010010', '101000100100101', '101111001111100', '101101101001011',
    '100010111111001', '100000011001110', '100111110010111', '100101010100000',
]

const VERSION_INFO: Record<number, string> = {
    7: '000111110010010100',
    8: '001000010110111100',
    9: '001001101010011001',
    10: '001010010011010011',
}

const MASKS: Array<(r: number, c: number) => boolean> = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
]

/** Level M block structure: [ec per block, [[blocks, data per block], ...]]. */
const BLOCKS: Record<number, [number, Array<[number, number]>]> = {
    1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]], 4: [18, [[2, 32]]], 5: [24, [[2, 43]]],
    6: [16, [[4, 27]]], 7: [18, [[4, 31]]], 8: [22, [[2, 38], [2, 39]]], 9: [22, [[3, 36], [2, 37]]], 10: [26, [[4, 43], [1, 44]]],
}
const ALIGN: Record<number, number[]> = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
}

// ---------------------------------------------------------------------------
// A small, independent decoder: reads the matrix back like a scanner would
// (format info → unmask → zigzag → de-interleave → RS syndromes → byte mode).
// ---------------------------------------------------------------------------

const GF_EXP: number[] = []
{
    let x = 1
    for (let i = 0; i < 510; i++) {
        GF_EXP.push(x)
        x = (x << 1) ^ (x & 0x80 ? 0x11d : 0)
        x &= 0xff
    }
}
const GF_LOG: number[] = []
for (let i = 0; i < 255; i++) GF_LOG[GF_EXP[i]] = i
const mul = (a: number, b: number) => (a && b ? GF_EXP[GF_LOG[a] + GF_LOG[b]] : 0)

/** Evaluates the received block (as a polynomial, highest power first) at α^0..α^(ec-1). */
function syndromesAreZero(block: number[], ec: number): boolean {
    for (let i = 0; i < ec; i++) {
        let acc = 0
        for (const c of block) acc = mul(acc, GF_EXP[i]) ^ c
        if (acc !== 0) return false
    }
    return true
}

function isFunctionModule(version: number, r: number, c: number): boolean {
    const n = sizeForVersion(version)
    if ((r < 9 && c < 9) || (r < 9 && c >= n - 8) || (r >= n - 8 && c < 9)) return true // finders + separators + format
    if (r === 6 || c === 6) return true // timing
    const a = ALIGN[version]
    for (const ar of a) {
        for (const ac of a) {
            const nearFinder = (ar === 6 && ac === 6) || (ar === 6 && ac === a[a.length - 1]) || (ar === a[a.length - 1] && ac === 6)
            if (!nearFinder && Math.abs(r - ar) <= 2 && Math.abs(c - ac) <= 2) return true
        }
    }
    if (version >= 7 && ((r < 6 && c >= n - 11) || (c < 6 && r >= n - 11))) return true
    return false
}

function decode(modules: boolean[][]): { text: string; version: number; mask: number } {
    const n = modules.length
    const version = (n - 17) / 4
    assert.ok(Number.isInteger(version) && version >= 1 && version <= 10, `unexpected size ${n}`)
    const bit = (r: number, c: number) => (modules[r][c] ? '1' : '0')

    // Format, first copy (around top-left finder), bit 14 first.
    let f1 = ''
    for (const c of [0, 1, 2, 3, 4, 5, 7, 8]) f1 += bit(8, c)
    for (const r of [7, 5, 4, 3, 2, 1, 0]) f1 += bit(r, 8)
    // Second copy (bottom-left column then top-right row).
    let f2 = ''
    for (let r = n - 1; r >= n - 7; r--) f2 += bit(r, 8)
    for (let c = n - 8; c < n; c++) f2 += bit(8, c)
    assert.equal(f1, f2, 'both format copies must match')
    const mask = FORMAT_M.indexOf(f1)
    assert.ok(mask >= 0, `format ${f1} is not a level-M format string`)
    assert.equal(modules[n - 8][8], true, 'dark module')

    // Zigzag read of data modules, unmasking as we go.
    const bits: number[] = []
    let upward = true
    for (let right = n - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5
        for (let i = 0; i < n; i++) {
            const r = upward ? n - 1 - i : i
            for (const c of [right, right - 1]) {
                if (isFunctionModule(version, r, c)) continue
                bits.push((modules[r][c] !== MASKS[mask](r, c)) ? 1 : 0)
            }
        }
        upward = !upward
    }
    const codewords: number[] = []
    for (let i = 0; i + 8 <= bits.length; i += 8) codewords.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0))

    // De-interleave.
    const [ec, groups] = BLOCKS[version]
    const lens = groups.flatMap(([count, len]) => new Array(count).fill(len) as number[])
    const blocks: number[][] = lens.map(() => [])
    let k = 0
    for (let i = 0; i < Math.max(...lens); i++) lens.forEach((len, b) => { if (i < len) blocks[b].push(codewords[k++]) })
    for (let i = 0; i < ec; i++) blocks.forEach(block => block.push(codewords[k++]))
    blocks.forEach((block, b) => assert.ok(syndromesAreZero(block, ec), `RS check failed on block ${b}`))
    const data = blocks.flatMap((block, b) => block.slice(0, lens[b]))

    // Byte mode segment.
    const dataBits = data.flatMap(byte => [7, 6, 5, 4, 3, 2, 1, 0].map(i => (byte >> i) & 1))
    let p = 0
    const read = (len: number) => {
        let v = 0
        for (let i = 0; i < len; i++) v = (v << 1) | dataBits[p++]
        return v
    }
    assert.equal(read(4), 0b0100, 'byte mode indicator')
    const count = read(version <= 9 ? 8 : 16)
    const bytes = new Uint8Array(count)
    for (let i = 0; i < count; i++) bytes[i] = read(8)
    return { text: new TextDecoder().decode(bytes), version, mask }
}

const toBits = (n: number, len: number) => n.toString(2).padStart(len, '0')

// ---------------------------------------------------------------------------

describe('qrcode: building blocks', () => {
    test('Reed-Solomon matches the published HELLO WORLD 1-M example', () => {
        const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17]
        assert.deepEqual(reedSolomon(data, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23])
    })

    test('format info is the BCH code for level M + mask', () => {
        FORMAT_M.forEach((expected, mask) => assert.equal(toBits(formatBits(mask), 15), expected, `mask ${mask}`))
    })

    test('version info (BCH 18,6) for versions 7–10', () => {
        for (const [v, expected] of Object.entries(VERSION_INFO)) assert.equal(toBits(versionBits(Number(v)), 18), expected, `version ${v}`)
    })
})

describe('qrcode: matrix', () => {
    test('size is 21 + 4·(v−1) for every version', () => {
        for (let v = 1; v <= QR_MAX_VERSION; v++) {
            const qr = encodeQr('x'.repeat(byteCapacity(v)))
            assert.equal(qr.version, v)
            assert.equal(qr.size, 21 + 4 * (v - 1))
            assert.equal(qr.modules.length, qr.size)
            assert.ok(qr.modules.every(row => row.length === qr.size))
        }
    })

    test('picks the smallest version that fits', () => {
        assert.equal(encodeQr('').version, 1)
        assert.equal(encodeQr('a'.repeat(14)).version, 1) // 1-M holds 14 bytes
        assert.equal(encodeQr('a'.repeat(15)).version, 2)
        assert.equal(encodeQr('https://syntonize.onrender.com/join/K7PX2Q').version, 3)
        assert.equal(encodeQr('a'.repeat(213)).version, 10)
        // UTF-8: "ç" takes two bytes.
        assert.equal(encodeQr('ç'.repeat(7)).version, 1)
        assert.equal(encodeQr('ç'.repeat(8)).version, 2)
    })

    test('throws a clear error when the text does not fit', () => {
        assert.throws(() => encodeQr('a'.repeat(214)), /grande demais.*214 bytes.*213/)
    })

    test('fixed patterns: finders, separators, timing and dark module', () => {
        const { modules: m, size: n } = encodeQr('https://syntonize.onrender.com/join/K7PX2Q')
        for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
            for (let r = 0; r < 7; r++) {
                for (let c = 0; c < 7; c++) {
                    const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3))
                    assert.equal(m[r0 + r][c0 + c], ring !== 2, `finder at ${r0},${c0} (${r},${c})`)
                }
            }
        }
        for (let i = 0; i < 8; i++) {
            assert.equal(m[7][i], false); assert.equal(m[i][7], false) // top-left separator
            assert.equal(m[7][n - 1 - i], false); assert.equal(m[n - 8][i], false)
        }
        for (let i = 8; i < n - 8; i++) {
            assert.equal(m[6][i], i % 2 === 0, `horizontal timing ${i}`)
            assert.equal(m[i][6], i % 2 === 0, `vertical timing ${i}`)
        }
        assert.equal(m[n - 8][8], true)
    })

    test('alignment pattern on version 3 sits at (22, 22)', () => {
        const { modules: m, version } = encodeQr('https://syntonize.onrender.com/join/K7PX2Q')
        assert.equal(version, 3)
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
            assert.equal(m[22 + dr][22 + dc], Math.max(Math.abs(dr), Math.abs(dc)) !== 1)
        }
    })

    test('version info blocks are drawn on version 7+', () => {
        const { modules: m, size: n, version } = encodeQr('x'.repeat(byteCapacity(6) + 1))
        assert.equal(version, 7)
        const expected = VERSION_INFO[7]
        for (let i = 0; i < 18; i++) {
            const dark = expected[17 - i] === '1'
            const a = n - 11 + (i % 3)
            const b = Math.floor(i / 3)
            assert.equal(m[b][a], dark, `top-right ${i}`)
            assert.equal(m[a][b], dark, `bottom-left ${i}`)
        }
    })

    test('known matrix for "01234567" (1-M, mask 2)', () => {
        // Generated by this encoder and cross-checked with the independent decoder below;
        // the format row/column read 101111001111100 (level M, mask 2).
        const expected = [
            '#######.......#######',
            '#.....#..#.##.#.....#',
            '#.###.#.#.#.#.#.###.#',
            '#.###.#.#.....#.###.#',
            '#.###.#.#.###.#.###.#',
            '#.....#.#...#.#.....#',
            '#######.#.#.#.#######',
            '........#####........',
            '#.#####...#.#.#####..',
            '##..#..#..#.##..#.###',
            '.#.#.###.###.###.##..',
            '.#.##....##....##.#..',
            '.#.#####...#.....#...',
            '........#..####.#.###',
            '#######...#.#.##.....',
            '#.....#.#..####...#..',
            '#.###.#.#...#....#..#',
            '#.###.#.##..#...#.#..',
            '#.###.#.####.#.#.#...',
            '#.....#...#....#..#..',
            '#######.####.#...#.#.',
        ]
        const { modules, version, mask } = encodeQr('01234567', { mask: 2 })
        assert.equal(version, 1)
        assert.equal(mask, 2)
        const rows = modules.map(row => row.map(d => (d ? '#' : '.')).join(''))
        assert.deepEqual(rows, expected)
        assert.equal(decode(modules).text, '01234567')
    })
})

describe('qrcode: round trip through an independent decoder', () => {
    const samples = [
        '01234567',
        'HELLO WORLD',
        'https://syntonize.onrender.com/join/K7PX2Q',
        'Sintonia: ação, coração, pão de queijo 🎯',
        'x'.repeat(byteCapacity(7)),
        'y'.repeat(byteCapacity(8)),
        'z'.repeat(byteCapacity(9)),
        'w'.repeat(213),
    ]
    for (const text of samples) {
        test(`decodes ${text.length > 30 ? `${text.length} chars` : JSON.stringify(text)}`, () => {
            const qr = encodeQr(text)
            const out = decode(qr.modules)
            assert.equal(out.text, text)
            assert.equal(out.version, qr.version)
            assert.equal(out.mask, qr.mask)
        })
    }

    test('every mask decodes', () => {
        for (let mask = 0; mask < 8; mask++) {
            assert.equal(decode(encodeQr('https://syntonize.onrender.com/join/ABCDEF', { mask }).modules).text, 'https://syntonize.onrender.com/join/ABCDEF')
        }
    })
})

describe('qrcode: svg path', () => {
    test('one rectangle per horizontal run, offset by the margin', () => {
        assert.equal(qrToSvgPath([[true, true, false, true], [false, false, false, false], [false, true, true, true]], 4),
            'M4 4h2v1h-2zM7 4h1v1h-1zM5 6h3v1h-3z')
    })

    test('covers exactly the dark modules', () => {
        const { modules } = encodeQr('https://syntonize.onrender.com/join/K7PX2Q')
        const path = qrToSvgPath(modules)
        const area = [...path.matchAll(/h(\d+)v1/g)].reduce((sum, m) => sum + Number(m[1]), 0)
        assert.equal(area, modules.flat().filter(Boolean).length)
    })
})
