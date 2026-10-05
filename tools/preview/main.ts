import { readFileSync, writeFileSync } from 'fs'
import { jsx } from './shims/jsx-runtime.ts'
import { renderToString } from './render.ts'
import type { Room, Player, GameRound } from '../../shared/types.ts'
import { DEFAULT_SETTINGS } from '../../shared/types.ts'

import Home from '../../src/app/page.tsx'
import JoinPage from '../../src/app/join/[code]/page.tsx'
import Lobby from '../../src/components/Lobby/Lobby.tsx'
import Game from '../../src/components/Game/Game.tsx'
import Results from '../../src/components/Results/Results.tsx'
import Logo from '../../src/components/ui/Logo.tsx'

const g = globalThis as any
const css = readFileSync('../../src/app/globals.css', 'utf8') + '\n' + g.__cssRegistry.join('\n')

function player(id: string, nickname: string, colorIndex: number, extra: Partial<Player> = {}): Player {
    return { id, nickname, score: 0, isHost: false, isConnected: true, colorIndex, hasGuessed: false, isReady: false, disconnectedAt: null, ...extra }
}

const players = [
    player('p1', 'Ana', 0, { isHost: true, score: 9 }),
    player('p2', 'Bia', 1, { score: 12 }),
    player('p3', 'Caio', 2, { score: 7 }),
    player('p4', 'Duda', 3, { score: 4, isConnected: false, disconnectedAt: 1 }),
    player('p5', 'Eduardo Silva', 4, { score: 11 }),
]

const card = { id: 1, leftConcept: 'Comida de criança', rightConcept: 'Comida de adulto' }

function round(phase: GameRound['phase'], extra: Partial<GameRound> = {}): GameRound {
    return {
        roundNumber: 4, seerId: 'p1', spectrumCard: card, targetPosition: 62, clue: null, phase,
        guesses: {}, scores: {}, zones: {}, closestIds: [], startedAt: 1000, clueAt: null, revealedAt: null, ...extra,
    }
}

function room(status: Room['status'], currentRound: GameRound | null, extra: Partial<Room> = {}): Room {
    return {
        code: 'K7PX2Q', players, status, settings: { ...DEFAULT_SETTINGS }, currentRound, roundHistory: [], seerOrder: players.map(p => p.id),
        currentSeerIndex: 0, usedCardIds: [], winnerId: null, nextRoundAt: null, createdAt: 0, ...extra,
    }
}

const noop = () => {}
const ok = async () => ({ success: true })

const header = jsx('header', {
    style: { display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '12px', padding: '10px 20px', background: 'var(--surface)', borderBottom: '2px solid var(--line)', position: 'sticky', top: 0, zIndex: 50 },
    children: [
        jsx(Logo, { size: 'sm' }),
        jsx('span', { className: 'chip', children: 'sala K7PX2Q' }),
        jsx('div', { style: { justifySelf: 'end' }, children: jsx('button', { className: 'btn btn-ghost btn-sm', children: 'Sair' }) }),
    ],
})

function page(inner: any, withHeader = true) {
    return jsx('main', {
        style: { minHeight: '100vh' },
        children: [withHeader ? header : null, jsx('div', { style: { padding: '20px 16px 40px' }, children: inner })],
    })
}

const revealed = round('revealed', {
    clue: 'Nuggets de salmão', clueAt: 2000, revealedAt: 3000,
    guesses: { p2: 60, p3: 71, p4: 30, p5: 54 },
    zones: { p2: 4, p3: 3, p4: 0, p5: 3 },
    scores: { p2: 5, p3: 3, p4: 0, p5: 3, p1: 3 },
    closestIds: ['p2'],
})

