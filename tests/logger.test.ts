import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createLogger } from '../server/logger.ts'

function capture(options: Parameters<typeof createLogger>[0]) {
    const lines: string[] = []
    const logger = createLogger({ now: () => new Date('2026-01-02T03:04:05.000Z'), ...options, write: line => lines.push(line) })
    return { lines, logger }
}

test('json format writes one object per line with time, level and fields', () => {
    const { lines, logger } = capture({ format: 'json', base: { service: 'x' } })
    logger.info('room created', { room: 'ABC123' })
    assert.deepEqual(JSON.parse(lines[0]), {
        time: '2026-01-02T03:04:05.000Z',
        level: 'info',
        msg: 'room created',
        service: 'x',
        room: 'ABC123',
    })
})

test('level filters lower severities', () => {
    const { lines, logger } = capture({ format: 'json', level: 'warn' })
    logger.debug('a')
    logger.info('b')
    logger.warn('c')
    logger.error('d')
    assert.deepEqual(lines.map(l => JSON.parse(l).msg), ['c', 'd'])
})

test('child merges fields and errors keep message and stack', () => {
    const { lines, logger } = capture({ format: 'json' })
    logger.child({ scope: 'store' }).error('save failed', { err: new Error('boom') })
    const entry = JSON.parse(lines[0])
    assert.equal(entry.scope, 'store')
    assert.equal(entry.err.message, 'boom')
    assert.ok(entry.err.stack)
})

test('text format is human readable', () => {
    const { lines, logger } = capture({ format: 'text' })
    logger.info('ready', { port: 3000 })
    assert.equal(lines[0], 'INFO  ready {"port":3000}')
})
