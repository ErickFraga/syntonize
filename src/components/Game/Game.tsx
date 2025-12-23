'use client'

import { useState, useEffect } from 'react'
import { Room, Player, SCORING } from '@/types/game'
import Spectrum from './Spectrum'
import Scoreboard from './Scoreboard'
import styles from './Game.module.css'

interface GameProps {
    room: Room
    currentPlayer: Player | null
    isSeer: boolean
    timer: number
    isReady: boolean
    readyPlayers: Set<string>
    onGiveClue: (clue: string) => void
    onSubmitGuess: (position: number) => void
    onSetReady: () => void
}

export default function Game({
    room,
    currentPlayer,
    isSeer,
    timer,
    isReady,
    readyPlayers,
    onGiveClue,
    onSubmitGuess,
    onSetReady
}: GameProps) {
    const round = room.currentRound
    const [clue, setClue] = useState('')
    const [guessPosition, setGuessPosition] = useState(50)
    const [hasSubmitted, setHasSubmitted] = useState(false)

    // Reset state on new round
    useEffect(() => {
        setClue('')
        setGuessPosition(50)
        setHasSubmitted(false)
    }, [round?.roundNumber])

    // Track if player has already guessed
    useEffect(() => {
        if (currentPlayer?.hasGuessed) {
            setHasSubmitted(true)
        }
    }, [currentPlayer?.hasGuessed])

    if (!round) return null

    const seer = room.players.find(p => p.id === round.seerId)
    const isWaitingClue = round.phase === 'waiting_clue'
    const isGuessing = round.phase === 'guessing'
    const isRevealed = round.phase === 'revealed'

    const handleSubmitClue = () => {
        if (clue.trim()) {
            onGiveClue(clue.trim())
        }
    }

    const handleSubmitGuess = () => {
        onSubmitGuess(guessPosition)
        setHasSubmitted(true)
    }

    const getScoreLabel = (score: number) => {
        if (score >= SCORING.BULLSEYE_POINTS) return '🎯 Bullseye!'
        if (score >= SCORING.CLOSE_POINTS) return '👍 Muito perto!'
        if (score >= SCORING.ACCEPTABLE_POINTS) return '👌 Quase lá'
        return '😅 Errou'
    }

    return (
        <div className={styles.game}>
            <div className={styles.mainContent}>
                {/* Round info */}
                <div className={styles.roundInfo}>
                    <span className={styles.roundNumber}>Rodada {round.roundNumber}</span>
                    <div className={styles.seerInfo}>
                        <span className={styles.seerLabel}>Vidente:</span>
                        <span className={styles.seerName}>
                            {seer?.nickname}
                            {isSeer && ' (Você)'}
                        </span>
                    </div>
                </div>

                {/* Spectrum Card */}
                <div className={`glass ${styles.spectrumCard}`}>
                    <div className={styles.cardConcepts}>
                        <span className={styles.leftConcept}>{round.spectrumCard.leftConcept}</span>
                        <span className={styles.rightConcept}>{round.spectrumCard.rightConcept}</span>
                    </div>

                    <Spectrum
                        targetPosition={isRevealed || isSeer ? round.targetPosition : null}
                        guessPosition={isSeer ? null : guessPosition}
                        playerGuesses={isRevealed ? room.players.filter(p => p.id !== round.seerId).map(p => ({
                            id: p.id,
                            nickname: p.nickname,
                            position: round.guesses[p.id] ?? 50
                        })) : undefined}
                        isInteractive={isGuessing && !isSeer && !hasSubmitted}
                        onPositionChange={setGuessPosition}
                    />

                    {/* Clue display */}
                    {round.clue && (
                        <div className={styles.clueDisplay}>
                            <span className={styles.clueLabel}>Dica:</span>
                            <span className={styles.clueText}>&ldquo;{round.clue}&rdquo;</span>
                        </div>
                    )}
                </div>

                {/* Seer controls */}
                {isSeer && isWaitingClue && (
                    <div className={styles.seerControls}>
                        <p className={styles.seerHint}>
                            Você é o Vidente! O alvo está na posição indicada.
                            <br />
                            Dê uma dica para os outros jogadores acertarem.
                        </p>
                        <div className={styles.clueInput}>
                            <input
                                type="text"
                                className="input"
                                placeholder="Digite sua dica..."
                                value={clue}
                                onChange={(e) => setClue(e.target.value)}
                                maxLength={50}
                                onKeyDown={(e) => e.key === 'Enter' && handleSubmitClue()}
                            />
                            <button
                                className="btn btn-primary"
                                onClick={handleSubmitClue}
                                disabled={!clue.trim()}
                            >
                                Enviar Dica
                            </button>
                        </div>
                    </div>
                )}

                {/* Player controls */}
                {!isSeer && isGuessing && (
                    <div className={styles.playerControls}>
                        {!hasSubmitted ? (
                            <>
                                <p className={styles.guessHint}>
                                    Arraste o ponteiro para onde você acha que está o alvo!
                                </p>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleSubmitGuess}
                                >
                                    ✓ Confirmar Palpite
                                </button>
                            </>
                        ) : (
                            <p className={styles.waitingOthers}>
                                ✓ Palpite enviado! Aguardando outros jogadores...
                            </p>
                        )}
                    </div>
                )}

                {/* Waiting for clue */}
                {!isSeer && isWaitingClue && (
                    <div className={styles.waitingClue}>
                        <div className={styles.waitingAnimation}>
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                        <p>Aguardando {seer?.nickname} dar a dica...</p>
                    </div>
                )}

                {/* Results display */}
                {isRevealed && (
                    <div className={styles.resultsPanel}>
                        <h3>Resultados da Rodada</h3>
                        <div className={styles.scoresGrid}>
                            {room.players
                                .filter(p => round.scores[p.id] !== undefined)
                                .sort((a, b) => (round.scores[b.id] || 0) - (round.scores[a.id] || 0))
                                .map(player => (
                                    <div key={player.id} className={`${styles.scoreItem} ${readyPlayers.has(player.id) ? styles.ready : ''}`}>
                                        <span className={styles.playerScoreName}>
                                            {player.nickname}
                                            {readyPlayers.has(player.id) && ' ✓'}
                                        </span>
                                        <span className={styles.playerScoreLabel}>
                                            {getScoreLabel(round.scores[player.id] || 0)}
                                        </span>
                                        <span className={styles.playerScoreValue}>
                                            +{round.scores[player.id] || 0}
                                        </span>
                                    </div>
                                ))}
                        </div>

                        <div className={styles.readySection}>
                            {isReady ? (
                                <p className={styles.readyStatus}>✓ Você está pronto! Aguardando outros...</p>
                            ) : (
                                <button className="btn btn-primary" onClick={onSetReady}>
                                    Pronto para próxima rodada
                                </button>
                            )}
                            <span className={styles.readyCount}>
                                {readyPlayers.size}/{room.players.filter(p => p.isConnected).length} prontos
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Scoreboard sidebar */}
            <div className={styles.sidebar}>
                <Scoreboard
                    players={room.players}
                    targetScore={room.targetScore}
                    currentSeerId={round.seerId}
                />
            </div>
        </div>
    )
}
