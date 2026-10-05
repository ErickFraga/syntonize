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
import TeamGame from '../../src/components/TeamGame/TeamGame.tsx'
import TeamResults from '../../src/components/TeamResults/TeamResults.tsx'
import Logo from '../../src/components/ui/Logo.tsx'
import { I18nContext, makeTranslator } from '../../src/i18n/I18nProvider.tsx'

const g = globalThis as any
const css = readFileSync('../../src/app/globals.css', 'utf8') + '\n' + g.__cssRegistry.join('\n')

function player(id: string, nickname: string, colorIndex: number, extra: Partial<Player> = {}): Player {
    return { id, nickname, score: 0, isHost: false, isConnected: true, colorIndex, hasGuessed: false, isReady: false, disconnectedAt: null, team: (colorIndex % 2) as 0 | 1, ...extra }
}

const players = [
    player('p1', 'Ana', 0, { isHost: true, score: 9 }),
    player('p2', 'Bia', 1, { score: 12 }),
    player('p3', 'Caio', 2, { score: 7 }),
    player('p4', 'Duda', 3, { score: 4, isConnected: false, disconnectedAt: 1 }),
    player('p5', 'Eduardo Silva', 4, { score: 11 }),
]

const card = { id: 34, pack: 'classic' as const, leftConcept: 'Comida de criança', rightConcept: 'Comida de adulto' }

function round(phase: GameRound['phase'], extra: Partial<GameRound> = {}): GameRound {
    return {
        roundNumber: 4, seerId: 'p1', spectrumCard: card, targetPosition: 62, clue: null, phase,
        guesses: {}, scores: {}, zones: {}, closestIds: [], startedAt: 1000, clueAt: null, revealedAt: null, teamPlay: null, ...extra,
    }
}

function room(status: Room['status'], currentRound: GameRound | null, extra: Partial<Room> = {}): Room {
    return {
        code: 'K7PX2Q', players, status, settings: { ...DEFAULT_SETTINGS }, currentRound, roundHistory: [], seerOrder: players.map(p => p.id),
        currentSeerIndex: 0, usedCardIds: [], winnerId: null, nextRoundAt: null, createdAt: 0,
        teamScores: [0, 0], teamSeerIndex: [0, 0], nextTeam: 0, winnerTeam: null, ...extra,
    }
}

const noop = () => {}
const ok = async () => ({ success: true })

