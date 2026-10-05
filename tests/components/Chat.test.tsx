import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Chat, { systemText } from '@/components/Chat/Chat'
import { CHAT_LIMITS, CHAT_REACTIONS } from '@shared/types'
import type { ChatMessage } from '@shared/types'
import { ana, bia, ok, renderPt, say, tr } from './fixtures'

const base = { meId: 'p2', playerCount: 3, onSend: ok }

describe('Chat', () => {
    it('sem mensagens mostra o convite para falar', () => {
        renderPt(<Chat {...base} messages={[]} defaultOpen />)
        expect(screen.getByText(tr.t('chat.empty'))).toBeInTheDocument()
    })

    it('mostra o texto de cada um e "Você" nas próprias mensagens', () => {
        renderPt(<Chat {...base} messages={[say(1, ana, 'bora'), say(2, bia, 'fechou')]} defaultOpen />)
        expect(screen.getByText('bora')).toBeInTheDocument()
        expect(screen.getByText('Ana')).toBeInTheDocument()
        expect(screen.getByText('fechou')).toBeInTheDocument()
        expect(screen.getByText(tr.t('common.you'))).toBeInTheDocument()
    })

    it('mensagens do sistema vêm do código, no idioma do leitor', () => {
        const joined: ChatMessage = { id: 's1', at: 1, kind: 'system', code: 'joined', params: { name: 'Duda' } }
        renderPt(<Chat {...base} messages={[joined]} defaultOpen />)
        expect(screen.getByText(systemText(joined, tr.t))).toBeInTheDocument()
        expect(screen.getByText(systemText(joined, tr.t))).toHaveTextContent('Duda')
    })

    it('reações aparecem como emoji', () => {
        const reaction: ChatMessage = { id: 'r1', at: 1, kind: 'reaction', authorId: 'p1', author: 'Ana', colorIndex: 0, emoji: '🔥' }
        renderPt(<Chat {...base} messages={[reaction]} defaultOpen />)
        expect(screen.getByRole('log')).toHaveTextContent('🔥')
    })

    it('envia o texto sem espaços repetidos e limpa o campo', async () => {
        const user = userEvent.setup()
        const onSend = vi.fn(ok)
        renderPt(<Chat {...base} onSend={onSend} messages={[]} defaultOpen />)
        const input = screen.getByLabelText(tr.t('chat.inputLabel'))
        await user.type(input, '  oi   gente  {Enter}')
        expect(onSend).toHaveBeenCalledExactlyOnceWith({ kind: 'text', text: 'oi gente' })
        await vi.waitFor(() => expect(input).toHaveValue(''))
    })

    it('o botão de enviar só habilita com texto', async () => {
        const user = userEvent.setup()
        renderPt(<Chat {...base} messages={[]} defaultOpen />)
        const send = screen.getByRole('button', { name: tr.t('chat.send') })
        expect(send).toBeDisabled()
        await user.type(screen.getByLabelText(tr.t('chat.inputLabel')), 'a')
        expect(send).toBeEnabled()
    })

    it('mostra o contador e limita o tamanho', async () => {
        const user = userEvent.setup()
        renderPt(<Chat {...base} messages={[]} defaultOpen />)
        const input = screen.getByLabelText(tr.t('chat.inputLabel'))
        expect(input).toHaveAttribute('maxlength', String(CHAT_LIMITS.TEXT_MAX))
        await user.type(input, 'abcd')
        expect(screen.getByText(`4/${CHAT_LIMITS.TEXT_MAX}`)).toBeInTheDocument()
    })

    it('uma reação por botão, enviada sem texto', async () => {
        const user = userEvent.setup()
        const onSend = vi.fn(ok)
        renderPt(<Chat {...base} onSend={onSend} messages={[]} defaultOpen />)
        const buttons = screen.getAllByRole('button', { name: /^Reagir/i })
        expect(buttons).toHaveLength(CHAT_REACTIONS.length)
        await user.click(screen.getByRole('button', { name: tr.t('chat.react', { emoji: '😂' }) }))
        expect(onSend).toHaveBeenCalledExactlyOnceWith({ kind: 'reaction', emoji: '😂' })
    })

    it('mostra o erro do servidor e mantém o rascunho', async () => {
        const user = userEvent.setup()
        const onSend = vi.fn(async () => ({ success: false as const, error: { code: 'chat_rate_limited' as const } }))
        renderPt(<Chat {...base} onSend={onSend} messages={[]} defaultOpen />)
        const input = screen.getByLabelText(tr.t('chat.inputLabel'))
        await user.type(input, 'oi{Enter}')
        expect(await screen.findByText(tr.msg({ code: 'chat_rate_limited' }))).toBeInTheDocument()
        expect(input).toHaveValue('oi')
    })

    it('com o texto travado (o Vidente) o campo fica desabilitado, mas as reações seguem', async () => {
        const user = userEvent.setup()
        const onSend = vi.fn(ok)
        renderPt(<Chat {...base} onSend={onSend} messages={[]} defaultOpen textLocked="Você é o Vidente" />)
        const input = screen.getByLabelText(tr.t('chat.inputLabel'))
        expect(input).toBeDisabled()
        expect(input).toHaveAttribute('placeholder', 'Você é o Vidente')
        await user.click(screen.getByRole('button', { name: tr.t('chat.react', { emoji: '🔥' }) }))
        expect(onSend).toHaveBeenCalledWith({ kind: 'reaction', emoji: '🔥' })
    })

    describe('botão flutuante e não lidas', () => {
        it('conta só as mensagens novas dos outros, não as do histórico nem as do sistema', () => {
            const { rerender } = renderPt(<Chat {...base} messages={[say(1, ana, 'histórico')]} />)
            expect(screen.getByRole('button', { name: tr.t('chat.open') })).toBeInTheDocument()
            rerender(<Chat {...base} messages={[say(1, ana, 'histórico'), say(2, ana, 'nova')]} />)
            expect(screen.getByRole('button', { name: tr.t('chat.openUnread', { count: 1 }) })).toBeInTheDocument()
            rerender(<Chat {...base} messages={[say(1, ana, 'histórico'), say(2, ana, 'nova'), say(3, bia, 'minha')]} />)
            expect(screen.getByRole('button', { name: tr.t('chat.openUnread', { count: 1 }) })).toBeInTheDocument()
        })

        it('abrir zera o contador; Esc e o X fecham', async () => {
            const user = userEvent.setup()
            const { container, rerender } = renderPt(<Chat {...base} messages={[say(1, ana, 'oi')]} />)
            rerender(<Chat {...base} messages={[say(1, ana, 'oi'), say(2, ana, 'oi de novo')]} />)
            await user.click(screen.getByRole('button', { name: tr.t('chat.openUnread', { count: 1 }) }))
            expect(container.firstElementChild).toHaveClass('open')
            // Aberto, tudo está visto: o botão volta ao rótulo sem contador.
            expect(screen.getByRole('button', { name: tr.t('chat.open') })).toBeInTheDocument()
            await user.keyboard('{Escape}')
            expect(container.firstElementChild).not.toHaveClass('open')
            await user.click(screen.getByRole('button', { name: tr.t('chat.open') }))
            await user.click(screen.getByRole('button', { name: tr.t('chat.close') }))
            expect(container.firstElementChild).not.toHaveClass('open')
        })
    })
})
