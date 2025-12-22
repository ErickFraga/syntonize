import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

export const metadata: Metadata = {
  title: "Syntonize - Jogo de Adivinhação Multiplayer",
  description: "Leia a mente dos seus amigos! Versão web do jogo de tabuleiro SINTONIA (Wavelength).",
  keywords: ["jogo", "multiplayer", "sintonia", "wavelength", "adivinhação", "party game"],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR">
      <body className={inter.variable}>
        {children}
      </body>
    </html>
  )
}
