import { GeistSans } from 'geist/font/sans'
import { ThemeProvider } from '../components/providers/theme-provider'
import { AuthProvider } from '../components/providers/auth-provider'
import { ModalProvider } from '../components/providers/modal-provider'
import { Header } from '../components/layout/header'
import { Footer } from '../components/layout/footer'
import { Toaster } from '../components/ui'
import './globals.css'

export const metadata = {
  title: 'Sonmap Studio',
  description: 'Project management and collaboration platform',
}

interface RootLayoutProps {
  children: React.ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={GeistSans.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <div className="relative flex min-h-screen flex-col">
              <Header />
              <main className="flex-1">
                {children}
              </main>
              <Footer />
              <ModalProvider />
              <Toaster />
            </div>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}