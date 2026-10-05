import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import net from 'node:net'

import { RespParser, RespError, encodeCommand, parseRedisUrl, RedisClient, RedisStore } from '../server/redisStore.ts'
import { SNAPSHOT_VERSION, type RoomSnapshot } from '../server/roomStore.ts'
import { createPlayer, createRoom } from '../shared/gameLogic.ts'
import { RoomManager } from '../server/roomManager.ts'
import { FakeClock, RecordingTransport, fixedRng } from './helpers.ts'

const parse = (...chunks: string[]) => {
    const parser = new RespParser()
    return chunks.flatMap(c => parser.push(Buffer.from(c, 'utf8')))
}

describe('redis: RESP parser', () => {
    test('simple strings, integers and errors', () => {
        const [ok, n, err] = parse('+OK\r\n:42\r\n-ERR wrong number of arguments\r\n')
        assert.equal(ok, 'OK')
        assert.equal(n, 42)
        assert.ok(err instanceof RespError)
        assert.equal((err as RespError).message, 'ERR wrong number of arguments')
    })

    test('bulk strings, including empty and null', () => {
        assert.deepEqual(parse('$5\r\nhello\r\n$0\r\n\r\n$-1\r\n'), ['hello', '', null])
    })

    test('bulk length counts bytes, not characters', () => {
        const value = 'Joã🔥'
        const bytes = Buffer.byteLength(value)
        assert.deepEqual(parse(`$${bytes}\r\n${value}\r\n`), [value])
    })

    test('a bulk string may contain CRLF', () => {
        assert.deepEqual(parse('$4\r\na\r\nb\r\n'), ['a\r\nb'])
    })

    test('nested arrays and null arrays (SCAN reply)', () => {
        const [scan, empty, nil] = parse('*2\r\n$1\r\n0\r\n*2\r\n$3\r\nk:1\r\n$3\r\nk:2\r\n*0\r\n*-1\r\n')
        assert.deepEqual(scan, ['0', ['k:1', 'k:2']])
        assert.deepEqual(empty, [])
        assert.equal(nil, null)
    })

    test('replies split at any byte boundary', () => {
        const wire = '+OK\r\n*2\r\n$6\r\nhéllo\r\n:7\r\n$-1\r\n-ERR x\r\n'
        const bytes = Buffer.from(wire, 'utf8')
        const expected = parse(wire)
        for (let size = 1; size <= 4; size++) {
            const parser = new RespParser()
            const got = []
            for (let i = 0; i < bytes.length; i += size) got.push(...parser.push(bytes.subarray(i, i + size)))
            assert.deepEqual(got, expected, `chunks of ${size}`)
        }
        // Split in the middle of a multi-byte character.
        const parser = new RespParser()
        const split = bytes.indexOf(Buffer.from('é')) + 1
        assert.deepEqual([...parser.push(bytes.subarray(0, split)), ...parser.push(bytes.subarray(split))], expected)
    })

    test('an unknown reply type throws', () => {
        assert.throws(() => parse('?huh\r\n'))
    })

    test('commands are encoded as arrays of bulk strings', () => {
        assert.equal(encodeCommand(['SET', 'k', 'ã', 'EX', 60]).toString('utf8'), '*5\r\n$3\r\nSET\r\n$1\r\nk\r\n$2\r\nã\r\n$2\r\nEX\r\n$2\r\n60\r\n')
    })

    test('REDIS_URL parsing', () => {
        assert.deepEqual(parseRedisUrl('redis://red-abc:6379'), { host: 'red-abc', port: 6379, tls: false, username: undefined, password: undefined, db: undefined })
        assert.deepEqual(parseRedisUrl('rediss://default:p%40ss@kv.example.com:6380/2'), { host: 'kv.example.com', port: 6380, tls: true, username: 'default', password: 'p@ss', db: 2 })
        assert.equal(parseRedisUrl('redis://localhost').port, 6379)
        assert.throws(() => parseRedisUrl('http://localhost'))
    })
})

// ---------- against a real redis-server, when installed ----------

const hasRedis = spawnSync('redis-server', ['--version']).status === 0

async function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const srv = net.createServer()
        srv.listen(0, '127.0.0.1', () => {
            const port = (srv.address() as net.AddressInfo).port
            srv.close(() => resolve(port))
        })
        srv.on('error', reject)
    })
}

async function waitForPort(port: number): Promise<void> {
    for (let i = 0; i < 100; i++) {
        const ok = await new Promise<boolean>(resolve => {
            const s = net.connect(port, '127.0.0.1', () => { s.destroy(); resolve(true) })
            s.on('error', () => resolve(false))
        })
        if (ok) return
        await new Promise(r => setTimeout(r, 50))
    }
    throw new Error('redis-server did not start')
}

