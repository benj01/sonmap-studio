import { AuthProvider } from '@/components/providers/auth-provider'
import { ModalProvider } from '@/components/providers/modal-provider'
import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Header />
          <main className="flex-1">
            {children}
          </main>
          <Footer />
          <ModalProvider />
        </AuthProvider>
      </body>
    </html>
  )
}
