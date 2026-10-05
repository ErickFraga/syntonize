import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Game from '@/components/Game/Game'
import { LIMITS } from '@shared/types'
import type { Player, Room } from '@shared/types'
import { ana, bia, caio, ok, players, renderPt, room, round, tr } from './fixtures'

const noop = () => {}

function props(r: Room, me: Player, overrides: Partial<Parameters<typeof Game>[0]> = {}) {
    return {
        room: r,
        me,
        isHost: me.isHost,
        isSeer: r.currentRound?.seerId === me.id,
        secondsLeft: null,
        timerPhase: null,
        onGiveClue: ok,
        onSubmitGuess: ok,
        onSetReady: noop,
        onNextRound: noop,
        onSkipRound: noop,
        ...overrides,
    }
}

describe('Game: dica do Vidente', () => {
    const waiting = room('playing', round('waiting_clue'))

    it('o Vidente vê o campo da dica e o botão só habilita com texto', async () => {
        const user = userEvent.setup()
        renderPt(<Game {...props(waiting, ana)} />)
        const send = screen.getByRole('button', { name: tr.t('game.sendClue') })
        expect(send).toBeDisabled()
        await user.type(screen.getByPlaceholderText(tr.t('game.cluePlaceholder')), '   ')
        expect(send).toBeDisabled()
        await user.type(screen.getByPlaceholderText(tr.t('game.cluePlaceholder')), 'Nuggets')
        expect(send).toBeEnabled()
    })

    it('envia a dica sem espaços nas pontas', async () => {
        const user = userEvent.setup()
        const onGiveClue = vi.fn(ok)
        renderPt(<Game {...props(waiting, ana, { onGiveClue })} />)
        await user.type(screen.getByPlaceholderText(tr.t('game.cluePlaceholder')), '  Nuggets de salmão ')
        await user.click(screen.getByRole('button', { name: tr.t('game.sendClue') }))
        expect(onGiveClue).toHaveBeenCalledExactlyOnceWith('Nuggets de salmão')
    })

    it('mostra o contador e respeita o limite de caracteres', async () => {
        const user = userEvent.setup()
        renderPt(<Game {...props(waiting, ana)} />)
        const input = screen.getByPlaceholderText(tr.t('game.cluePlaceholder'))
        expect(input).toHaveAttribute('maxlength', String(LIMITS.CLUE_MAX))
        await user.type(input, 'abc')
        expect(screen.getByText(`3/${LIMITS.CLUE_MAX}`)).toBeInTheDocument()
    })

    it('mostra o erro do servidor quando a dica é recusada', async () => {
        const user = userEvent.setup()
        const onGiveClue = vi.fn(async () => ({ success: false as const, error: { code: 'clue_empty' as const } }))
        renderPt(<Game {...props(waiting, ana, { onGiveClue })} />)
        await user.type(screen.getByPlaceholderText(tr.t('game.cluePlaceholder')), 'oi')
        await user.click(screen.getByRole('button', { name: tr.t('game.sendClue') }))
        expect(await screen.findByText(tr.msg({ code: 'clue_empty' }))).toBeInTheDocument()
    })

    it('quem adivinha vê "esperando" e não tem campo de dica', () => {
        renderPt(<Game {...props(waiting, bia)} />)
        expect(screen.queryByPlaceholderText(tr.t('game.cluePlaceholder'))).toBeNull()
        expect(screen.getByText(/Esperando/)).toBeInTheDocument()
    })

    it('só o anfitrião pode pular a rodada que espera a dica', async () => {
        const user = userEvent.setup()
        const onSkipRound = vi.fn()
        const { unmount } = renderPt(<Game {...props(waiting, bia)} />)
        expect(screen.queryByRole('button', { name: new RegExp(tr.t('game.skip')) })).toBeNull()
        unmount()
        // O anfitrião que não é o Vidente: a Ana deixa de ser a Vidente.
        const hostWaits = room('playing', round('waiting_clue', { seerId: 'p2' }))
        renderPt(<Game {...props(hostWaits, ana, { onSkipRound })} />)
        await user.click(screen.getByRole('button', { name: new RegExp(tr.t('game.skip')) }))
        expect(onSkipRound).toHaveBeenCalledOnce()
    })
})

