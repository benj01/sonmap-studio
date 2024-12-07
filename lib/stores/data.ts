import { create } from 'zustand'
import { createClient } from '@/utils/supabase/client'

interface CacheItem<T> {
  data: T
  timestamp: number
}

interface DataState {
  cache: Record<string, CacheItem<any>>
  fetchData: <T>(key: string, query: () => Promise<T>, ttl?: number) => Promise<T>
  invalidateCache: (key: string) => void
  clearCache: () => void
}

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes default TTL

export const useDataStore = create<DataState>()((set, get) => ({
  cache: {},
  fetchData: async <T>(key: string, query: () => Promise<T>, ttl = CACHE_TTL): Promise<T> => {
    const cache = get().cache
    const cachedItem = cache[key]
    
    if (cachedItem && Date.now() - cachedItem.timestamp < ttl) {
      return cachedItem.data
    }

    try {
      const data = await query()
      set((state) => ({
        cache: {
          ...state.cache,
          [key]: { data, timestamp: Date.now() },
        },
      }))
      return data
    } catch (error) {
      throw error
    }
  },
  invalidateCache: (key: string) =>
    set((state) => {
      const newCache = { ...state.cache }
      delete newCache[key]
      return { cache: newCache }
    }),
  clearCache: () => set({ cache: {} }),
}))