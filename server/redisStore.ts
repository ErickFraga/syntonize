// Durable RoomStore on Redis (or any RESP-compatible Key Value, like Render's)
// with a minimal RESP2 client over node:net / node:tls, so no npm dependency.
// It only speaks what the store needs: AUTH, SELECT, GET, SET .. EX, DEL, SCAN.

import net from 'node:net'
import tls from 'node:tls'

import { DEFAULT_ROOM_TTL_MS, decodeSnapshot, encodeSnapshot, type RoomSnapshot, type RoomStore } from './roomStore.ts'

// ============================================
// RESP PARSER
// ============================================

/** An error reply (`-ERR ...`): a value, not a thrown error, so arrays can hold it. */
export class RespError extends Error {}

export type RespValue = string | number | null | RespError | RespValue[]

const CRLF = Buffer.from('\r\n')

/** Marks a reply that has not fully arrived yet. */
const INCOMPLETE = Symbol('incomplete')
type Parsed = { value: RespValue; next: number } | typeof INCOMPLETE

/**
 * Incremental RESP2 parser: feed it socket chunks in any fragmentation and it
 * returns the replies completed so far. Bulk strings are decoded as UTF-8
 * after slicing by byte length (nicknames and chat carry multi-byte text).
 */
export class RespParser {
    private buffer: Buffer = Buffer.alloc(0)

    push(chunk: Buffer): RespValue[] {
        this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk])
        const replies: RespValue[] = []
        let offset = 0
        for (;;) {
            const parsed = this.parse(offset)
            if (parsed === INCOMPLETE) break
            replies.push(parsed.value)
            offset = parsed.next
        }
        this.buffer = offset >= this.buffer.length ? Buffer.alloc(0) : this.buffer.subarray(offset)
        return replies
    }

    private parse(offset: number): Parsed {
        if (offset >= this.buffer.length) return INCOMPLETE
        const lineEnd = this.buffer.indexOf(CRLF, offset)
        if (lineEnd === -1) return INCOMPLETE
        const type = String.fromCharCode(this.buffer[offset])
        const line = this.buffer.toString('utf8', offset + 1, lineEnd)
        const afterLine = lineEnd + 2

        switch (type) {
            case '+':
                return { value: line, next: afterLine }
            case '-':
                return { value: new RespError(line), next: afterLine }
            case ':':
                return { value: Number(line), next: afterLine }
            case '$': {
                const length = Number(line)
                if (length < 0) return { value: null, next: afterLine }
                const end = afterLine + length
                if (this.buffer.length < end + 2) return INCOMPLETE
                return { value: this.buffer.toString('utf8', afterLine, end), next: end + 2 }
            }
            case '*': {
                const count = Number(line)
                if (count < 0) return { value: null, next: afterLine }
                const items: RespValue[] = []
                let next = afterLine
                for (let i = 0; i < count; i++) {
                    const item = this.parse(next)
                    if (item === INCOMPLETE) return INCOMPLETE
                    items.push(item.value)
                    next = item.next
                }
                return { value: items, next }
            }
            default:
                throw new Error(`RESP: tipo de resposta desconhecido "${type}"`)
        }
    }
}

/** Encodes a command as a RESP array of bulk strings. */
export function encodeCommand(args: (string | number)[]): Buffer {
    const parts: Buffer[] = [Buffer.from(`*${args.length}\r\n`)]
    for (const arg of args) {
        const value = Buffer.from(String(arg), 'utf8')
        parts.push(Buffer.from(`$${value.length}\r\n`), value, CRLF)
    }
    return Buffer.concat(parts)
}

// ============================================
// CLIENT
// ============================================

export interface RedisConfig {
    host: string
    port: number
    tls: boolean
    username?: string
    password?: string
    db?: number
}

/** `redis://[user:pass@]host[:port][/db]`, or `rediss://` for TLS. */
export function parseRedisUrl(raw: string): RedisConfig {
    const url = new URL(raw)
    if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
        throw new Error(`REDIS_URL precisa começar com redis:// ou rediss:// (veio ${url.protocol})`)
    }
    const db = url.pathname.replace(/^\//, '')
    return {
        host: url.hostname,
        port: url.port ? Number(url.port) : 6379,
        tls: url.protocol === 'rediss:',
        username: url.username ? decodeURIComponent(url.username) : undefined,
        password: url.password ? decodeURIComponent(url.password) : undefined,
        db: db ? Number(db) : undefined,
    }
}

interface Pending {
    resolve: (value: RespValue) => void
    reject: (error: Error) => void
}

/**
 * One connection, commands pipelined in call order (Redis answers in order,
 * so writes to the same key never reorder). Connects lazily and reconnects on
 * the next command after the connection drops; commands in flight when it
 * drops fail and the caller decides whether to retry.
 */
export class RedisClient {
    private config: RedisConfig
    private connectTimeoutMs: number
    private socket: net.Socket | null = null
    private ready: Promise<void> | null = null
    private pending: Pending[] = []
    private parser = new RespParser()
    private closed = false

    constructor(config: RedisConfig, options: { connectTimeoutMs?: number } = {}) {
        this.config = config
        this.connectTimeoutMs = options.connectTimeoutMs ?? 10_000
    }

