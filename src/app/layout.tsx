import type { Metadata, Viewport } from 'next'
import { Baloo_2, Nunito } from 'next/font/google'
import { cookies, headers } from 'next/headers'
import { THEME_BOOT_SCRIPT } from '@/lib/theme'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, matchLocale, translate, type Locale } from '@/i18n'
import { I18nProvider } from '@/i18n/I18nProvider'
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

/** Interface language for the server render: saved choice, else the browser's Accept-Language. */
function requestLocale(): Locale {
  const saved = cookies().get(LOCALE_COOKIE)?.value
  if (isLocale(saved)) return saved
  return matchLocale(headers().get('accept-language')) ?? DEFAULT_LOCALE
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = requestLocale()
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key)
  return {
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
  const locale = requestLocale()
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className={`${baloo.variable} ${nunito.variable}`}>
        <I18nProvider initialLocale={locale}>{children}</I18nProvider>
      </body>
    </html>
  )
}
