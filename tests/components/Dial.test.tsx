import { cleanup, fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Dial from '@/components/Dial/Dial'
import { renderPt, tr } from './fixtures'

// Mesma geometria do Dial (unidades do viewBox).
const CX = 200
const CY = 212
const R = 184
const VB = { x: -30, y: -46, w: 460, h: 278 }

/** Dá ao SVG o tamanho do viewBox (escala 1) e devolve o ponto de tela de uma posição 0–100 do arco. */
function screenPoint(svg: Element, position: number, radius = R * 0.6) {
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: VB.w, height: VB.h, right: VB.w, bottom: VB.h, x: 0, y: 0, toJSON: () => ({}) })
    const a = Math.PI - (position / 100) * Math.PI
    return { clientX: CX + radius * Math.cos(a) - VB.x, clientY: CY - radius * Math.sin(a) - VB.y }
}

describe('Dial', () => {
    it('sem interação é uma imagem, sem foco e sem valor de slider', () => {
        renderPt(<Dial target={null} needle={50} />)
        const dial = screen.getByRole('img', { name: tr.t('dial.image') })
        expect(dial).not.toHaveAttribute('aria-valuenow')
        expect(dial).toHaveAttribute('tabindex', '-1')
    })

    it('interativo vira slider 0–100 com o valor da agulha', () => {
        renderPt(<Dial target={null} needle={37} interactive />)
        const dial = screen.getByRole('slider', { name: tr.t('dial.slider') })
        expect(dial).toHaveAttribute('aria-valuemin', '0')
        expect(dial).toHaveAttribute('aria-valuemax', '100')
        expect(dial).toHaveAttribute('aria-valuenow', '37')
    })

    it('o rótulo informado vence o nome padrão', () => {
        renderPt(<Dial target={null} needle={50} label="Rodada 3" />)
        expect(screen.getByRole('img', { name: 'Rodada 3' })).toBeInTheDocument()
    })

    describe('teclado', () => {
        const press = (key: string, extra: object = {}, needle = 50) => {
            cleanup() // um render por chamada; vários `press` no mesmo teste
            const onNeedleChange = vi.fn()
            renderPt(<Dial target={null} needle={needle} interactive onNeedleChange={onNeedleChange} />)
            fireEvent.keyDown(screen.getByRole('slider'), { key, ...extra })
            return onNeedleChange
        }

        it('setas andam 1 por vez', () => {
            expect(press('ArrowRight')).toHaveBeenCalledWith(51)
            expect(press('ArrowUp')).toHaveBeenCalledWith(51)
            expect(press('ArrowLeft')).toHaveBeenCalledWith(49)
            expect(press('ArrowDown')).toHaveBeenCalledWith(49)
        })

        it('Shift anda 5', () => {
            expect(press('ArrowRight', { shiftKey: true })).toHaveBeenCalledWith(55)
            expect(press('ArrowLeft', { shiftKey: true })).toHaveBeenCalledWith(45)
        })

        it('Home e End vão às pontas', () => {
            expect(press('Home')).toHaveBeenCalledWith(0)
            expect(press('End')).toHaveBeenCalledWith(100)
        })

        it('não passa de 0 nem de 100', () => {
            expect(press('ArrowLeft', {}, 0)).toHaveBeenCalledWith(0)
            expect(press('ArrowRight', { shiftKey: true }, 98)).toHaveBeenCalledWith(100)
        })

        it('ignora outras teclas', () => {
            expect(press('a')).not.toHaveBeenCalled()
        })

        it('ignora o teclado quando não é interativo ou não há agulha', () => {
            const onNeedleChange = vi.fn()
            const { unmount } = renderPt(<Dial target={null} needle={50} onNeedleChange={onNeedleChange} />)
            fireEvent.keyDown(screen.getByRole('img'), { key: 'ArrowRight' })
            unmount()
            renderPt(<Dial target={null} needle={null} interactive onNeedleChange={onNeedleChange} />)
            fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
            expect(onNeedleChange).not.toHaveBeenCalled()
        })
    })

    describe('toque e arrasto', () => {
        it('o ponto tocado vira o ângulo da agulha (0 à esquerda, 100 à direita)', () => {
            const onNeedleChange = vi.fn()
            renderPt(<Dial target={null} needle={50} interactive onNeedleChange={onNeedleChange} />)
            const dial = screen.getByRole('slider')
            for (const position of [0, 25, 50, 80, 100]) {
                fireEvent.pointerDown(dial, screenPoint(dial, position))
                expect(onNeedleChange).toHaveBeenLastCalledWith(position)
                fireEvent.pointerUp(dial)
            }
        })

        it('abaixo do cubo a agulha vai para a ponta mais próxima', () => {
            const onNeedleChange = vi.fn()
            renderPt(<Dial target={null} needle={50} interactive onNeedleChange={onNeedleChange} />)
            const dial = screen.getByRole('slider')
            screenPoint(dial, 50)
            fireEvent.pointerDown(dial, { clientX: 100 - VB.x, clientY: CY - VB.y + 40 })
            expect(onNeedleChange).toHaveBeenLastCalledWith(0)
            fireEvent.pointerUp(dial)
            fireEvent.pointerDown(dial, { clientX: 300 - VB.x, clientY: CY - VB.y + 40 })
            expect(onNeedleChange).toHaveBeenLastCalledWith(100)
        })

        it('arrastar acompanha o dedo e soltar confirma a última posição', () => {
            const onNeedleChange = vi.fn()
            const onNeedleCommit = vi.fn()
            // A agulha é controlada pelo pai: o commit lê a posição mais recente.
            const { rerender } = renderPt(<Dial target={null} needle={50} interactive onNeedleChange={onNeedleChange} onNeedleCommit={onNeedleCommit} />)
            const dial = screen.getByRole('slider')
            fireEvent.pointerDown(dial, screenPoint(dial, 20))
            fireEvent.pointerMove(dial, screenPoint(dial, 35))
            expect(onNeedleChange.mock.calls.map(c => c[0])).toEqual([20, 35])
            rerender(<Dial target={null} needle={35} interactive onNeedleChange={onNeedleChange} onNeedleCommit={onNeedleCommit} />)
            fireEvent.pointerUp(dial)
            expect(onNeedleCommit).toHaveBeenCalledExactlyOnceWith(35)
        })

        it('mover sem ter tocado antes não mexe na agulha', () => {
            const onNeedleChange = vi.fn()
            renderPt(<Dial target={null} needle={50} interactive onNeedleChange={onNeedleChange} />)
            const dial = screen.getByRole('slider')
            fireEvent.pointerMove(dial, screenPoint(dial, 30))
            expect(onNeedleChange).not.toHaveBeenCalled()
        })

        it('travado ou só de leitura, tocar não faz nada', () => {
            const onNeedleChange = vi.fn()
            renderPt(<Dial target={null} needle={50} onNeedleChange={onNeedleChange} />)
            const dial = screen.getByRole('img')
            fireEvent.pointerDown(dial, screenPoint(dial, 30))
            expect(onNeedleChange).not.toHaveBeenCalled()
        })
    })

    describe('alvo e tampa', () => {
        it('mostra a cunha 2 | 3 | 4 | 3 | 2 quando o alvo é conhecido', () => {
            const { container } = renderPt(<Dial target={50} needle={null} />)
            const labels = Array.from(container.querySelectorAll('text')).map(n => n.textContent)
            expect(labels).toEqual(['2', '3', '4', '3', '2'])
        })

        it('esconde a cunha sem alvo', () => {
            const { container } = renderPt(<Dial target={null} needle={null} />)
            expect(container.querySelector('text')).toBeNull()
        })

        it('coberto desenha a tampa com "?"; sem a tampa não há "?"', () => {
            const { container, rerender } = renderPt(<Dial target={50} covered needle={null} />)
            expect(container.querySelector('clipPath#dialLidClip')).not.toBeNull()
            expect(container.textContent).toContain('?')
            rerender(<Dial target={50} covered={false} needle={null} />)
            // Quem já viu a tampa a vê abrir (continua no DOM, com a classe de abertura).
            expect(container.querySelector('clipPath#dialLidClip')).not.toBeNull()
            expect(container.querySelector('[class*="lidOpen"]')).not.toBeNull()
        })

        it('quem nunca teve a tampa (o Vidente) não a recebe na revelação', () => {
            const { container } = renderPt(<Dial target={50} covered={false} needle={null} />)
            expect(container.querySelector('clipPath#dialLidClip')).toBeNull()
        })

        it('a cópia compacta nunca tem tampa', () => {
            const { container } = renderPt(<Dial target={50} covered compact needle={null} />)
            expect(container.querySelector('clipPath#dialLidClip')).toBeNull()
        })
    })

    describe('agulha e marcadores', () => {
        it('a agulha gira de -90° (0) a +90° (100)', () => {
            const angle = (needle: number) => {
                const { container, unmount } = renderPt(<Dial target={null} needle={needle} />)
                const g = container.querySelector<SVGGElement>('[class*="needle"]')!
                const deg = g.style.transform
                unmount()
                return deg
            }
            expect(angle(0)).toBe('rotate(-90deg)')
            expect(angle(50)).toBe('rotate(0deg)')
            expect(angle(100)).toBe('rotate(90deg)')
        })

        it('needle nulo some com a agulha', () => {
            const { container } = renderPt(<Dial target={null} needle={null} />)
            expect(container.querySelector('[class*="needleBody"]')).toBeNull()
        })

        it('desenha um marcador por palpite, com as iniciais do jogador', () => {
            const markers = [
                { id: 'p2', name: 'Bia Souza', colorIndex: 1, position: 60 },
                { id: 'p3', name: 'Caio', colorIndex: 2, position: 71, dim: true },
            ]
            const { container } = renderPt(<Dial target={62} needle={null} markers={markers} />)
            expect(container.querySelectorAll('g.marker').length).toBe(2)
            expect(container.querySelectorAll('[class*="markerDim"]').length).toBe(1)
            expect(container.querySelector('[class*="markerText"]')?.textContent).toBe('BS')
        })

        it('na cópia compacta os marcadores são pontos sem iniciais', () => {
            const { container } = renderPt(<Dial target={62} needle={null} compact markers={[{ id: 'p2', name: 'Bia', colorIndex: 1, position: 60 }]} />)
            expect(container.querySelectorAll('[class*="markerStatic"]').length).toBe(1)
            expect(container.querySelector('[class*="markerText"]')).toBeNull()
        })
    })
})
