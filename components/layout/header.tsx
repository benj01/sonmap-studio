import Link from 'next/link'
import { AuthStatus } from '@/components/auth/auth-status'
import { AuthActions } from '@/components/auth/auth-actions'
import { ThemeSwitcher } from '@/components/theme-switcher'

export function Header() {
  return (
    <header className="border-b">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          Your App
        </Link>

        <div className="flex items-center gap-4">
          <AuthStatus />
          <AuthActions />
          <ThemeSwitcher />
        </div>
      </div>
    </header>
  )
}
