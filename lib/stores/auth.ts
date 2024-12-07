import { create } from 'zustand'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'

export type User = SupabaseUser

export interface AuthState {
  user: User | null
  isLoading: boolean
  initialized: boolean
  setUser: (user: User | null) => void
  signOut: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  initialized: false,
  setUser: (user) => set({ user }),
  signOut: async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    set({ user: null })
  }
}))