const header = jsx('header', {
    style: { display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '12px', padding: '10px 20px', background: 'rgba(13,11,31,.78)', borderBottom: '1px solid rgba(255,255,255,.1)', position: 'sticky', top: 0, zIndex: 50 },
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

const teamSettings = { ...DEFAULT_SETTINGS, mode: 'teams' as const, targetScore: 10 }
const teamPlay = (extra: Partial<NonNullable<GameRound['teamPlay']>> = {}) => ({
    team: 0 as const, needle: 41, guess: null, lockedBy: null, side: null, sideBy: null, zone: null, points: [0, 0] as [number, number], sideCorrect: null, catchUp: false, ...extra,
})
const teamRoom = (r: GameRound | null, extra: Partial<Room> = {}) =>
    room(r ? 'playing' : 'finished', r, { settings: teamSettings, teamScores: [6, 8], ...extra })
const teamGameProps = { isHost: false, isSeer: false, remoteNeedle: null, onGiveClue: ok, onSubmitGuess: ok, onNeedleMove: noop, onSideGuess: ok, onSetReady: noop, onNextRound: noop, onSkipRound: noop }
const teamRevealed = round('revealed', {
    clue: 'Nuggets de salmão', clueAt: 2000, revealedAt: 3000, targetPosition: 62,
    teamPlay: teamPlay({ guess: 58, needle: 58, lockedBy: 'p3', side: 'right', sideBy: 'p2', zone: 3, points: [3, 1], sideCorrect: true }),
})

const screens: Record<string, { node: any; mobile?: boolean }> = {
    home: { node: jsx(Home, {}) },
    join: { node: jsx(JoinPage, {}) },
    lobby: {
        node: page(jsx(Lobby, { room: room('waiting', null, { settings: { ...DEFAULT_SETTINGS, packs: ['classic', 'food', 'spicy'] } }), me: players[0], isHost: true, onStartGame: noop, onKickPlayer: noop, onUpdateSettings: noop, onSetTeam: noop, onNotify: noop })),
    },
    'lobby-guest': {
        node: page(jsx(Lobby, { room: room('waiting', null, { settings: { ...DEFAULT_SETTINGS, cardLocale: 'en', packs: ['pop', 'people'] } }), me: players[1], isHost: false, onStartGame: noop, onKickPlayer: noop, onUpdateSettings: noop, onSetTeam: noop, onNotify: noop })),
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
    'lobby-teams': {
        node: page(jsx(Lobby, { room: room('waiting', null, { settings: teamSettings }), me: players[0], isHost: true, onStartGame: noop, onKickPlayer: noop, onUpdateSettings: noop, onSetTeam: noop, onNotify: noop })),
    },
    'team-guessing': {
        node: page(jsx(TeamGame, { ...teamGameProps, room: teamRoom(round('guessing', { clue: 'Nuggets de salmão', clueAt: 2000, targetPosition: null, teamPlay: teamPlay() })), me: players[2], secondsLeft: 27, timerPhase: 'guess' })),
    },
    'team-opponent-wait': {
        node: page(jsx(TeamGame, { ...teamGameProps, room: teamRoom(round('guessing', { clue: 'Nuggets de salmão', clueAt: 2000, targetPosition: null, teamPlay: teamPlay({ needle: null }) })), me: players[1], secondsLeft: 27, timerPhase: 'guess' })),
    },
    'team-side-guess': {
        node: page(jsx(TeamGame, { ...teamGameProps, room: teamRoom(round('side_guess', { clue: 'Nuggets de salmão', clueAt: 2000, targetPosition: null, teamPlay: teamPlay({ guess: 58, needle: 58, lockedBy: 'p3' }) })), me: players[1], secondsLeft: 18, timerPhase: 'side' })),
    },
    'team-revealed': {
        node: page(jsx(TeamGame, { ...teamGameProps, room: teamRoom(teamRevealed, { teamScores: [9, 9], roundHistory: [teamRevealed, teamRevealed] }), me: players[1], secondsLeft: 11, timerPhase: 'next' })),
    },
    'team-results': {
        node: page(jsx(TeamResults, { room: teamRoom(null, { teamScores: [11, 9], winnerTeam: 0, roundHistory: [teamRevealed, teamRevealed, teamRevealed] }), me: players[2], isHost: true, onPlayAgain: noop, onBackToLobby: noop, onLeave: noop })),
    },
    results: {
        node: page(jsx(Results, { room: room('finished', null, { roundHistory: [revealed, revealed, revealed], winnerId: 'p2' }), me: players[1], isHost: true, onPlayAgain: noop, onBackToLobby: noop, onLeave: noop })),
    },
}

g.__params = { code: 'K7PX2Q' }

// Same screens in other interface languages (the shim's useContext reads the context default).
for (const [locale, names] of [['en', ['home', 'lobby', 'lobby-teams', 'game-revealed']], ['es', ['lobby-guest', 'team-side-guess', 'results']]] as const) {
    for (const name of names) screens[`${name}-${locale}`] = { ...screens[name], locale }
}

for (const [name, screen] of Object.entries(screens) as Array<[string, { node: any; locale?: 'en' | 'es' }]>) {
    ;(I18nContext as any)._value = makeTranslator(screen.locale ?? 'pt-BR')
    const body = renderToString(screen.node)
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${name}</title><style>${css}</style><style>:root{--font-fredoka:'DejaVu Sans';--font-nunito:'DejaVu Sans'} *,*::before,*::after{animation:none!important;transition:none!important}</style></head><body>${body}</body></html>`
    writeFileSync(`${import.meta.dir}/out/${name}.html`, html)
    console.log('rendered', name, html.length)
}
