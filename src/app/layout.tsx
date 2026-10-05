import type { Metadata, Viewport } from 'next'
import { Baloo_2, Nunito } from 'next/font/google'
import { THEME_BOOT_SCRIPT } from '@/lib/theme'
import './globals.css'

const baloo = Baloo_2({
  subsets: ['latin'],
  weight: ['800'],
  variable: '--font-baloo',
  display: 'swap',
})

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['600', '700', '800', '900'],
  variable: '--font-nunito',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Syntonize — leia a mente dos seus amigos',
    template: '%s · Syntonize',
  },
  description:
    'Versão online do jogo de tabuleiro SINTONIA (Wavelength): o Vidente dá uma dica e todo mundo tenta acertar onde está o alvo no mostrador.',
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
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#271A3A' },
    { media: '(prefers-color-scheme: light)', color: '#271A3A' },
  ],
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
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className={`${baloo.variable} ${nunito.variable}`}>
        {children}
      </body>
    </html>
  )
}
