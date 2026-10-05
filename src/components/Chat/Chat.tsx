'use client'

import { useEffect, useRef, useState } from 'react'
import type { ChatMessage, ChatInput, SimpleResult } from '@/types/game'
import { CHAT_LIMITS, CHAT_REACTIONS } from '@/types/game'
import { playerColor } from '@/components/ui/Avatar'
import { XIcon } from '@/components/ui/Icons'
import { teamName } from '@/lib/teams'
import styles from './Chat.module.css'

interface ChatProps {
    messages: ChatMessage[]
    meId: string | null
    onSend: (input: ChatInput) => Promise<SimpleResult>
    /**
     * Docked in the game sidebar: inline panel on desktop, bottom sheet on
     * mobile. Not docked (lobby, results): floating button everywhere.
     */
    docked?: boolean
    /** Why text is off right now (the seer during their round), null when allowed. */
    textLocked?: string | null
    /** Starts open (used by the static preview). */
    defaultOpen?: boolean
}

/** Same breakpoint as the game layout, where the sidebar drops below the dial. */
const DESKTOP_QUERY = '(min-width: 961px)'

/** System messages arrive as codes; worded here (pt-BR until the i18n lands). */
export function systemText(message: Extract<ChatMessage, { kind: 'system' }>): string {
    const { code, params } = message
    switch (code) {
        case 'joined': return `${params.name} entrou na sala`
        case 'left': return `${params.name} saiu da sala`
        case 'kicked': return `${params.name} foi removido da sala`
        case 'round_revealed': return `Rodada ${params.round} revelada`
        case 'game_finished':
            if (typeof params.name === 'string') return `Fim de jogo! ${params.name} venceu`
            if (params.team === 0 || params.team === 1) return `Fim de jogo! ${teamName(params.team)} venceu`
            return 'Fim de jogo!'
    }
}

function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(false)
    useEffect(() => {
        const media = window.matchMedia(query)
        const update = () => setMatches(media.matches)
        update()
        media.addEventListener('change', update)
        return () => media.removeEventListener('change', update)
    }, [query])
    return matches
}

export default function Chat({ messages, meId, onSend, docked = false, textLocked = null, defaultOpen = false }: ChatProps) {
    const [open, setOpen] = useState(defaultOpen)
    const [draft, setDraft] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [sending, setSending] = useState(false)
    const [seenAt, setSeenAt] = useState(0)
    const listRef = useRef<HTMLDivElement>(null)
    const hadMessages = useRef(false)

    const isDesktop = useMediaQuery(DESKTOP_QUERY)
    const visible = open || (docked && isDesktop)
    const last = messages[messages.length - 1]

    // Everything is "seen" while the panel is on screen, and so is the
    // history that arrives on join (only new messages make the badge).
    useEffect(() => {
        if (!last) return
        if (visible || !hadMessages.current) setSeenAt(last.at)
        hadMessages.current = true
    }, [last, visible])

    const unread = visible ? 0 : messages.filter(m => m.at > seenAt && m.kind !== 'system' && m.authorId !== meId).length

    // Auto-scroll to the newest message, unless the user scrolled up to read.
    const nearBottom = useRef(true)
    useEffect(() => {
        const list = listRef.current
        if (!list || !visible) return
        if (nearBottom.current || (last && last.kind !== 'system' && last.authorId === meId)) list.scrollTop = list.scrollHeight
    }, [last, visible, meId])

    useEffect(() => {
        if (!error) return
        const id = window.setTimeout(() => setError(null), 3500)
        return () => window.clearTimeout(id)
    }, [error])

    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open])

    const send = async (input: ChatInput) => {
        if (sending) return
        setSending(true)
        const result = await onSend(input)
        setSending(false)
        if (!result.success) {
            setError(result.error ?? 'Não deu para enviar')
            return
        }
        setError(null)
        if (input.kind === 'text') setDraft('')
    }

    const submit = () => {
        const text = draft.replace(/\s+/g, ' ').trim()
        if (!text || textLocked) return
        void send({ kind: 'text', text })
    }

    const length = Array.from(draft).length

    return (
        <div className={`${styles.chat} ${docked ? styles.docked : styles.floating} ${open ? styles.open : ''}`}>
            <button
                type="button"
                className={styles.fab}
                onClick={() => setOpen(true)}
                aria-label={unread > 0 ? `Abrir chat (${unread} não lidas)` : 'Abrir chat'}
            >
                <ChatBubbleIcon />
                {unread > 0 && <span className={styles.badge}>{unread > 9 ? '9+' : unread}</span>}
            </button>

            <div className={styles.backdrop} onClick={() => setOpen(false)} aria-hidden="true" />

            <section className={`card ${styles.panel}`} aria-label="Chat da sala">
                <header className={styles.head}>
                    <span className={styles.title}><ChatBubbleIcon size={16} /> Chat</span>
                    <button type="button" className={`btn-icon ${styles.close}`} onClick={() => setOpen(false)} aria-label="Fechar chat">
                        <XIcon size={16} />
                    </button>
                </header>

                <div
                    className={styles.list}
                    ref={listRef}
                    onScroll={() => {
                        const el = listRef.current
                        if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
                    }}
                    role="log"
                    aria-live="polite"
                >
                    {messages.length === 0 && <p className={styles.empty}>Ninguém falou nada ainda. Manda um 🔥!</p>}
                    {messages.map(m => {
                        if (m.kind === 'system') {
                            return <p key={m.id} className={styles.system}>{systemText(m)}</p>
                        }
                        const mine = m.authorId === meId
                        return (
                            <p key={m.id} className={`${styles.message} ${mine ? styles.mine : ''} ${m.kind === 'reaction' ? styles.reaction : ''}`}>
                                <span className={styles.author} style={{ color: playerColor(m.colorIndex) }}>{mine ? 'você' : m.author}</span>
                                {m.kind === 'text' ? <span className={styles.text}>{m.text}</span> : <span className={styles.emoji}>{m.emoji}</span>}
                            </p>
                        )
                    })}
                </div>

                <div className={styles.reactions} role="group" aria-label="Reações rápidas">
                    {CHAT_REACTIONS.map(emoji => (
                        <button key={emoji} type="button" className={styles.reactionBtn} onClick={() => send({ kind: 'reaction', emoji })} disabled={sending} aria-label={`Reagir com ${emoji}`}>
                            {emoji}
                        </button>
                    ))}
                </div>

                <form
                    className={styles.form}
                    onSubmit={(e) => {
                        e.preventDefault()
                        submit()
                    }}
                >
                    <input
                        className={`input ${styles.input}`}
                        value={draft}
                        maxLength={CHAT_LIMITS.TEXT_MAX}
                        placeholder={textLocked ?? 'Mande uma mensagem…'}
                        disabled={!!textLocked}
                        onChange={(e) => {
                            setDraft(e.target.value)
                            setError(null)
                        }}
                        autoComplete="off"
                        aria-label="Mensagem"
                    />
                    <button type="submit" className="btn btn-primary btn-sm" disabled={!!textLocked || !draft.trim() || sending}>
                        Enviar
                    </button>
                </form>
                <div className={styles.meta}>
                    {error ? <span className={styles.error}>{error}</span> : <span />}
                    <span className={`${styles.counter} ${length > CHAT_LIMITS.TEXT_MAX - 20 ? styles.counterNear : ''}`}>{length}/{CHAT_LIMITS.TEXT_MAX}</span>
                </div>
            </section>
        </div>
    )
}

function ChatBubbleIcon({ size = 22 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
        </svg>
    )
}
