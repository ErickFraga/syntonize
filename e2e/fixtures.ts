import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { test as base, expect, type Browser, type BrowserContextOptions, type Page, type TestInfo } from '@playwright/test'

export { expect }

export type Theme = 'dark' | 'light'

export interface PrintOptions {
    /** Tema do app em todos os navegadores do teste (vem do projeto no playwright.config). */
    theme: Theme
}

export const PRINTS_DIR = path.join(__dirname, 'prints')

/** Um jogador: navegador próprio (contexto isolado, com seu localStorage) e uma aba. */
export interface Player {
    name: string
    page: Page
    /** Salva o print desta tela e confere que ela não rola na horizontal. */
    print: (step: string) => Promise<void>
}

interface Fixtures {
    newPlayer: (name: string) => Promise<Player>
}

/**
 * Erros de JS e `console.error` derrubam o teste: um print bonito com a tela
 * quebrada por trás não vale.
 */
const IGNORED_CONSOLE = [
    /Failed to load resource/i, // favicon/áudio em headless
    /AudioContext/i,
]

export const test = base.extend<Fixtures & PrintOptions>({
    theme: ['dark', { option: true }],

    newPlayer: async ({ browser, theme }, use, testInfo) => {
        const contexts: Awaited<ReturnType<Browser['newContext']>>[] = []
        const problems: string[] = []
        let shot = 0

        const create = async (name: string): Promise<Player> => {
            const context = await browser.newContext(contextOptionsFrom(testInfo))
            contexts.push(context)
            // Tema escolhido e música desligada antes do primeiro paint.
            await context.addInitScript(([t]) => {
                try {
                    localStorage.setItem('syntonize:theme', t)
                    localStorage.setItem('syntonize:music', JSON.stringify({ on: false, volume: 0.3 }))
                } catch {
                    /* sem storage */
                }
            }, [theme])
            const page = await context.newPage()
            page.on('pageerror', err => problems.push(`[${name}] erro de JS: ${err.message}`))
            page.on('console', message => {
                if (message.type() !== 'error') return
                const text = message.text()
                if (IGNORED_CONSOLE.some(re => re.test(text))) return
                problems.push(`[${name}] console.error: ${text}`)
            })

            const print = async (step: string) => {
                await page.evaluate(() => document.fonts.ready)
                const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
                expect(overflow, `"${step}" rola na horizontal (${overflow}px a mais)`).toBeLessThanOrEqual(0)

                shot += 1
                const file = `${String(shot).padStart(2, '0')}-${slug(step)}.png`
                const dir = path.join(PRINTS_DIR, testInfo.project.name)
                mkdirSync(dir, { recursive: true })
                const target = path.join(dir, file)
                await page.screenshot({ path: target, fullPage: true, animations: 'disabled', caret: 'hide' })
                await testInfo.attach(`${testInfo.project.name} · ${step}`, { path: target, contentType: 'image/png' })
            }

            return { name, page, print }
        }

        await use(create)

        await Promise.all(contexts.map(c => c.close()))
        expect(problems, 'erros no navegador durante o fluxo').toEqual([])
    },
})

/** Repete viewport, toque, idioma etc. do projeto nos contextos extras. */
function contextOptionsFrom(testInfo: TestInfo): BrowserContextOptions {
    const u = testInfo.project.use
    return {
        baseURL: u.baseURL,
        viewport: u.viewport,
        deviceScaleFactor: u.deviceScaleFactor,
        isMobile: u.isMobile,
        hasTouch: u.hasTouch,
        userAgent: u.userAgent,
        locale: u.locale,
        timezoneId: u.timezoneId,
    }
}

function slug(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
}

/** Arrasta o ponteiro do dial com o mouse/dedo, como um jogador faz. */
export async function dragDial(page: Page, fraction: number): Promise<void> {
    const dial = page.getByRole('slider', { name: 'Ponteiro do espectro' })
    const box = await dial.boundingBox()
    if (!box) throw new Error('dial sem tamanho')
    // O pivô fica embaixo, no centro; o arco de cima vai de 0 (esquerda) a 100 (direita).
    const cx = box.x + box.width / 2
    const cy = box.y + box.height * 0.9
    const r = box.width * 0.35
    const angle = Math.PI * (1 - fraction)
    await page.mouse.move(cx, cy - r)
    await page.mouse.down()
    await page.mouse.move(cx + r * Math.cos(angle), cy - r * Math.sin(angle), { steps: 12 })
    await page.mouse.up()
}
