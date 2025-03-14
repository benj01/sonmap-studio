'use client'

import Link from 'next/link'
import { useAuth } from '@/components/providers/auth-provider'
import { Settings, Home, Map, FolderOpen } from 'lucide-react'

export function SiteNavigation() {
  const { user } = useAuth() // Ensure user authentication state is used

  return (
    <nav className="py-4">
      <ul className="flex flex-col space-y-2">
        {user && (
          <>
            <li>
              <Link href="/dashboard" className="flex items-center p-2 hover:bg-gray-100 rounded-md">
                <Home className="w-5 h-5 mr-2" />
                <span>Dashboard</span>
              </Link>
            </li>
            <li>
              <Link href="/projects" className="flex items-center p-2 hover:bg-gray-100 rounded-md">
                <FolderOpen className="w-5 h-5 mr-2" />
                <span>Projects</span>
              </Link>
            </li>
            <li>
              <Link href="/maps" className="flex items-center p-2 hover:bg-gray-100 rounded-md">
                <Map className="w-5 h-5 mr-2" />
                <span>Maps</span>
              </Link>
            </li>
            <li>
              <Link href="/settings" className="flex items-center p-2 hover:bg-gray-100 rounded-md">
                <Settings className="w-5 h-5 mr-2" />
                <span>Settings</span>
              </Link>
            </li>
          </>
        )}
      </ul>
    </nav>
  )
}
