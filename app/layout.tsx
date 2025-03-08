import './globals.css'
import { Inter } from 'next/font/google'
import { Toaster } from 'components/ui/toaster'
import { AuthProvider } from 'components/providers/auth-provider'
import { ThemeProvider } from 'components/providers/theme-provider'
import { Header } from 'components/layout/header'
import { ModalProvider } from 'components/providers/modal-provider'
import { DebugPanel } from '@/components/shared/debug-panel'
import { CoordinateSystemsProvider } from '@/components/providers/coordinate-systems-provider'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Sonmap Studio',
  description: 'Professional 3D Noise Analysis Platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>{metadata.title}</title>
        <meta name="description" content={metadata.description} />
      </head>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <AuthProvider>
            <CoordinateSystemsProvider>
              <div className="relative flex min-h-screen flex-col">
                {/* Global Header */}
                <Header />
                {/* Main Content */}
                <main className="flex-1 bg-background">{children}</main>
              </div>
              <Toaster />
              <ModalProvider />
              <DebugPanel />
            </CoordinateSystemsProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
