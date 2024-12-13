import { create } from 'zustand';

export type Theme = 'light' | 'dark' | 'system';
export type ModalId = 'login' | 'register';

export interface UIState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  modals: Record<ModalId, boolean>;
  toggleModal: (modalId: ModalId) => void;
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
}));