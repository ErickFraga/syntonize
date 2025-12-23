'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useGameState } from '@/hooks/useGameState'
import styles from './page.module.css'

// SVG Icons
const SparklesIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
  </svg>
)

const RocketIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </svg>
)

export default function Home() {
  const router = useRouter()
  const { createRoom, joinRoom, error, isConnected, sessionRestored } = useGameState()

  const [nickname, setNickname] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  // Redirect to room if session was restored
  useEffect(() => {
    if (sessionRestored) {
      router.push(`/room/${sessionRestored}`)
    }
  }, [sessionRestored, router])

  const handleCreateRoom = async () => {
    if (!nickname.trim()) {
      setLocalError('Digite seu nickname')
      return
    }

    setIsCreating(true)
    setLocalError(null)

    try {
      const result = await createRoom(nickname.trim())
      if (result.success && result.code) {
        router.push(`/room/${result.code}`)
      } else {
        setLocalError(result.error || 'Erro ao criar sala')
      }
    } catch {
      setLocalError('Erro de conexão')
    } finally {
      setIsCreating(false)
    }
  }

  const handleJoinRoom = async () => {
    if (!nickname.trim()) {
      setLocalError('Digite seu nickname')
      return
    }

    if (!roomCode.trim()) {
      setLocalError('Digite o código da sala')
      return
    }

    setIsJoining(true)
    setLocalError(null)

    try {
      const result = await joinRoom(roomCode.trim().toUpperCase(), nickname.trim())
      if (result.success) {
        router.push(`/room/${roomCode.trim().toUpperCase()}`)
      } else {
        setLocalError(result.error || 'Erro ao entrar na sala')
      }
    } catch {
      setLocalError('Erro de conexão')
    } finally {
      setIsJoining(false)
    }
  }

  return (
    <main className="page">
      {(error || localError) && (
        <div className="error-toast">{error || localError}</div>
      )}

      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>
            <span className={styles.titleGradient}>Syntonize</span>
          </h1>
          <p className={styles.subtitle}>
            Leia a mente dos seus amigos!
          </p>
        </div>

        <div className={`glass ${styles.card}`}>
          <div className={styles.form}>
            <div className={styles.inputGroup}>
              <label htmlFor="nickname">Seu Nickname</label>
              <input
                id="nickname"
                type="text"
                className="input"
                placeholder="Como quer ser chamado?"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={20}
              />
            </div>

            <button
              className="btn btn-primary"
              onClick={handleCreateRoom}
              disabled={!isConnected || isCreating}
            >
              {isCreating ? (
                <>
                  <div className={styles.btnSpinner} />
                  Criando...
                </>
              ) : (
                <>
                  <SparklesIcon />
                  Criar Sala
                </>
              )}
            </button>

            <div className={styles.divider}>
              <span>ou entre em uma sala existente</span>
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="roomCode">Código da Sala</label>
              <input
                id="roomCode"
                type="text"
                className="input"
                placeholder="Ex: ABC123"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={6}
              />
            </div>

            <button
              className="btn btn-secondary"
              onClick={handleJoinRoom}
              disabled={!isConnected || isJoining}
            >
              {isJoining ? (
                <>
                  <div className={styles.btnSpinner} />
                  Entrando...
                </>
              ) : (
                <>
                  <RocketIcon />
                  Entrar na Sala
                </>
              )}
            </button>
          </div>
        </div>

        <div className={styles.howToPlay}>
          <h3>Como Jogar</h3>
          <ol>
            <li>O <strong>Vidente</strong> vê um alvo secreto no espectro</li>
            <li>Ele dá uma <strong>dica</strong> para indicar a posição</li>
            <li>Os outros jogadores tentam <strong>acertar</strong> onde está o alvo</li>
            <li>Quanto mais perto, mais pontos você ganha!</li>
          </ol>
        </div>
      </div>
    </main>
  )
}
