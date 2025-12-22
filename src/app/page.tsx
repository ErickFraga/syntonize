'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useGameState } from '@/hooks/useGameState'
import styles from './page.module.css'

export default function Home() {
  const router = useRouter()
  const { createRoom, joinRoom, error, isConnected } = useGameState()

  const [nickname, setNickname] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

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
          <div className={styles.connectionStatus}>
            <span className={`${styles.statusDot} ${isConnected ? styles.connected : ''}`} />
            {isConnected ? 'Conectado' : 'Conectando...'}
          </div>

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
              {isCreating ? 'Criando...' : '✨ Criar Sala'}
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
              {isJoining ? 'Entrando...' : '🚀 Entrar na Sala'}
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
