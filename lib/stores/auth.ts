import { create } from 'zustand'
import type { User as SupabaseUser } from '@supabase/supabase-js'

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
    // Implement signOut logic here
  }
}))
