import { create } from 'zustand'
import { getClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { persist } from 'zustand/middleware'

// Serializable error type
interface AuthErrorState {
  message: string
  code?: string
}

// Serializable user type
interface SerializableUser {
  id: string
  email?: string
  phone?: string
  created_at?: string
  updated_at?: string
  user_metadata?: Record<string, any>
}

interface AuthState {
  user: SerializableUser | null
  loading: boolean
  error: AuthErrorState | null
  initialized: boolean
  setUser: (user: User | null) => void
  setError: (error: AuthErrorState | null) => void
  setLoading: (loading: boolean) => void
  signOut: () => Promise<void>
  checkUser: () => Promise<void>
  resetError: () => void
}

// Convert Supabase User to serializable user
const toSerializableUser = (user: User | null): SerializableUser | null => {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    created_at: user.created_at,
    updated_at: user.updated_at,
    user_metadata: user.user_metadata
  };
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      loading: true,
      error: null,
      initialized: false,
      
      setUser: (user) => set({ user: toSerializableUser(user) }),
      setError: (error) => set({ error }),
      setLoading: (loading) => set({ loading }),
      resetError: () => set({ error: null }),
      
      signOut: async () => {
        const supabase = getClient()
        set({ loading: true, error: null })
        try {
          const { error } = await supabase.auth.signOut()
          if (error) throw error
          set({ user: null, error: null })
        } catch (error: any) {
          set({ 
            error: { 
              message: error.message || 'Error signing out',
              code: error.code
            } 
          })
        } finally {
          set({ loading: false })
        }
      },

      checkUser: async () => {
        const supabase = getClient()
        set({ loading: true, error: null })
        try {
          const { data: { user }, error } = await supabase.auth.getUser()
          if (error) throw error
          set({ 
            user: toSerializableUser(user), 
            error: null, 
            loading: false, 
            initialized: true 
          })
        } catch (error: any) {
          set({ 
            user: null, 
            error: { 
              message: error.message || 'Error fetching user',
              code: error.code
            },
            loading: false, 
            initialized: true 
          })
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user }),
    }
  )
)