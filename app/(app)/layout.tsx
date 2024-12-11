import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    redirect('/sign-in')
  }

  return children
}