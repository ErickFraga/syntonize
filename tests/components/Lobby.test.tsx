import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Lobby from '@/components/Lobby/Lobby'
import LanguageSelect from '@/components/LanguageSelect/LanguageSelect'
import { LOCALE_NAMES, LOCALE_STORAGE_KEY } from '@/i18n'
import { I18nProvider } from '@/i18n/I18nProvider'
import { DEFAULT_SETTINGS, LIMITS, SETTINGS_OPTIONS } from '@shared/types'
import type { Player, Room, RoomSettings } from '@shared/types'
import { render } from '@testing-library/react'
import { ana, bia, caio, player, players, renderPt, room, tr } from './fixtures'

function lobbyRoom(extra: Partial<Room> = {}, settings: Partial<RoomSettings> = {}) {
    return room('waiting', null, { settings: { ...DEFAULT_SETTINGS, ...settings }, ...extra })
}

function props(r: Room, me: Player, overrides: Partial<Parameters<typeof Lobby>[0]> = {}) {
    return {
        room: r, me, isHost: me.isHost,
        onStartGame: vi.fn(), onKickPlayer: vi.fn(), onUpdateSettings: vi.fn(), onSetTeam: vi.fn(), onShuffleTeams: vi.fn(), onNotify: vi.fn(),
        ...overrides,
    }
}

