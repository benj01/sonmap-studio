import { create } from 'zustand'
import { apiClient } from '@/lib/api-client'
import type { SignInCredentials, SignUpCredentials } from '@/types/api'

interface AuthState {
  user: any | null
  isLoading: boolean
  error: string | null
  initialized: boolean
  signIn: (credentials: SignInCredentials) => Promise<void>
  signUp: (credentials: SignUpCredentials) => Promise<void>
  signOut: () => Promise<void>
  checkUser: () => Promise<void>
  resetError: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  error: null,
  initialized: false,

  signIn: async (credentials) => {
    set({ isLoading: true, error: null })
    try {
      const { user } = await apiClient.auth.signIn(credentials)
      set({ user, error: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to sign in' })
      throw error
    } finally {
      set({ isLoading: false })
    }
  },

  signUp: async (credentials) => {
    set({ isLoading: true, error: null })
    try {
      const { user } = await apiClient.auth.signUp(credentials)
      set({ user, error: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to sign up' })
      throw error
    } finally {
      set({ isLoading: false })
    }
  },

  signOut: async () => {
    set({ isLoading: true, error: null })
    try {
      await apiClient.auth.signOut()
      set({ user: null, error: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to sign out' })
      throw error
    } finally {
      set({ isLoading: false })
    }
  },

  checkUser: async () => {
    try {
      const { user } = await apiClient.auth.getUser()
      set({ user, initialized: true })
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to get user',
        user: null,
        initialized: true
      })
    } finally {
      set({ isLoading: false })
    }
  },

  resetError: () => set({ error: null })
}))
