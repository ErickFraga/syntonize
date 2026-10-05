/**
 * Minimal QR code generator (ISO/IEC 18004), no dependencies.
 *
 * Byte mode (UTF-8), error correction level M, versions 1 to 10 (up to 213 bytes),
 * which is plenty for an invite link. Picks the smallest version that fits and the
 * mask with the lowest penalty score.
 */

export interface QrCode {
    /** Modules per side: 21 + 4 * (version - 1). */
    size: number
    /** modules[y][x], true = dark. No quiet zone included. */
    modules: boolean[][]
    version: number
    mask: number
}

export const QR_MIN_VERSION = 1
export const QR_MAX_VERSION = 10

/** Level M, per version: EC codewords per block and the block groups [count, data codewords]. */
const EC_BLOCKS: Record<number, { ec: number; groups: Array<[number, number]> }> = {
    1: { ec: 10, groups: [[1, 16]] },
    2: { ec: 16, groups: [[1, 28]] },
    3: { ec: 26, groups: [[1, 44]] },
    4: { ec: 18, groups: [[2, 32]] },
    5: { ec: 24, groups: [[2, 43]] },
    6: { ec: 16, groups: [[4, 27]] },
    7: { ec: 18, groups: [[4, 31]] },
    8: { ec: 22, groups: [[2, 38], [2, 39]] },
    9: { ec: 22, groups: [[3, 36], [2, 37]] },
    10: { ec: 26, groups: [[4, 43], [1, 44]] },
}

const ALIGNMENT: Record<number, number[]> = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
}

/** Format bits for level M are 00. */
const EC_LEVEL_M = 0b00

export const sizeForVersion = (version: number) => 21 + 4 * (version - 1)

export function dataCapacity(version: number): number {
    return EC_BLOCKS[version].groups.reduce((sum, [count, len]) => sum + count * len, 0)
}

/** Max bytes of payload in byte mode for a version (header = 4-bit mode + 8/16-bit count). */
export function byteCapacity(version: number): number {
    const headerBits = 4 + (version <= 9 ? 8 : 16)
    return Math.floor((dataCapacity(version) * 8 - headerBits) / 8)
}

// ---------- GF(256) and Reed-Solomon ----------

const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)
{
    let x = 1
    for (let i = 0; i < 255; i++) {
        EXP[i] = x
        LOG[x] = i
        x <<= 1
        if (x & 0x100) x ^= 0x11d
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
}

export function gfMul(a: number, b: number): number {
    return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]
}

/** Generator polynomial (x - α^0)(x - α^1)…(x - α^(degree-1)), highest power first. */
function generator(degree: number): number[] {
    let poly = [1]
    for (let i = 0; i < degree; i++) {
        const next = new Array(poly.length + 1).fill(0)
        for (let j = 0; j < poly.length; j++) {
            next[j] ^= poly[j]
            next[j + 1] ^= gfMul(poly[j], EXP[i])
        }
        poly = next
    }
    return poly
}

/** Error correction codewords for one block of data codewords. */
export function reedSolomon(data: number[], ecLength: number): number[] {
    const gen = generator(ecLength)
    const rem = [...data, ...new Array(ecLength).fill(0)]
    for (let i = 0; i < data.length; i++) {
        const coef = rem[i]
        if (coef === 0) continue
        for (let j = 1; j < gen.length; j++) rem[i + j] ^= gfMul(gen[j], coef)
    }
    return rem.slice(data.length)
}

// ---------- Data encoding ----------

function encodeData(bytes: Uint8Array, version: number): number[] {
    const capacity = dataCapacity(version)
    const bits: number[] = []
    const push = (value: number, length: number) => {
        for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1)
    }
    push(0b0100, 4)
    push(bytes.length, version <= 9 ? 8 : 16)
    for (let i = 0; i < bytes.length; i++) push(bytes[i], 8)
    push(0, Math.min(4, capacity * 8 - bits.length))
    while (bits.length % 8) bits.push(0)

    const codewords: number[] = []
    for (let i = 0; i < bits.length; i += 8) {
        codewords.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0))
    }
    for (let pad = 0xec; codewords.length < capacity; pad ^= 0xec ^ 0x11) codewords.push(pad)
    return codewords
}

