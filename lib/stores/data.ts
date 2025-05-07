import { create } from 'zustand'
import type { CacheItem } from '@/types'
import { dbLogger } from '@/utils/logging/dbLogger'

export interface DataState {
  cache: Record<string, CacheItem<unknown>>
  fetchData: <T>(key: string, query: () => Promise<T>, ttl?: number) => Promise<T>
  prefetchData: <T>(key: string, query: () => Promise<T>, ttl?: number) => Promise<void>
  invalidateCache: (key: string) => void
  clearCache: () => void
}

const DEFAULT_TTL = 5 * 60 * 1000 // 5 minutes

export const useDataStore = create<DataState>()((set, get) => ({
  cache: {},

  fetchData: async <T>(
    key: string, 
    query: () => Promise<T>, 
    ttl = DEFAULT_TTL
  ): Promise<T> => {
    const cache = get().cache
    const cachedItem = cache[key] as CacheItem<T> | undefined
    
    // Return cached data if valid
    if (cachedItem && Date.now() - cachedItem.timestamp < ttl) {
      if (cachedItem.error) throw new Error(cachedItem.error)
      return cachedItem.data
    }

    try {
      const data = await query()
      set((state) => ({
        cache: {
          ...state.cache,
          [key]: { 
            data, 
            timestamp: Date.now() 
          }
        }
      }))
      return data
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      set((state) => ({
        cache: {
          ...state.cache,
          [key]: { 
            data: null as T,
            timestamp: Date.now(),
            error: errorMessage
          }
        }
      }))
      throw error
    }
  },

  prefetchData: async <T>(
    key: string,
    query: () => Promise<T>,
    ttl = DEFAULT_TTL
  ): Promise<void> => {
    try {
      await get().fetchData(key, query, ttl)
    } catch (error) {
      await dbLogger.error('Prefetch failed', { key, error, source: 'DataStore.prefetchData' }).catch(() => {})
    }
  },

  invalidateCache: (key: string) =>
    set((state) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [key]: _, ...newCache } = state.cache;
      return { cache: newCache };
    }),

  clearCache: () => set({ cache: {} })
}))