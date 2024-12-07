import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  theme: 'light' | 'dark' | 'system'
  isLoginModalOpen: boolean
  isMenuOpen: boolean
  loadingStates: Record<string, boolean>
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  toggleLoginModal: () => void
  toggleMenu: () => void
  setLoading: (key: string, isLoading: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'system',
      isLoginModalOpen: false,
      isMenuOpen: false,
      loadingStates: {},
      setTheme: (theme) => set({ theme }),
      toggleLoginModal: () => set((state) => ({ isLoginModalOpen: !state.isLoginModalOpen })),
      toggleMenu: () => set((state) => ({ isMenuOpen: !state.isMenuOpen })),
      setLoading: (key, isLoading) =>
        set((state) => ({
          loadingStates: {
            ...state.loadingStates,
            [key]: isLoading,
          },
        })),
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({ theme: state.theme }),
    }
  )
)