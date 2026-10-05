import type { Metadata, Viewport } from 'next'
import { Fredoka, Nunito } from 'next/font/google'
import './globals.css'

const fredoka = Fredoka({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-fredoka',
  display: 'swap',
})

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-nunito',
  display: 'swap',
})

// Absolute base for og:image and friends. Without it Next falls back to
// http://localhost:PORT in production and link previews break. Render sets
// RENDER_EXTERNAL_URL on its own; elsewhere set SITE_URL.
function siteUrl(): URL | undefined {
  const raw = process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL
  if (!raw) return undefined
  try {
    return new URL(raw)
  } catch {
    return undefined
  }
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: 'Syntonize — leia a mente dos seus amigos',
    template: '%s · Syntonize',
  },
  description:
    'Versão online do jogo de tabuleiro SINTONIA (Wavelength): o Vidente dá uma dica e todo mundo tenta acertar onde está o alvo no espectro.',
  keywords: ['jogo', 'multiplayer', 'sintonia', 'wavelength', 'party game', 'online', 'amigos'],
  applicationName: 'Syntonize',
  openGraph: {
    title: 'Syntonize — leia a mente dos seus amigos',
    description: 'Party game online inspirado no SINTONIA / Wavelength. Crie uma sala e chame a galera.',
    type: 'website',
    locale: 'pt_BR',
  },
}

export const viewport: Viewport = {
  themeColor: '#0d0b1f',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${fredoka.variable} ${nunito.variable}`}>
        {children}
      </body>
    </html>
  )
}