    async command(args: (string | number)[]): Promise<RespValue> {
        await this.connect()
        return this.send(args)
    }

    async close(): Promise<void> {
        this.closed = true
        const socket = this.socket
        if (!socket) return
        try {
            await this.send(['QUIT'])
        } catch {
            /* already gone */
        }
        socket.destroy()
    }

    private send(args: (string | number)[]): Promise<RespValue> {
        const socket = this.socket
        if (!socket) return Promise.reject(new Error('Redis: sem conexão'))
        return new Promise((resolve, reject) => {
            this.pending.push({ resolve, reject })
            socket.write(encodeCommand(args))
        }).then(reply => {
            if (reply instanceof RespError) throw reply
            return reply as RespValue
        })
    }

    private connect(): Promise<void> {
        if (this.closed) return Promise.reject(new Error('Redis: cliente fechado'))
        if (this.ready) return this.ready
        this.ready = new Promise<void>((resolve, reject) => {
            const { host, port } = this.config
            const socket = this.config.tls
                ? tls.connect({ host, port, servername: host })
                : net.connect({ host, port })
            const readyEvent = this.config.tls ? 'secureConnect' : 'connect'
            this.parser = new RespParser()

            const timeout = setTimeout(() => socket.destroy(new Error('Redis: tempo de conexão esgotado')), this.connectTimeoutMs)
            timeout.unref()

            socket.setNoDelay(true)
            socket.setKeepAlive(true, 30_000)
            socket.on('data', (chunk: Buffer) => this.onData(chunk))
            socket.once('close', () => this.onClose(socket))
            socket.on('error', error => {
                clearTimeout(timeout)
                reject(error)
                this.failPending(error)
            })
            socket.once(readyEvent, () => {
                clearTimeout(timeout)
                this.socket = socket
                this.handshake().then(resolve, error => {
                    reject(error)
                    socket.destroy()
                })
            })
        })
        // A failed attempt must not stick: the next command tries again.
        this.ready.catch(() => {
            this.ready = null
        })
        return this.ready
    }

    private async handshake(): Promise<void> {
        const { username, password, db } = this.config
        if (password) {
            await this.send(username && username !== 'default' ? ['AUTH', username, password] : ['AUTH', password])
        }
        if (db) await this.send(['SELECT', db])
    }

    private onData(chunk: Buffer): void {
        let replies: RespValue[]
        try {
            replies = this.parser.push(chunk)
        } catch (error) {
            this.socket?.destroy(error as Error)
            return
        }
        for (const reply of replies) this.pending.shift()?.resolve(reply)
    }

    private onClose(socket: net.Socket): void {
        if (this.socket === socket) this.socket = null
        this.ready = null
        this.failPending(new Error('Redis: conexão encerrada'))
    }

    private failPending(error: Error): void {
        const pending = this.pending
        this.pending = []
        for (const p of pending) p.reject(error)
    }
}

// ============================================
// STORE
// ============================================

export class RedisStore implements RoomStore {
    readonly name = 'redis'
    private client: RedisClient
    private ttlSeconds: number
    private prefix: string

    constructor(client: RedisClient, options: { ttlMs?: number; prefix?: string } = {}) {
        this.client = client
        this.ttlSeconds = Math.max(1, Math.round((options.ttlMs ?? DEFAULT_ROOM_TTL_MS) / 1000))
        this.prefix = options.prefix ?? 'syntonize:room:'
    }

    static fromUrl(url: string, options: { ttlMs?: number; prefix?: string } = {}): RedisStore {
        return new RedisStore(new RedisClient(parseRedisUrl(url)), options)
    }

    async save(snapshot: RoomSnapshot): Promise<void> {
        await this.client.command(['SET', this.prefix + snapshot.room.code, encodeSnapshot(snapshot), 'EX', this.ttlSeconds])
    }

    async delete(code: string): Promise<void> {
        await this.client.command(['DEL', this.prefix + code])
    }

    async load(code: string): Promise<RoomSnapshot | null> {
        const value = await this.client.command(['GET', this.prefix + code])
        return decodeSnapshot(typeof value === 'string' ? value : null)
    }

    async loadAll(): Promise<RoomSnapshot[]> {
        const keys = new Set<string>()
        let cursor = '0'
        do {
            const reply = await this.client.command(['SCAN', cursor, 'MATCH', `${this.prefix}*`, 'COUNT', 200])
            if (!Array.isArray(reply) || reply.length !== 2 || !Array.isArray(reply[1])) throw new Error('Redis: resposta inesperada do SCAN')
            cursor = String(reply[0])
            for (const key of reply[1]) if (typeof key === 'string') keys.add(key)
        } while (cursor !== '0')

        const values = await Promise.all(Array.from(keys, key => this.client.command(['GET', key])))
        const result: RoomSnapshot[] = []
        for (const value of values) {
            const snapshot = decodeSnapshot(typeof value === 'string' ? value : null)
            if (snapshot) result.push(snapshot)
        }
        return result
    }

    close(): Promise<void> {
        return this.client.close()
    }
}
