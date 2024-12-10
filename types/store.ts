// /types/store.ts

import type { User } from '@supabase/supabase-js'

export type CacheItem<T> = {
 data: T
 timestamp: number
 error?: string
}

export interface DataState {
 cache: Record<string, CacheItem<unknown>>
 fetchData: <T>(key: string, query: () => Promise<T>, ttl?: number) => Promise<T>
 prefetchData: <T>(key: string, query: () => Promise<T>, ttl?: number) => Promise<void>
 invalidateCache: (key: string) => void
 clearCache: () => void
}

export interface LoadingState {
 isLoading: boolean
 error: string | null
}

export interface SerializableUser {
 id: string
 email?: string | null
 phone?: string | null
 created_at: string
 updated_at: string
 user_metadata: Record<string, any>
 app_metadata: Record<string, any>
}