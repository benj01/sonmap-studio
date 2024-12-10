// /lib/stores/auth.ts - Complete rewrite

import { create } from 'zustand'
import { createClient } from '@/utils/supabase/client'

// Only store UI-related auth state, not duplicate Supabase auth
interface AuthUIState {
  isLoading: boolean
  error: string | null
  setError: (error: string | null) => void
  resetError: () => void
}

export const useAuthUI = create<AuthUIState>((set) => ({
  isLoading: false,
  error: null,
  setError: (error) => set({ error }),
  resetError: () => set({ error: null })
}))

// Export Supabase auth utilities for direct usage
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