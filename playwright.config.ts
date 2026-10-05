import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'
import type { PrintOptions } from './e2e/fixtures'

// Teste de fluxo com prints: sobe o servidor de verdade (Next + Socket.io),
// joga uma partida com dois navegadores e salva um print de cada tela em
// e2e/prints/<projeto>/. Veja e2e/README.md.

const PORT = Number(process.env.E2E_PORT ?? 3100)
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`

// Com build pronto (CI, ou depois de `npm run build`) usa o servidor de
// produção; sem build, o de desenvolvimento (compila sob demanda, mais lento).
const serverCommand = process.env.E2E_SERVER ?? (existsSync('.next/BUILD_ID') ? 'npm start' : 'npm run dev')

const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }
// Celular pequeno (390px, como o preview estático), com toque, no Chromium.
const mobile = { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } }

export default defineConfig<PrintOptions>({
    testDir: './e2e',
    outputDir: './e2e/test-results',
    timeout: 90_000,
    expect: { timeout: 15_000 },
    fullyParallel: false,
    workers: 1,
    retries: 0,
    forbidOnly: !!process.env.CI,
    reporter: [
        ['list'],
        ['html', { outputFolder: 'e2e/report', open: 'never' }],
    ],
    globalTeardown: './e2e/gallery.ts',
    use: {
        baseURL,
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        // Usa o Chromium que já vem na máquina quando existe (ambiente de nuvem do Claude).
        launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
    },
    projects: [
        { name: 'desktop', use: { ...desktop, theme: 'dark' } },
        { name: 'mobile', use: { ...mobile, theme: 'dark' } },
        { name: 'desktop-claro', use: { ...desktop, theme: 'light' } },
        { name: 'mobile-claro', use: { ...mobile, theme: 'light' } },
    ],
    webServer: process.env.E2E_BASE_URL
        ? undefined
        : {
              command: serverCommand,
              url: baseURL,
              env: { PORT: String(PORT), REDIS_URL: '', NEXT_TELEMETRY_DISABLED: '1' },
              reuseExistingServer: !process.env.CI,
              timeout: 180_000,
              stdout: 'ignore',
              stderr: 'pipe',
          },
})