/** Splits into blocks, adds EC to each one and interleaves (data first, then EC). */
export function interleave(data: number[], version: number): number[] {
    const { ec, groups } = EC_BLOCKS[version]
    const dataBlocks: number[][] = []
    let offset = 0
    for (const [count, len] of groups) {
        for (let i = 0; i < count; i++) {
            dataBlocks.push(data.slice(offset, offset + len))
            offset += len
        }
    }
    const ecBlocks = dataBlocks.map(block => reedSolomon(block, ec))
    const out: number[] = []
    const maxLen = Math.max(...dataBlocks.map(b => b.length))
    for (let i = 0; i < maxLen; i++) for (const block of dataBlocks) if (i < block.length) out.push(block[i])
    for (let i = 0; i < ec; i++) for (const block of ecBlocks) out.push(block[i])
    return out
}

// ---------- BCH codes for format and version info ----------

/** 15-bit format info for level M and a mask (BCH(15,5), masked with 0x5412). */
export function formatBits(mask: number): number {
    const data = (EC_LEVEL_M << 3) | mask
    let rem = data
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    return ((data << 10) | rem) ^ 0x5412
}

/** 18-bit version info (BCH(18,6)), only drawn for versions >= 7. */
export function versionBits(version: number): number {
    let rem = version
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    return (version << 12) | rem
}

// ---------- Matrix ----------

const MASKS: Array<(x: number, y: number) => boolean> = [
    (x, y) => (x + y) % 2 === 0,
    (_x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

class Matrix {
    readonly modules: boolean[][]
    readonly reserved: boolean[][]
    readonly size: number

    constructor(size: number) {
        this.size = size
        this.modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
        this.reserved = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
    }

    set(x: number, y: number, dark: boolean) {
        this.modules[y][x] = dark
        this.reserved[y][x] = true
    }
}

function drawFunctionPatterns(m: Matrix, version: number) {
    const size = m.size
    for (let i = 0; i < size; i++) {
        m.set(6, i, i % 2 === 0)
        m.set(i, 6, i % 2 === 0)
    }
    // Finders with their separators.
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
        for (let dy = -4; dy <= 4; dy++) {
            for (let dx = -4; dx <= 4; dx++) {
                const x = cx + dx
                const y = cy + dy
                if (x < 0 || y < 0 || x >= size || y >= size) continue
                const dist = Math.max(Math.abs(dx), Math.abs(dy))
                m.set(x, y, dist !== 2 && dist !== 4)
            }
        }
    }
    const align = ALIGNMENT[version]
    const last = align.length - 1
    for (let i = 0; i <= last; i++) {
        for (let j = 0; j <= last; j++) {
            if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue
            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    m.set(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
                }
            }
        }
    }
    drawFormat(m, 0) // reserves the area; redrawn with the chosen mask
    if (version >= 7) {
        const bits = versionBits(version)
        for (let i = 0; i < 18; i++) {
            const dark = ((bits >>> i) & 1) === 1
            const a = size - 11 + (i % 3)
            const b = Math.floor(i / 3)
            m.set(a, b, dark)
            m.set(b, a, dark)
        }
    }
}

function drawFormat(m: Matrix, mask: number) {
    const size = m.size
    const bits = formatBits(mask)
    const bit = (i: number) => ((bits >>> i) & 1) === 1
    // Around the top-left finder.
    for (let i = 0; i <= 5; i++) m.set(8, i, bit(i))
    m.set(8, 7, bit(6))
    m.set(8, 8, bit(7))
    m.set(7, 8, bit(8))
    for (let i = 9; i < 15; i++) m.set(14 - i, 8, bit(i))
    // Split between the other two finders.
    for (let i = 0; i < 8; i++) m.set(size - 1 - i, 8, bit(i))
    for (let i = 8; i < 15; i++) m.set(8, size - 15 + i, bit(i))
    m.set(8, size - 8, true) // dark module
}

/** Places codewords in the two-column zigzag, skipping function modules. */
function drawCodewords(m: Matrix, codewords: number[]) {
    const size = m.size
    let i = 0
    for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5
        const upward = ((right + 1) & 2) === 0
        for (let vert = 0; vert < size; vert++) {
            const y = upward ? size - 1 - vert : vert
            for (let j = 0; j < 2; j++) {
                const x = right - j
                if (m.reserved[y][x]) continue
                // Remainder bits (past the last codeword) stay light.
                m.modules[y][x] = i < codewords.length * 8 && ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1
                i++
            }
        }
    }
}

