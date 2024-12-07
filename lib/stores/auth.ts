import { create } from 'zustand'
import type { User } from '@/types/auth'

interface AuthState {
  user: User | null
  isLoginModalOpen: boolean
  setUser: (user: User | null) => void
  setLoginModalOpen: (open: boolean) => void
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  isLoginModalOpen: false,
  setUser: (user) => set({ user }),
  setLoginModalOpen: (open) => set({ isLoginModalOpen: open })
}))
