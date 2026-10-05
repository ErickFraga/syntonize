import type { Metadata, Viewport } from 'next'
import { Fredoka, Nunito } from 'next/font/google'
import { cookies, headers } from 'next/headers'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, matchLocale, translate, type Locale } from '@/i18n'
import { I18nProvider } from '@/i18n/I18nProvider'
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

/** Interface language for the server render: saved choice, else the browser's Accept-Language. */
function requestLocale(): Locale {
  const saved = cookies().get(LOCALE_COOKIE)?.value
  if (isLocale(saved)) return saved
  return matchLocale(headers().get('accept-language')) ?? DEFAULT_LOCALE
}

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

export async function generateMetadata(): Promise<Metadata> {
  const locale = requestLocale()
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key)
  return {
    metadataBase: siteUrl(),
    title: {
      default: t('meta.title'),
      template: '%s · Syntonize',
    },
    description: t('meta.description'),
    keywords: ['jogo', 'game', 'juego', 'multiplayer', 'sintonia', 'wavelength', 'party game', 'online'],
    applicationName: 'Syntonize',
    openGraph: {
      title: t('meta.title'),
      description: t('meta.ogDescription'),
      type: 'website',
      locale: t('meta.ogLocale'),
    },
  }
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
  const locale = requestLocale()
  return (
    <html lang={locale}>
      <body className={`${fredoka.variable} ${nunito.variable}`}>
        <I18nProvider initialLocale={locale}>{children}</I18nProvider>
      </body>
    </html>
  )
}