describe('Game: palpites', () => {
    const guessing = room('playing', round('guessing', { clue: 'Nuggets de salmão', clueAt: 2000, targetPosition: null }), {
        players: players.map(p => (p.id === 'p3' ? { ...p, hasGuessed: true } : p)),
    })

    it('mostra a dica e os dois extremos da carta', () => {
        renderPt(<Game {...props(guessing, bia)} />)
        expect(screen.getByText(/Nuggets de salmão/)).toBeInTheDocument()
        expect(screen.getByText(/Comida de criança/)).toBeInTheDocument()
        expect(screen.getByText(/Comida de adulto/)).toBeInTheDocument()
    })

    it('a agulha começa no meio, o dial vira slider e o alvo fica escondido', () => {
        const { container } = renderPt(<Game {...props(guessing, bia)} />)
        expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '50')
        // Sem alvo conhecido não há cunha (os números 2 | 3 | 4 | 3 | 2).
        expect(container.querySelector('svg text')?.textContent).toBe('?')
    })

    it('−1/+1 e o teclado mexem na agulha; travar envia a posição', async () => {
        const user = userEvent.setup()
        const onSubmitGuess = vi.fn(ok)
        renderPt(<Game {...props(guessing, bia, { onSubmitGuess })} />)
        await user.click(screen.getByRole('button', { name: tr.t('game.oneRight') }))
        await user.click(screen.getByRole('button', { name: tr.t('game.oneRight') }))
        await user.click(screen.getByRole('button', { name: tr.t('game.oneLeft') }))
        expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '51')
        screen.getByRole('slider').focus()
        await user.keyboard('{Shift>}{ArrowRight}{/Shift}')
        expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '56')
        await user.click(screen.getByRole('button', { name: new RegExp(tr.t('game.lock')) }))
        expect(onSubmitGuess).toHaveBeenCalledExactlyOnceWith(56)
    })

    it('depois de travar, o dial deixa de ser interativo e mostra o palpite e quem já travou', () => {
        const locked = room('playing', round('guessing', { clue: 'x', clueAt: 2000, targetPosition: null, guesses: { p2: 60 } }), {
            players: players.map(p => (p.id === 'p2' || p.id === 'p3' ? { ...p, hasGuessed: true } : p)),
        })
        renderPt(<Game {...props(locked, { ...bia, hasGuessed: true })} />)
        expect(screen.queryByRole('slider')).toBeNull()
        expect(screen.getByText(tr.t('game.lockedAt', { n: 60 }))).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: new RegExp(tr.t('game.lock')) })).toBeNull()
    })

    it('o Vidente vê o alvo, não tem agulha nem botão de travar e acompanha quantos travaram', () => {
        const seerView = room('playing', round('guessing', { clue: 'x', clueAt: 2000, targetPosition: 62 }), {
            players: players.map(p => (p.id === 'p3' ? { ...p, hasGuessed: true } : p)),
        })
        const { container } = renderPt(<Game {...props(seerView, ana)} />)
        expect(screen.queryByRole('slider')).toBeNull()
        expect(screen.queryByRole('button', { name: new RegExp(tr.t('game.lock')) })).toBeNull()
        expect(Array.from(container.querySelectorAll('svg text')).map(n => n.textContent)).toEqual(['2', '3', '4', '3', '2'])
        expect(screen.getByText('1/2')).toBeInTheDocument()
    })
})

