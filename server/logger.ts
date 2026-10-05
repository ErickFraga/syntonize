// Minimal structured logger: one JSON object per line in production (what
// Render, Cloud Run and friends index as fields), readable text in dev.
// Level via LOG_LEVEL (debug|info|warn|error, default info), format via
// LOG_FORMAT (json|text, default json in production and text otherwise).

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogFields = Record<string, unknown>

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export interface LoggerOptions {
    level?: string
    format?: string
    base?: LogFields
    now?: () => Date
    write?: (line: string, level: LogLevel) => void
}

export interface Logger {
    debug(msg: string, fields?: LogFields): void
    info(msg: string, fields?: LogFields): void
    warn(msg: string, fields?: LogFields): void
    error(msg: string, fields?: LogFields): void
    child(fields: LogFields): Logger
}

/** Errors do not serialize to JSON; keep the useful parts. */
function normalize(value: unknown): unknown {
    if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack }
    return value
}

function defaultWrite(line: string, level: LogLevel) {
    const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout
    stream.write(line + '\n')
}

export function createLogger(options: LoggerOptions = {}): Logger {
    const min = ORDER[(options.level?.toLowerCase() as LogLevel)] ?? ORDER.info
    const json = (options.format ?? (process.env.NODE_ENV === 'production' ? 'json' : 'text')).toLowerCase() !== 'text'
    const now = options.now ?? (() => new Date())
    const write = options.write ?? defaultWrite

    const make = (base: LogFields): Logger => {
        const emit = (level: LogLevel, msg: string, fields?: LogFields) => {
            if (ORDER[level] < min) return
            const merged: LogFields = { ...base, ...fields }
            for (const key of Object.keys(merged)) merged[key] = normalize(merged[key])
            if (json) {
                write(JSON.stringify({ time: now().toISOString(), level, msg, ...merged }), level)
            } else {
                const extra = Object.keys(merged).length ? ' ' + JSON.stringify(merged) : ''
                write(`${level.toUpperCase().padEnd(5)} ${msg}${extra}`, level)
            }
        }
        return {
            debug: (m, f) => emit('debug', m, f),
            info: (m, f) => emit('info', m, f),
            warn: (m, f) => emit('warn', m, f),
            error: (m, f) => emit('error', m, f),
            child: fields => make({ ...base, ...fields }),
        }
    }
    return make(options.base ?? {})
}

export const logger = createLogger({
    level: process.env.LOG_LEVEL,
    format: process.env.LOG_FORMAT,
    base: { service: 'syntonize' },
})
