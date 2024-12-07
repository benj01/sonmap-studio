import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UIState } from '@/types/store'

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'system',
      modals: {},
      loadingStates: {},

      setTheme: (theme) => set({ theme }),

      toggleModal: (modalId) => 
        set((state) => ({
          modals: {
            ...state.modals,
            [modalId]: !state.modals[modalId]
          }
        })),

      setLoading: (key, isLoading) =>
        set((state) => ({
          loadingStates: {
            ...state.loadingStates,
            [key]: isLoading
          }
        }))
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({ theme: state.theme })
    }
  )
)