const screens: Record<string, { node: any; mobile?: boolean }> = {
    home: { node: jsx(Home, {}) },
    join: { node: jsx(JoinPage, {}) },
    lobby: {
        node: page(jsx(Lobby, { room: room('waiting', null), me: players[0], isHost: true, onStartGame: noop, onKickPlayer: noop, onUpdateSettings: noop, onNotify: noop })),
    },
    'lobby-guest': {
        node: page(jsx(Lobby, { room: room('waiting', null), me: players[1], isHost: false, onStartGame: noop, onKickPlayer: noop, onUpdateSettings: noop, onNotify: noop })),
    },
    'game-seer-clue': {
        node: page(jsx(Game, { room: room('playing', round('waiting_clue')), me: players[0], isHost: true, isSeer: true, secondsLeft: null, timerPhase: null, onGiveClue: ok, onSubmitGuess: ok, onSetReady: noop, onNextRound: noop, onSkipRound: noop })),
    },
    'game-guesser-wait': {
        node: page(jsx(Game, { room: room('playing', round('waiting_clue')), me: players[1], isHost: false, isSeer: false, secondsLeft: null, timerPhase: null, onGiveClue: ok, onSubmitGuess: ok, onSetReady: noop, onNextRound: noop, onSkipRound: noop })),
    },
    'game-guessing': {
        node: page(jsx(Game, {
            room: room('playing', round('guessing', { clue: 'Nuggets de salmão', clueAt: 2000, targetPosition: null }), { players: players.map(p => p.id === 'p3' ? { ...p, hasGuessed: true } : p) }),
            me: players[1], isHost: false, isSeer: false, secondsLeft: 27, timerPhase: 'guess', onGiveClue: ok, onSubmitGuess: ok, onSetReady: noop, onNextRound: noop, onSkipRound: noop,
        })),
    },
    'game-seer-guessing': {
        node: page(jsx(Game, {
            room: room('playing', round('guessing', { clue: 'Nuggets de salmão', clueAt: 2000 }), { players: players.map(p => p.id === 'p3' || p.id === 'p5' ? { ...p, hasGuessed: true } : p) }),
            me: players[0], isHost: true, isSeer: true, secondsLeft: 4, timerPhase: 'guess', onGiveClue: ok, onSubmitGuess: ok, onSetReady: noop, onNextRound: noop, onSkipRound: noop,
        })),
    },
    'game-revealed': {
        node: page(jsx(Game, {
            room: room('playing', revealed, { players: players.map(p => p.id === 'p3' ? { ...p, isReady: true } : p), roundHistory: [revealed, revealed, revealed, revealed] }),
            me: players[1], isHost: false, isSeer: false, secondsLeft: 11, timerPhase: 'next', onGiveClue: ok, onSubmitGuess: ok, onSetReady: noop, onNextRound: noop, onSkipRound: noop,
        })),
    },
    results: {
        node: page(jsx(Results, { room: room('finished', null, { roundHistory: [revealed, revealed, revealed], winnerId: 'p2' }), me: players[1], isHost: true, onPlayAgain: noop, onBackToLobby: noop, onLeave: noop })),
    },
}

g.__params = { code: 'K7PX2Q' }

const LIGHT = new Set(['home', 'lobby', 'game-guessing', 'game-revealed', 'results'])
for (const [name, screen] of Object.entries(screens)) {
    const body = renderToString(screen.node)
    const variants: Array<[string, string]> = [[name, '']]
    if (LIGHT.has(name)) variants.push([`${name}-light`, ' data-theme="light"'])
    for (const [file, attr] of variants) writeFileSync(`${import.meta.dir}/out/${file}.html`, `<!doctype html><html lang="pt-BR"${attr}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${file}</title><style>${css}</style><style>:root{--font-nunito:'DejaVu Sans';--font-baloo:'DejaVu Sans'} *,*::before,*::after{animation:none!important;transition:none!important}</style></head><body>${body}</body></html>`)
    console.log('rendered', name)
    continue
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${name}</title><style>${css}</style><style>:root{--font-fredoka:'DejaVu Sans';--font-nunito:'DejaVu Sans'} *,*::before,*::after{animation:none!important;transition:none!important}</style></head><body>${body}</body></html>`
    writeFileSync(`${import.meta.dir}/out/${name}.html`, html)
    console.log('rendered', name, html.length)
}