describe('Game: revelação', () => {
    const revealed = room('playing', round('revealed', {
        clue: 'Nuggets de salmão', clueAt: 2000, revealedAt: 3000,
        guesses: { p2: 60, p3: 71 },
        zones: { p2: 4, p3: 0 },
        scores: { p2: 5, p3: 0, p1: 3 },
        closestIds: ['p2'],
    }))

    it('lista a pontuação de cada um, do maior para o menor', () => {
        renderPt(<Game {...props(revealed, bia)} />)
        const list = screen.getByText(tr.t('game.roundResult')).closest('div')!.querySelector('ul')!
        const rows = within(list).getAllByRole('listitem')
        expect(rows.map(r => r.textContent)).toEqual([
            expect.stringContaining('Bia'),
            expect.stringContaining('Ana'),
            expect.stringContaining('Caio'),
        ])
        expect(rows[0]).toHaveTextContent('+5')
        expect(rows[1]).toHaveTextContent('+3')
        expect(rows[2]).toHaveTextContent('+0')
    })

    it('mostra a posição do alvo', () => {
        renderPt(<Game {...props(revealed, bia)} />)
        expect(screen.getByText(tr.t('game.targetAt', { n: 62 }))).toBeInTheDocument()
    })

    it('quem não palpitou aparece com "sem palpite"', () => {
        const noGuess = room('playing', round('revealed', {
            clue: 'x', clueAt: 2000, revealedAt: 3000, guesses: { p2: 60 }, zones: { p2: 4 }, scores: { p2: 5, p1: 3 }, closestIds: ['p2'],
        }))
        renderPt(<Game {...props(noGuess, bia)} />)
        expect(screen.getByText(tr.t('game.noGuess'))).toBeInTheDocument()
    })

    it('"Pronto" avisa o servidor e depois vira o selo de pronto', async () => {
        const user = userEvent.setup()
        const onSetReady = vi.fn()
        const { rerender } = renderPt(<Game {...props(revealed, bia, { onSetReady })} />)
        await user.click(screen.getByRole('button', { name: new RegExp(tr.t('game.ready')) }))
        expect(onSetReady).toHaveBeenCalledOnce()
        rerender(<Game {...props(revealed, { ...bia, isReady: true }, { onSetReady })} />)
        expect(screen.getByText(tr.t('game.youReady'))).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: new RegExp(tr.t('game.ready')) })).toBeNull()
    })

    it('só o anfitrião vê "Próxima rodada"', async () => {
        const user = userEvent.setup()
        const onNextRound = vi.fn()
        const { unmount } = renderPt(<Game {...props(revealed, bia)} />)
        expect(screen.queryByRole('button', { name: new RegExp(tr.t('game.nextRound')) })).toBeNull()
        unmount()
        renderPt(<Game {...props(revealed, ana, { onNextRound })} />)
        await user.click(screen.getByRole('button', { name: new RegExp(tr.t('game.nextRound')) }))
        expect(onNextRound).toHaveBeenCalledOnce()
    })

    it('mostra a contagem para a próxima rodada', () => {
        renderPt(<Game {...props(revealed, bia, { secondsLeft: 9, timerPhase: 'next' })} />)
        expect(screen.getByText(tr.t('game.nextIn', { n: 9 }).trim())).toBeInTheDocument()
    })
})

describe('Game: cabeçalho da rodada', () => {
    it('mostra o número da rodada e o Vidente', () => {
        const { container } = renderPt(<Game {...props(room('playing', round('waiting_clue')), bia)} />)
        expect(screen.getByText(tr.t('common.round', { n: 4 }))).toBeInTheDocument()
        expect(container.querySelector('.seerChip strong')).toHaveTextContent('Ana')
    })

    it('o placar mostra todos os jogadores', () => {
        renderPt(<Game {...props(room('playing', round('waiting_clue')), bia)} />)
        expect(screen.getByText(tr.t('score.title'))).toBeInTheDocument()
        for (const p of [ana, bia, caio]) expect(screen.getAllByText(p.nickname).length).toBeGreaterThan(0)
    })
})
