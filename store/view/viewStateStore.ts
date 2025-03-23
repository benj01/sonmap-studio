import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'viewStateStore';
const logManager = LogManager.getInstance();

const logger = {
  info: (message: string, data?: any) => {
    logManager.info(SOURCE, message, data);
  },
  warn: (message: string, error?: any) => {
    logManager.warn(SOURCE, message, error);
  },
  error: (message: string, error?: any) => {
    logManager.error(SOURCE, message, error);
  },
  debug: (message: string, data?: any) => {
    logManager.debug(SOURCE, message, data);
  }
};

export interface ViewState2D {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

export interface ViewState3D {
  latitude: number;
  longitude: number;
  height: number;
}

interface ViewStateStore {
  // State
  viewState2D: ViewState2D;
  viewState3D: ViewState3D;
  
  // Actions
  setViewState2D: (state: ViewState2D) => void;
  setViewState3D: (state: ViewState3D) => void;
  reset: () => void;
}

interface ViewState {
  viewState2D: ViewState2D;
  viewState3D: ViewState3D;
}

const initialState: ViewState = {
  viewState2D: {
    center: [0, 0] as [number, number],
    zoom: 1,
    pitch: 0,
    bearing: 0
  },
  viewState3D: {
    latitude: 0,
    longitude: 0,
    height: 10000000
  }
};

export const useViewStateStore = create<ViewStateStore>()(
  persist(
    (set) => ({
      // Initial state
      ...initialState,

      // Actions
      setViewState2D: (state) => {
        set({ viewState2D: state });
        logger.debug('2D view state updated', { state });
      },

      setViewState3D: (state) => {
        set({ viewState3D: state });
        logger.debug('3D view state updated', { state });
      },

      reset: () => {
        set(initialState);
        logger.info('View state store reset');
      }
    }),
    {
      name: 'view-state-storage',
      partialize: (state) => ({
        viewState2D: state.viewState2D,
        viewState3D: state.viewState3D,
      })
    }
  )
); 