function applyMask(m: Matrix, mask: number) {
    const fn = MASKS[mask]
    for (let y = 0; y < m.size; y++) {
        for (let x = 0; x < m.size; x++) {
            if (!m.reserved[y][x] && fn(x, y)) m.modules[y][x] = !m.modules[y][x]
        }
    }
}

const FINDER_LIKE = [
    [true, false, true, true, true, false, true, false, false, false, false],
    [false, false, false, false, true, false, true, true, true, false, true],
]

/** Penalty score from the four rules of the standard (lower is better). */
export function penalty(modules: boolean[][]): number {
    const size = modules.length
    const at = (x: number, y: number, vertical: boolean) => (vertical ? modules[x][y] : modules[y][x])
    let score = 0

    for (const vertical of [false, true]) {
        for (let y = 0; y < size; y++) {
            // Rule 1: runs of 5+ same-colored modules.
            let run = 1
            for (let x = 1; x <= size; x++) {
                if (x < size && at(x, y, vertical) === at(x - 1, y, vertical)) {
                    run++
                } else {
                    if (run >= 5) score += 3 + (run - 5)
                    run = 1
                }
            }
            // Rule 3: 1:1:3:1:1 finder-like pattern with 4 light modules on one side.
            for (let x = 0; x + 11 <= size; x++) {
                for (const pattern of FINDER_LIKE) {
                    if (pattern.every((dark, k) => at(x + k, y, vertical) === dark)) score += 40
                }
            }
        }
    }

    // Rule 2: 2x2 blocks of the same color.
    for (let y = 0; y < size - 1; y++) {
        for (let x = 0; x < size - 1; x++) {
            const c = modules[y][x]
            if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3
        }
    }

    // Rule 4: balance of dark modules, 10 points per 5% away from 50%.
    let dark = 0
    for (const row of modules) for (const cell of row) if (cell) dark++
    const total = size * size
    score += 10 * (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1)
    return score
}

export interface EncodeOptions {
    /** Forces a mask (0–7) instead of picking the lowest penalty. */
    mask?: number
}

export function encodeQr(text: string, options: EncodeOptions = {}): QrCode {
    const bytes = new TextEncoder().encode(text)
    let version = QR_MIN_VERSION
    while (version <= QR_MAX_VERSION && bytes.length > byteCapacity(version)) version++
    if (version > QR_MAX_VERSION) {
        throw new RangeError(`Texto grande demais para o QR code: ${bytes.length} bytes (máximo ${byteCapacity(QR_MAX_VERSION)}).`)
    }

    const codewords = interleave(encodeData(bytes, version), version)
    const size = sizeForVersion(version)

    const build = (mask: number) => {
        const m = new Matrix(size)
        drawFunctionPatterns(m, version)
        drawCodewords(m, codewords)
        applyMask(m, mask)
        drawFormat(m, mask)
        return m.modules
    }

    if (options.mask !== undefined) {
        if (!Number.isInteger(options.mask) || options.mask < 0 || options.mask > 7) throw new RangeError('Máscara deve ser de 0 a 7.')
        return { size, modules: build(options.mask), version, mask: options.mask }
    }

    let best: QrCode | null = null
    let bestScore = Infinity
    for (let mask = 0; mask < 8; mask++) {
        const modules = build(mask)
        const score = penalty(modules)
        if (score < bestScore) {
            bestScore = score
            best = { size, modules, version, mask }
        }
    }
    return best!
}

/**
 * One SVG path for all dark modules: horizontal runs become `M x y h w v1 h-w z`.
 * Use with `viewBox="0 0 size size"` (offset by `margin` for a quiet zone).
 */
export function qrToSvgPath(modules: boolean[][], margin = 0): string {
    const parts: string[] = []
    modules.forEach((row, y) => {
        let x = 0
        while (x < row.length) {
            if (!row[x]) {
                x++
                continue
            }
            const start = x
            while (x < row.length && row[x]) x++
            parts.push(`M${start + margin} ${y + margin}h${x - start}v1h-${x - start}z`)
        }
    })
    return parts.join('')
}
