import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthState, SerializableUser } from '@/types/store'
import { apiClient } from '@/lib/api-client'

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: true,
      error: null,
      initialized: false,

      setUser: (user) => set({ 
        user: user ? {
          id: user.id,
          email: user.email,
          phone: user.phone,
          created_at: user.created_at,
          updated_at: user.updated_at,
          user_metadata: user.user_metadata,
          app_metadata: user.app_metadata
        } : null,
        error: null
      }),

      signIn: async (credentials) => {
        set({ isLoading: true, error: null })
        try {
          const response = await apiClient.auth.signIn(credentials)
          if (response.error) {
            throw new Error(response.error)
          }
          set({ user: response.user })
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to sign in'
          })
        } finally {
          set({ isLoading: false })
        }
      },

      signUp: async (credentials) => {
        set({ isLoading: true, error: null })
        try {
          const response = await apiClient.auth.signUp(credentials)
          if (response.error) {
            throw new Error(response.error)
          }
          set({ user: response.user })
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to sign up'
          })
        } finally {
          set({ isLoading: false })
        }
      },

      signOut: async () => {
        set({ isLoading: true, error: null })
        try {
          await apiClient.auth.signOut()
          set({ user: null })
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to sign out'
          })
        } finally {
          set({ isLoading: false })
        }
      },

      checkUser: async () => {
        if (!set((state) => state.initialized)) {
          set({ isLoading: true, error: null })
          try {
            const user = await apiClient.auth.getUser()
            set({ 
              user: user ? {
                id: user.id,
                email: user.email,
                phone: user.phone,
                created_at: user.created_at,
                updated_at: user.updated_at,
                user_metadata: user.user_metadata,
                app_metadata: user.app_metadata
              } : null,
              initialized: true
            })
          } catch (error) {
            set({ 
              error: error instanceof Error ? error.message : 'Failed to fetch user',
              user: null,
              initialized: true
            })
          } finally {
            set({ isLoading: false })
          }
        }
      },

      resetError: () => set({ error: null })
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ 
        user: state.user,
        initialized: state.initialized
      })
    }
  )
)

</```rewritten_file>