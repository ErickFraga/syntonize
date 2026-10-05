'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useGameState } from '@/hooks/useGameState'
import { session } from '@/lib/socket'
import { LIMITS, type RoomInfo, type Message } from '@/types/game'
import Logo from '@/components/ui/Logo'
import Toasts from '@/components/ui/Toasts'
import LanguageSelect from '@/components/LanguageSelect/LanguageSelect'
import { useT } from '@/i18n/I18nProvider'
import { ArrowRightIcon, UsersIcon, CrownIcon } from '@/components/ui/Icons'
import styles from './page.module.css'

export default function JoinPage() {
    const params = useParams()
    const router = useRouter()
    const { t, rich, msg } = useT()
    const code = String(params.code ?? '').toUpperCase()

    const { joinRoom, getRoomInfo, isConnected, restoredCode, room, toasts, pushToast } = useGameState()

    const [nickname, setNickname] = useState('')
    const [info, setInfo] = useState<RoomInfo | null>(null)
    const [lookupError, setLookupError] = useState<Message | null>(null)
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
            else setLookupError(result.error ?? { code: 'room_not_found' })
        })
        return () => {
            cancelled = true
        }
    }, [code, isConnected, getRoomInfo])

    const handleJoin = async (e: FormEvent) => {
        e.preventDefault()
        if (!nickname.trim()) return pushToast({ kind: 'warning', message: t('form.nicknameFirst') })
        setBusy(true)
        const result = await joinRoom(code, nickname.trim())
        setBusy(false)
        if (result.success) router.push(`/room/${code}`)
        else pushToast({ kind: 'error', message: msg(result.error, 'error.joinRoom') })
    }

    if (lookupError) {
        return (
            <main className="page">
                <div className={`card ${styles.card} ${styles.errorCard} anim-pop`}>
                    <Logo size="sm" />
                    <h1>{t('join.notFoundTitle')}</h1>
                    <p className="muted">{t('join.notFoundText', { error: msg(lookupError) })}</p>
                    <button className="btn btn-primary" onClick={() => router.push('/')}>{t('join.createOwn')}</button>
                </div>
            </main>
        )
    }

    return (
        <main className="page">
            <Toasts toasts={toasts} />
            <LanguageSelect floating />
            <div className={`${styles.wrap} anim-fade-up`}>
                <Logo size="md" />

                <div className={`card-solid ${styles.card}`}>
                    <div className={styles.inviteHead}>
                        <span className="eyebrow">{t('join.invited')}</span>
                        <h1 className={styles.title}>
                            {info ? rich('join.roomOf', { host: <span className="text-accent">{info.hostName}</span> }) : t('join.enterRoom')}
                        </h1>
                        <div className={styles.meta}>
                            <span className="chip"><CrownIcon size={13} /> {t('join.code', { code })}</span>
                            {info && (
                                <span className="chip"><UsersIcon size={13} /> {t('join.players', { count: info.playerCount })}</span>
                            )}
                            {info?.status === 'playing' && <span className="chip chip-orange">{t('join.inProgress')}</span>}
                        </div>
                    </div>

                    <form className={styles.form} onSubmit={handleJoin}>
                        <div className="field">
                            <label htmlFor="nickname">{t('form.nickname')}</label>
                            <input
                                id="nickname"
                                className="input"
                                placeholder={t('form.nicknamePlaceholder')}
                                value={nickname}
                                maxLength={LIMITS.NICKNAME_MAX}
                                onChange={(e) => setNickname(e.target.value)}
                                autoFocus
                                autoComplete="nickname"
                            />
                        </div>
                        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={!isConnected || busy || !info}>
                            {busy || !isConnected ? <span className="spinner spinner-sm" /> : <ArrowRightIcon />}
                            {!isConnected ? t('join.connecting') : busy ? t('join.joining') : t('join.enterRoom')}
                        </button>
                    </form>
                </div>

                <button className="btn btn-ghost" onClick={() => router.push('/')}>
                    {t('join.preferCreate')}
                </button>
            </div>
        </main>
    )
}
