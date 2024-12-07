import { create } from 'zustand'

export interface User {
  id: string
  email: string
  role?: string
}

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
