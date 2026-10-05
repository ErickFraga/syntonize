'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useGameState } from '@/hooks/useGameState'
import { session } from '@/lib/socket'
import { LIMITS, SCORING } from '@/types/game'
import Logo from '@/components/ui/Logo'
import Dial from '@/components/Dial/Dial'
import Toasts from '@/components/ui/Toasts'
import { SparklesIcon, ArrowRightIcon, EyeIcon, LightbulbIcon, TargetIcon, TrophyIcon } from '@/components/ui/Icons'
import styles from './page.module.css'

export default function Home() {
  const router = useRouter()
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
    if (!nickname.trim()) return pushToast({ kind: 'warning', message: 'Escolhe um apelido primeiro' })
    setBusy('create')
    const result = await createRoom(nickname.trim())
    setBusy(null)
    if (result.success && result.code) router.push(`/room/${result.code}`)
    else pushToast({ kind: 'error', message: result.error ?? 'Não deu para criar a sala' })
  }

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault()
    if (!nickname.trim()) return pushToast({ kind: 'warning', message: 'Escolhe um apelido primeiro' })
    const code = roomCode.trim().toUpperCase()
    if (code.length < 6) return pushToast({ kind: 'warning', message: 'O código da sala tem 6 caracteres' })
    setBusy('join')
    const result = await joinRoom(code, nickname.trim())
    setBusy(null)
    if (result.success) router.push(`/room/${code}`)
    else pushToast({ kind: 'error', message: result.error ?? 'Não deu para entrar na sala' })
  }

  return (
    <main className={styles.page}>
      <Toasts toasts={toasts} />

      <section className={styles.hero}>
        <div className={`${styles.heroText} anim-fade-up`}>
          <Logo size="lg" />
          <h1 className={styles.tagline}>
            Leia a mente dos <span className="text-gradient">seus amigos</span>
          </h1>
          <p className={styles.lead}>
            Um Vidente vê o alvo escondido no espectro e dá uma dica. Todo mundo tenta cravar onde ele está.
            Versão online do jogo de tabuleiro <strong>SINTONIA</strong> (Wavelength), de graça e sem instalar nada.
          </p>
          <div className={styles.heroFacts}>
            <span className="chip chip-teal">{LIMITS.MIN_PLAYERS}–{LIMITS.MAX_PLAYERS} jogadores</span>
            <span className="chip chip-pink">celular ou PC</span>
            <span className="chip chip-orange">partidas de 15 min</span>
          </div>
        </div>

        <div className={`card-solid ${styles.demo} anim-fade-up`} style={{ animationDelay: '0.1s' }}>
          <Dial target={62} needle={demoNeedle} onNeedleChange={setDemoNeedle} interactive />
          <div className={styles.demoConcepts}>
            <span>◀ Comida de criança</span>
            <span>Comida de adulto ▶</span>
          </div>
          <p className={styles.demoHint}>experimenta arrastar o ponteiro</p>
        </div>
      </section>

      <section className={`card ${styles.entry} anim-fade-up`} style={{ animationDelay: '0.15s' }}>
        <div className={styles.entryField}>
          <div className="field">
            <label htmlFor="nickname">Seu apelido</label>
            <input
              id="nickname"
              className="input"
              placeholder="Como a galera te chama?"
              value={nickname}
              maxLength={LIMITS.NICKNAME_MAX}
              onChange={(e) => setNickname(e.target.value)}
              autoComplete="nickname"
            />
          </div>
        </div>

        <div className={styles.entryColumns}>
          <form className={styles.entryCard} onSubmit={handleCreate}>
            <h2>Criar uma sala</h2>
            <p className="muted">Você vira o anfitrião, escolhe as regras e recebe um link para convidar.</p>
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={!isConnected || busy !== null}>
              {busy === 'create' ? <span className="spinner spinner-sm" /> : <SparklesIcon />}
              {busy === 'create' ? 'Criando…' : 'Criar sala'}
            </button>
          </form>

          <div className={styles.or}><span>ou</span></div>

          <form className={styles.entryCard} onSubmit={handleJoin}>
            <h2>Entrar em uma sala</h2>
            <p className="muted">Pede o código de 6 letras para quem criou.</p>
            <div className={styles.joinRow}>
              <input
                className="input input-code"
                placeholder="ABC123"
                value={roomCode}
                maxLength={6}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                aria-label="Código da sala"
                autoComplete="off"
                autoCapitalize="characters"
              />
              <button type="submit" className="btn btn-secondary btn-lg" disabled={!isConnected || busy !== null}>
                {busy === 'join' ? <span className="spinner spinner-sm" /> : <ArrowRightIcon />}
                Entrar
              </button>
            </div>
          </form>
        </div>

        {!isConnected && (
          <p className={styles.connecting}>
            <span className="spinner spinner-sm" /> Conectando ao servidor…
          </p>
        )}
      </section>

      <section className={`${styles.howTo} anim-fade-up`} style={{ animationDelay: '0.2s' }}>
        <h2>Como funciona</h2>
        <ol className={styles.steps}>
          <li>
            <span className={styles.stepIcon}><EyeIcon size={22} /></span>
            <h3>O Vidente vê o alvo</h3>
            <p>A cada rodada, um jogador vê onde o alvo está escondido entre dois extremos, tipo <em>Quente ↔ Frio</em>.</p>
          </li>
          <li>
            <span className={styles.stepIcon}><LightbulbIcon size={22} /></span>
            <h3>Dá uma dica</h3>
            <p>Uma palavra ou expressão que fique exatamente naquele ponto do espectro. Sem usar as palavras da carta!</p>
          </li>
          <li>
            <span className={styles.stepIcon}><TargetIcon size={22} /></span>
            <h3>Todo mundo palpita</h3>
            <p>Cada um arrasta o ponteiro para onde acha que está o alvo e trava o palpite antes do tempo acabar.</p>
          </li>
          <li>
            <span className={styles.stepIcon}><TrophyIcon size={22} /></span>
            <h3>Pontua pela cunha</h3>
            <p>
              Centro vale <strong>{SCORING.BULLSEYE_POINTS}</strong>, do lado <strong>{SCORING.CLOSE_POINTS}</strong>, na borda <strong>{SCORING.ACCEPTABLE_POINTS}</strong>.
              Quem chegar mais perto ganha +{SCORING.CLOSEST_BONUS}, e o Vidente leva a média da galera.
            </p>
          </li>
        </ol>
      </section>

      <footer className={styles.footer}>
        Syntonize é um projeto independente, inspirado no jogo de tabuleiro Wavelength / SINTONIA.
      </footer>
    </main>
  )
}
