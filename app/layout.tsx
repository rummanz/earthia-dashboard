import type { Metadata } from 'next'
import { DM_Mono, Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/shared/providers'
import { Shell } from '@/components/shared/shell'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-dm-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'OpenClaw',
  description: 'Social media content automation dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${dmMono.variable} antialiased`}>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  )
}
