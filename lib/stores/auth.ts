import { create } from 'zustand'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { persist } from 'zustand/middleware'

interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
  initialized: boolean
  setUser: (user: User | null) => void
  setError: (error: string | null) => void
  setLoading: (loading: boolean) => void
  signOut: () => Promise<void>
  checkUser: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      loading: true,
      error: null,
      initialized: false,
      setUser: (user) => set({ user }),
      setError: (error) => set({ error }),
      setLoading: (loading) => set({ loading }),
      signOut: async () => {
        const supabase = createClient()
        try {
          await supabase.auth.signOut()
          set({ user: null, error: null })
        } catch (error) {
          set({ error: 'Error signing out' })
        }
      },
      checkUser: async () => {
        const supabase = createClient()
        try {
          const { data: { user }, error } = await supabase.auth.getUser()
          if (error) throw error
          set({ user, error: null, loading: false, initialized: true })
        } catch (error) {
          set({ user: null, error: 'Error fetching user', loading: false, initialized: true })
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user }),
    }
  )
)