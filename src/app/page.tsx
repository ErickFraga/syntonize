'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useGameState } from '@/hooks/useGameState'
import { session } from '@/lib/socket'
import { LIMITS, SCORING } from '@/types/game'
import Logo from '@/components/ui/Logo'
import Dial from '@/components/Dial/Dial'
import Toasts from '@/components/ui/Toasts'
import LanguageSelect from '@/components/LanguageSelect/LanguageSelect'
import { useT } from '@/i18n/I18nProvider'
import { SparklesIcon, ArrowRightIcon, EyeIcon, LightbulbIcon, TargetIcon, TrophyIcon } from '@/components/ui/Icons'
import styles from './page.module.css'

export default function Home() {
  const router = useRouter()
  const { t, rich, msg } = useT()
  const { createRoom, joinRoom, isConnected, restoredCode, room, toasts, pushToast } = useGameState()

  const [nickname, setNickname] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const [demoNeedle, setDemoNeedle] = useState(58)

  useEffect(() => {
    setNickname(session.getNickname() ?? '')
  }, [])

  // A live session (refresh, or coming back from another tab) sends you
  // straight back to your room.
  useEffect(() => {
    const code = restoredCode ?? room?.code
    if (code) router.replace(`/room/${code}`)
  }, [restoredCode, room, router])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!nickname.trim()) return pushToast({ kind: 'warning', message: t('form.nicknameFirst') })
    setBusy('create')
    const result = await createRoom(nickname.trim())
    setBusy(null)
    if (result.success && result.code) router.push(`/room/${result.code}`)
    else pushToast({ kind: 'error', message: msg(result.error, 'error.createRoom') })
  }

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault()
    if (!nickname.trim()) return pushToast({ kind: 'warning', message: t('form.nicknameFirst') })
    const code = roomCode.trim().toUpperCase()
    if (code.length < 6) return pushToast({ kind: 'warning', message: t('home.codeLength') })
    setBusy('join')
    const result = await joinRoom(code, nickname.trim())
    setBusy(null)
    if (result.success) router.push(`/room/${code}`)
    else pushToast({ kind: 'error', message: msg(result.error, 'error.joinRoom') })
  }

  return (
    <main className={styles.page}>
      <Toasts toasts={toasts} />
      <LanguageSelect floating />

      <section className={styles.hero}>
        <div className={`${styles.heroText} anim-fade-up`}>
          <Logo size="lg" />
          <h1 className={styles.tagline}>
            {t('home.taglineStart')}<span className="text-gradient">{t('home.taglineEnd')}</span>
          </h1>
          <p className={styles.lead}>
            {rich('home.lead', { game: <strong>{t('home.gameName')}</strong> })}
          </p>
          <div className={styles.heroFacts}>
            <span className="chip chip-teal">{t('home.factPlayers', { min: LIMITS.MIN_PLAYERS, max: LIMITS.MAX_PLAYERS })}</span>
            <span className="chip chip-pink">{t('home.factDevices')}</span>
            <span className="chip chip-orange">{t('home.factLength')}</span>
          </div>
        </div>

        <div className={`card-solid ${styles.demo} anim-fade-up`} style={{ animationDelay: '0.1s' }}>
          <Dial target={62} needle={demoNeedle} onNeedleChange={setDemoNeedle} interactive />
          <div className={styles.demoConcepts}>
            <span>◀ {t('home.demoLeft')}</span>
            <span>{t('home.demoRight')} ▶</span>
          </div>
          <p className={styles.demoHint}>{t('home.demoHint')}</p>
        </div>
      </section>

      <section className={`card ${styles.entry} anim-fade-up`} style={{ animationDelay: '0.15s' }}>
        <div className={styles.entryField}>
          <div className="field">
            <label htmlFor="nickname">{t('form.nickname')}</label>
            <input
              id="nickname"
              className="input"
              placeholder={t('form.nicknamePlaceholder')}
              value={nickname}
              maxLength={LIMITS.NICKNAME_MAX}
              onChange={(e) => setNickname(e.target.value)}
              autoComplete="nickname"
            />
          </div>
        </div>

        <div className={styles.entryColumns}>
          <form className={styles.entryCard} onSubmit={handleCreate}>
            <h2>{t('home.createTitle')}</h2>
            <p className="muted">{t('home.createText')}</p>
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={!isConnected || busy !== null}>
              {busy === 'create' ? <span className="spinner spinner-sm" /> : <SparklesIcon />}
              {busy === 'create' ? t('home.creating') : t('home.create')}
            </button>
          </form>

          <div className={styles.or}><span>{t('home.or')}</span></div>

          <form className={styles.entryCard} onSubmit={handleJoin}>
            <h2>{t('home.joinTitle')}</h2>
            <p className="muted">{t('home.joinText')}</p>
            <div className={styles.joinRow}>
              <input
                className="input input-code"
                placeholder="ABC123"
                value={roomCode}
                maxLength={6}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                aria-label={t('home.codeAria')}
                autoComplete="off"
                autoCapitalize="characters"
              />
              <button type="submit" className="btn btn-secondary btn-lg" disabled={!isConnected || busy !== null}>
                {busy === 'join' ? <span className="spinner spinner-sm" /> : <ArrowRightIcon />}
                {t('home.join')}
              </button>
            </div>
          </form>
        </div>

        {!isConnected && (
          <p className={styles.connecting}>
            <span className="spinner spinner-sm" /> {t('common.connecting')}
          </p>
        )}
      </section>

      <section className={`${styles.howTo} anim-fade-up`} style={{ animationDelay: '0.2s' }}>
        <h2>{t('home.howTo')}</h2>
        <ol className={styles.steps}>
          <li>
            <span className={styles.stepIcon}><EyeIcon size={22} /></span>
            <h3>{t('home.step1Title')}</h3>
            <p>{rich('home.step1Text', { example: <em>{t('home.step1Example')}</em> })}</p>
          </li>
          <li>
            <span className={styles.stepIcon}><LightbulbIcon size={22} /></span>
            <h3>{t('home.step2Title')}</h3>
            <p>{t('home.step2Text')}</p>
          </li>
          <li>
            <span className={styles.stepIcon}><TargetIcon size={22} /></span>
            <h3>{t('home.step3Title')}</h3>
            <p>{t('home.step3Text')}</p>
          </li>
          <li>
            <span className={styles.stepIcon}><TrophyIcon size={22} /></span>
            <h3>{t('home.step4Title')}</h3>
            <p>
              {rich('home.step4Text', {
                bull: <strong>{SCORING.BULLSEYE_POINTS}</strong>,
                close: <strong>{SCORING.CLOSE_POINTS}</strong>,
                edge: <strong>{SCORING.ACCEPTABLE_POINTS}</strong>,
                bonus: SCORING.CLOSEST_BONUS,
              })}
            </p>
          </li>
        </ol>
      </section>

      <footer className={styles.footer}>
        {t('home.footer')}
      </footer>
    </main>
  )
}
