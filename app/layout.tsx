import './globals.css'
import { Inter } from 'next/font/google'
import { Toaster } from '@/components/ui/toaster'
import { AuthProvider } from '@/components/providers/auth-provider'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { Header } from '@/components/layout/header'
import { SiteNavigation } from '@/components/layout/site-navigation'
import { ModalProvider } from '@/components/providers/modal-provider'

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
            <div className="relative flex min-h-screen flex-col">
              <Header />
              <div className="flex flex-1">
                <SiteNavigation />
                <main className="flex-1 bg-background">
                  {children}
                </main>
              </div>
            </div>
            <Toaster />
            <ModalProvider /> {/* Added ModalProvider here */}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
