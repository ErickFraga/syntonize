'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useGameState } from '@/hooks/useGameState'
import { session } from '@/lib/socket'
import { LIMITS, type RoomInfo } from '@/types/game'
import Logo from '@/components/ui/Logo'
import Toasts from '@/components/ui/Toasts'
import { ArrowRightIcon, UsersIcon, CrownIcon } from '@/components/ui/Icons'
import styles from './page.module.css'

export default function JoinPage() {
    const params = useParams()
    const router = useRouter()
    const code = String(params.code ?? '').toUpperCase()

    const { joinRoom, getRoomInfo, isConnected, restoredCode, room, toasts, pushToast } = useGameState()

    const [nickname, setNickname] = useState('')
    const [info, setInfo] = useState<RoomInfo | null>(null)
    const [lookupError, setLookupError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        setNickname(session.getNickname() ?? '')
    }, [])

    // Already in a room (restored session or just joined): go there.
    useEffect(() => {
        const target = restoredCode ?? room?.code
        if (target) router.replace(`/room/${target}`)
    }, [restoredCode, room, router])

    useEffect(() => {
        if (!isConnected) return
        let cancelled = false
        getRoomInfo(code).then(result => {
            if (cancelled) return
            if (result.success && result.info) setInfo(result.info)
            else setLookupError(result.error ?? 'Sala não encontrada')
        })
        return () => {
            cancelled = true
        }
    }, [code, isConnected, getRoomInfo])

    const handleJoin = async (e: FormEvent) => {
        e.preventDefault()
        if (!nickname.trim()) return pushToast({ kind: 'warning', message: 'Escolhe um apelido primeiro' })
        setBusy(true)
        const result = await joinRoom(code, nickname.trim())
        setBusy(false)
        if (result.success) router.push(`/room/${code}`)
        else pushToast({ kind: 'error', message: result.error ?? 'Não deu para entrar na sala' })
    }

    if (lookupError) {
        return (
            <main className="page">
                <div className={`card ${styles.card} ${styles.errorCard} anim-pop`}>
                    <Logo size="sm" />
                    <h1>Essa sala não existe mais</h1>
                    <p className="muted">{lookupError}. Pode ser que a partida já tenha terminado ou o código esteja errado.</p>
                    <button className="btn btn-primary" onClick={() => router.push('/')}>Criar minha própria sala</button>
                </div>
            </main>
        )
    }

    return (
        <main className="page">
            <Toasts toasts={toasts} />
            <div className={`${styles.wrap} anim-fade-up`}>
                <Logo size="md" />

                <div className={`card-solid ${styles.card}`}>
                    <div className={styles.inviteHead}>
                        <span className="eyebrow">Você foi convidado</span>
                        <h1 className={styles.title}>
                            {info ? <>Sala de <span className="text-accent">{info.hostName}</span></> : 'Entrar na sala'}
                        </h1>
                        <div className={styles.meta}>
                            <span className="chip"><CrownIcon size={13} /> código {code}</span>
                            {info && (
                                <span className="chip"><UsersIcon size={13} /> {info.playerCount} na sala</span>
                            )}
                            {info?.status === 'playing' && <span className="chip chip-orange">partida rolando, entra no meio</span>}
                        </div>
                    </div>

                    <form className={styles.form} onSubmit={handleJoin}>
                        <div className="field">
                            <label htmlFor="nickname">Seu apelido</label>
                            <input
                                id="nickname"
                                className="input"
                                placeholder="Como a galera te chama?"
                                value={nickname}
                                maxLength={LIMITS.NICKNAME_MAX}
                                onChange={(e) => setNickname(e.target.value)}
                                autoFocus
                                autoComplete="nickname"
                            />
                        </div>
                        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={!isConnected || busy || !info}>
                            {busy || !isConnected ? <span className="spinner spinner-sm" /> : <ArrowRightIcon />}
                            {!isConnected ? 'Conectando…' : busy ? 'Entrando…' : 'Entrar na sala'}
                        </button>
                    </form>
                </div>

                <button className="btn btn-ghost" onClick={() => router.push('/')}>
                    Prefiro criar a minha própria sala
                </button>
            </div>
        </main>
    )
}
