import type { User } from '@supabase/supabase-js'

// Shared response type for all actions
export type ActionResponse<T = unknown> = {
  success: true
  data?: T
  message?: string
} | {
  success: false
  error: string
  code?: string
}

// Base loading state interface
export interface LoadingState {
  isLoading: boolean
  error: string | null
}

// Serializable user type
export interface SerializableUser {
  id: string
  email?: string | null
  phone?: string | null
  created_at: string
  updated_at: string
  user_metadata: Record<string, any>
  app_metadata: Record<string, any>
}

// Auth store state
export interface AuthState extends LoadingState {
  user: SerializableUser | null
  initialized: boolean
  setUser: (user: User | null) => void
  signOut: () => Promise<void>
  checkUser: () => Promise<void>
  resetError: () => void
}

// UI store state
export interface UIState {
  theme: 'light' | 'dark' | 'system'
  modals: Record<string, boolean>
  loadingStates: Record<string, boolean>
  setTheme: (theme: UIState['theme']) => void
  toggleModal: (modalId: string) => void
  setLoading: (key: string, isLoading: boolean) => void
}

// Cache item interface
export interface CacheItem<T> {
  data: T
  timestamp: number
  error?: string
}

// Data store state
export interface DataState {
  cache: Record<string, CacheItem<unknown>>
  fetchData: <T>(key: string, query: () => Promise<T>, ttl?: number) => Promise<T>
  prefetchData: <T>(key: string, query: () => Promise<T>, ttl?: number) => Promise<void>
  invalidateCache: (key: string) => void
  clearCache: () => void
} 