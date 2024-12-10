import { create } from 'zustand'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  initialized: boolean
  setUser: (user: User | null) => void
  setInitialized: (initialized: boolean) => void
}

interface AuthUIState {
  isLoading: boolean
  error: string | null
  setError: (error: string | null) => void
  resetError: () => void
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  initialized: false,
  setUser: (user) => set({ user }),
  setInitialized: (initialized) => set({ initialized })
}))

export const useAuthUI = create<AuthUIState>((set) => ({
  isLoading: false,
  error: null,
  setError: (error: string | null) => set({ error }),
  resetError: () => set({ error: null })
}))

// Supabase auth utilities
export const supabaseAuth = {
  getUser: async () => {
    const supabase = createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) throw error
    return user
  },

  signOut: async () => {
    const supabase = createClient()
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }
}