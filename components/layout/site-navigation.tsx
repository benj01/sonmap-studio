'use client'

import Link from 'next/link'
import { useAuth } from '@/components/providers/auth-provider'

export function SiteNavigation() {
  const { user } = useAuth() // Ensure user authentication state is used

  return (
    <nav>
      <ul>
        {/* Render the Dashboard link only if the user is logged in */}
        {user && (
          <li>
            <Link href="/dashboard">Dashboard</Link>
          </li>
        )}
      </ul>
    </nav>
  )
}