function snapshotFor(code: string, nickname: string): RoomSnapshot {
    const room = createRoom(code, createPlayer('p_1', nickname, 0, true), 1_000)
    return { version: SNAPSHOT_VERSION, savedAt: 1_000, room, sessions: [{ token: 's_1', playerId: 'p_1' }], timer: { phase: 'guess', endsAt: 5_000 } }
}

describe('redis: RedisStore against redis-server', { skip: !hasRedis && 'redis-server não instalado' }, () => {
    let server: ChildProcess
    let port: number

    before(async () => {
        port = await freePort()
        server = spawn('redis-server', ['--port', String(port), '--bind', '127.0.0.1', '--save', '', '--appendonly', 'no', '--requirepass', 'segredo'], { stdio: 'ignore' })
        await waitForPort(port)
    })

    after(() => {
        server?.kill()
    })

    test('save, loadAll, TTL and delete', async () => {
        const store = RedisStore.fromUrl(`redis://:segredo@127.0.0.1:${port}/1`, { ttlMs: 60_000, prefix: 'test:room:' })
        try {
            // Lots of rooms so SCAN needs more than one page.
            const codes = Array.from({ length: 300 }, (_, i) => `R${String(i).padStart(5, '0')}`)
            await Promise.all(codes.map(code => store.save(snapshotFor(code, 'João 🔥'))))
            await store.save(snapshotFor(codes[0], 'Ana'))

            const loaded = await store.loadAll()
            assert.equal(loaded.length, codes.length)
            const first = loaded.find(s => s.room.code === codes[0])!
            assert.equal(first.room.players[0].nickname, 'Ana', 'the last save wins')
            assert.equal(loaded.find(s => s.room.code === codes[1])!.room.players[0].nickname, 'João 🔥')
            assert.deepEqual(first.timer, { phase: 'guess', endsAt: 5_000 })

            const raw = new RedisClient(parseRedisUrl(`redis://:segredo@127.0.0.1:${port}/1`))
            const ttl = await raw.command(['TTL', `test:room:${codes[0]}`])
            assert.ok(typeof ttl === 'number' && ttl > 50 && ttl <= 60, `ttl ${ttl}`)
            // Garbage under the prefix is ignored, not fatal.
            await raw.command(['SET', 'test:room:LIXO', '{not json'])
            assert.equal((await store.loadAll()).length, codes.length)
            await raw.close()

            await Promise.all(codes.map(code => store.delete(code)))
            assert.equal((await store.loadAll()).length, 0)
        } finally {
            await store.close()
        }
    })

    test('wrong password fails with the server error', async () => {
        const client = new RedisClient(parseRedisUrl(`redis://:errada@127.0.0.1:${port}`))
        await assert.rejects(client.command(['PING']), /WRONGPASS|invalid/i)
        await client.close()
    })

    test('the client reconnects after the connection drops', async () => {
        const url = parseRedisUrl(`redis://:segredo@127.0.0.1:${port}`)
        const client = new RedisClient(url)
        const killer = new RedisClient(url)
        const id = await client.command(['CLIENT', 'ID'])
        assert.equal(await killer.command(['CLIENT', 'KILL', 'ID', id as number]), 1)
        await new Promise(r => setTimeout(r, 50))
        assert.equal(await client.command(['PING']), 'PONG')
        assert.notEqual(await client.command(['CLIENT', 'ID']), id, 'a new connection')
        await client.close()
        await killer.close()
    })

    test('a RoomManager restarted on the same Redis gets its rooms and sessions back', async () => {
        const url = `redis://:segredo@127.0.0.1:${port}/3`
        const clock = new FakeClock(Date.now())
        const firstStore = RedisStore.fromUrl(url)
        const first = new RoomManager(new RecordingTransport(), { clock, rng: fixedRng, store: firstStore })
        const created = first.createRoom('Ana')
        const code = created.data!.room.code
        const joined = first.joinRoom(code, 'Bia')
        first.startGame(created.data!.playerId)
        await first.flush()
        await firstStore.close()

        const store = RedisStore.fromUrl(url)
        const second = new RoomManager(new RecordingTransport(), { clock, rng: fixedRng, store })
        assert.equal(await second.loadFromStore(), 1)
        const restored = second.restoreSession(joined.data!.sessionToken)
        assert.equal(restored?.playerId, joined.data!.playerId)
        assert.equal(restored?.room.status, 'playing')
        assert.equal(restored?.room.currentRound?.targetPosition, 50)

        second.leaveRoom(joined.data!.playerId)
        second.leaveRoom(created.data!.playerId)
        await second.flush()
        assert.equal((await store.loadAll()).length, 0)
        await store.close()
        first.destroy()
        second.destroy()
    })
})
