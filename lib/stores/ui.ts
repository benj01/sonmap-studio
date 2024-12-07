import { create } from 'zustand'

type Theme = 'light' | 'dark' | 'system'
type ModalId = 'login' | 'register'

interface UIState {
  theme: Theme
  setTheme: (theme: Theme) => void
  modals: Record<ModalId, boolean>
  toggleModal: (modalId: ModalId) => void
}

export const useUIStore = create<UIState>((set) => ({
  theme: 'system',
  setTheme: (theme) => set({ theme }),
  modals: {
    login: false,
    register: false,
  },
  toggleModal: (modalId) => 
    set((state) => ({
      modals: {
        ...state.modals,
        [modalId]: !state.modals[modalId],
      },
    })),
}))