describe('Lobby', () => {
    it('mostra o código da sala e a lista de jogadores com o anfitrião e "você"', () => {
        renderPt(<Lobby {...props(lobbyRoom(), bia)} />)
        expect(screen.getByText('K7PX2Q')).toBeInTheDocument()
        expect(screen.getByText('Ana')).toBeInTheDocument()
        expect(screen.getByText(tr.t('lobby.host'))).toBeInTheDocument()
        expect(screen.getByText(tr.t('common.you'))).toBeInTheDocument()
        expect(screen.getByText(`${players.length}/${LIMITS.MAX_PLAYERS}`)).toBeInTheDocument()
    })

    it('jogador desconectado aparece como reconectando', () => {
        const r = lobbyRoom({ players: [ana, bia, { ...caio, isConnected: false }] })
        renderPt(<Lobby {...props(r, ana)} />)
        expect(screen.getByText(tr.t('common.reconnecting'))).toBeInTheDocument()
    })

    describe('anfitrião', () => {
        it('começa a partida quando há jogadores suficientes', async () => {
            const user = userEvent.setup()
            const p = props(lobbyRoom(), ana)
            renderPt(<Lobby {...p} />)
            await user.click(screen.getByRole('button', { name: tr.t('lobby.start') }))
            expect(p.onStartGame).toHaveBeenCalledOnce()
        })

        it('com poucos jogadores o botão fica desabilitado e diz quantos faltam', () => {
            const r = lobbyRoom({ players: [ana] })
            renderPt(<Lobby {...props(r, ana)} />)
            const start = screen.getByRole('button', { name: tr.t('lobby.missing', { count: LIMITS.MIN_PLAYERS - 1 }) })
            expect(start).toBeDisabled()
            expect(screen.getByText(tr.t('lobby.waitingMore'))).toBeInTheDocument()
        })

        it('só conta quem está conectado', () => {
            const r = lobbyRoom({ players: [ana, { ...bia, isConnected: false }] })
            renderPt(<Lobby {...props(r, ana)} />)
            expect(screen.getByRole('button', { name: tr.t('lobby.missing', { count: 1 }) })).toBeDisabled()
        })

        it('expulsa outro jogador, mas não tem botão para se expulsar', async () => {
            const user = userEvent.setup()
            const p = props(lobbyRoom(), ana)
            renderPt(<Lobby {...p} />)
            expect(screen.queryByRole('button', { name: tr.t('lobby.remove', { name: 'Ana' }) })).toBeNull()
            await user.click(screen.getByRole('button', { name: tr.t('lobby.remove', { name: 'Bia' }) }))
            expect(p.onKickPlayer).toHaveBeenCalledExactlyOnceWith('p2')
        })

        it('muda uma regra numérica pelo botão da opção', async () => {
            const user = userEvent.setup()
            const p = props(lobbyRoom(), ana)
            renderPt(<Lobby {...p} />)
            const group = screen.getByRole('radiogroup', { name: tr.t('settings.targetScore') })
            const options = within(group).getAllByRole('radio')
            expect(options.map(o => o.textContent)).toEqual(SETTINGS_OPTIONS.targetScore.map(String))
            expect(within(group).getByRole('radio', { checked: true })).toHaveTextContent(String(DEFAULT_SETTINGS.targetScore))
            const other = SETTINGS_OPTIONS.targetScore.find(v => v !== DEFAULT_SETTINGS.targetScore)!
            await user.click(within(group).getByRole('radio', { name: String(other) }))
            expect(p.onUpdateSettings).toHaveBeenCalledExactlyOnceWith({ targetScore: other })
        })

        it('troca para o modo em equipes', async () => {
            const user = userEvent.setup()
            const p = props(lobbyRoom(), ana)
            renderPt(<Lobby {...p} />)
            await user.click(screen.getByRole('radio', { name: tr.t('lobby.modeTeams') }))
            expect(p.onUpdateSettings).toHaveBeenCalledExactlyOnceWith({ mode: 'teams' })
        })
    })

    describe('convidado', () => {
        it('não começa a partida: espera o anfitrião', () => {
            renderPt(<Lobby {...props(lobbyRoom(), bia)} />)
            expect(screen.queryByRole('button', { name: tr.t('lobby.start') })).toBeNull()
            expect(screen.getByText(tr.t('lobby.waitingHost'))).toBeInTheDocument()
            expect(screen.getByText(tr.t('lobby.hostOnly'))).toBeInTheDocument()
        })

        it('as regras ficam travadas e ele não expulsa ninguém', () => {
            renderPt(<Lobby {...props(lobbyRoom(), bia)} />)
            for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled()
            expect(screen.queryByRole('button', { name: tr.t('lobby.remove', { name: 'Ana' }) })).toBeNull()
        })
    })

    describe('modo em equipes', () => {
        const teams = { mode: 'teams' as const }

        it('sem 2 conectados por time o início fica bloqueado', () => {
            const r = lobbyRoom({ players: [{ ...ana, team: 0 }, { ...bia, team: 0 }, { ...caio, team: 0 }] }, teams)
            renderPt(<Lobby {...props(r, ana)} />)
            expect(screen.getByRole('button', { name: tr.t('lobby.perTeam', { min: 2 }) })).toBeDisabled()
        })

        it('com dois por time o início é liberado', () => {
            const four = [ana, bia, caio, player('p4', 'Duda', 3)].map((p, i) => ({ ...p, team: (i % 2) as 0 | 1 }))
            renderPt(<Lobby {...props(lobbyRoom({ players: four }, teams), ana)} />)
            expect(screen.getByRole('button', { name: tr.t('lobby.start') })).toBeEnabled()
        })

        it('"Embaralhar times" só aparece para o anfitrião e avisa o servidor', async () => {
            const user = userEvent.setup()
            const guest = props(lobbyRoom({}, teams), bia)
            const { unmount } = renderPt(<Lobby {...guest} />)
            expect(screen.queryByRole('button', { name: new RegExp(tr.t('teams.shuffle')) })).toBeNull()
            unmount()
            const host = props(lobbyRoom({}, teams), ana)
            renderPt(<Lobby {...host} />)
            await user.click(screen.getByRole('button', { name: new RegExp(tr.t('teams.shuffle')) }))
            expect(host.onShuffleTeams).toHaveBeenCalledOnce()
        })

        it('mostra a opção de compensação só em equipes', () => {
            const { unmount } = renderPt(<Lobby {...props(lobbyRoom(), ana)} />)
            expect(screen.queryByRole('radiogroup', { name: tr.t('lobby.catchUp') })).toBeNull()
            unmount()
            renderPt(<Lobby {...props(lobbyRoom({}, teams), ana)} />)
            expect(screen.getByRole('radiogroup', { name: tr.t('lobby.catchUp') })).toBeInTheDocument()
        })
    })

    describe('copiar', () => {
        it('copia o código e avisa; se a área de transferência falhar, avisa também', async () => {
            const user = userEvent.setup()
            const p = props(lobbyRoom(), ana)
            renderPt(<Lobby {...p} />)
            const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValueOnce()
            await user.click(screen.getByTitle(tr.t('lobby.copyCode')))
            expect(writeText).toHaveBeenCalledWith('K7PX2Q')
            expect(p.onNotify).toHaveBeenLastCalledWith(tr.t('lobby.codeCopied'), 'success')

            writeText.mockRejectedValueOnce(new Error('negado'))
            await user.click(screen.getByTitle(tr.t('lobby.copyCode')))
            expect(p.onNotify).toHaveBeenLastCalledWith(tr.t('lobby.copyFailed'), 'warning')
        })

        it('copia o link de convite com o código da sala', async () => {
            const user = userEvent.setup()
            const p = props(lobbyRoom(), ana)
            renderPt(<Lobby {...p} />)
            const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
            await user.click(screen.getByRole('button', { name: tr.t('lobby.copyLink') }))
            expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/join/K7PX2Q`)
        })
    })
})

describe('LanguageSelect', () => {
    it('mostra um botão por idioma, marca o atual e troca o do app', async () => {
        const user = userEvent.setup()
        window.localStorage.clear()
        render(
            <I18nProvider initialLocale="pt-BR">
                <LanguageSelect />
            </I18nProvider>,
        )
        const group = screen.getByRole('radiogroup')
        expect(within(group).getAllByRole('radio').length).toBeGreaterThanOrEqual(3)
        await user.click(within(group).getByRole('radio', { name: LOCALE_NAMES.en }))
        expect(within(group).getByRole('radio', { name: LOCALE_NAMES.en })).toBeChecked()
        expect(within(group).getByRole('radio', { name: LOCALE_NAMES['pt-BR'] })).not.toBeChecked()
        expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
        expect(document.documentElement.lang).toBe('en')
    })
})
