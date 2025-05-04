// MIGRATION: Logger usage migrated to async/await dbLogger. Legacy LogManager and inline logger removed.
// See debug.mdc and cursor_rules.mdc for migration details.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { dbLogger } from '@/utils/logging/dbLogger';

const SOURCE = 'viewStateStore';

export interface ViewState2D {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export interface ViewState3D {
  latitude: number;
  longitude: number;
  height: number;
  heading?: number;
  pitch?: number;
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
    longitude: 0,
    latitude: 0,
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
        (async () => {
          await dbLogger.debug('2D view state updated', { state, source: SOURCE });
        })();
      },

      setViewState3D: (state) => {
        set({ viewState3D: state });
        (async () => {
          await dbLogger.debug('3D view state updated', { state, source: SOURCE });
        })();
      },

      reset: () => {
        set(initialState);
        (async () => {
          await dbLogger.info('View state store reset', { action: 'reset', source: SOURCE });
        })();
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

// View state selectors
export const viewStateSelectors = {
  // Get 2D view state
  getViewState2D: (state: ViewStateStore) => {
    return state.viewState2D;
  },

  // Get 3D view state
  getViewState3D: (state: ViewStateStore) => {
    return state.viewState3D;
  },

  // Get coordinates
  getLongitude2D: (state: ViewStateStore) => {
    return state.viewState2D.longitude;
  },

  getLatitude2D: (state: ViewStateStore) => {
    return state.viewState2D.latitude;
  },

  // Get zoom level
  getZoom: (state: ViewStateStore) => {
    return state.viewState2D.zoom;
  },

  // Get pitch
  getPitch: (state: ViewStateStore) => {
    return state.viewState2D.pitch;
  },

  // Get bearing
  getBearing: (state: ViewStateStore) => {
    return state.viewState2D.bearing;
  },

  // Get 3D height
  getHeight: (state: ViewStateStore) => {
    return state.viewState3D.height;
  },

  // Get 3D coordinates
  getLatitude3D: (state: ViewStateStore) => {
    return state.viewState3D.latitude;
  },

  getLongitude3D: (state: ViewStateStore) => {
    return state.viewState3D.longitude;
  }
};

// Custom hooks for view state operations
export const useViewState2D = () => {
  return useViewStateStore(viewStateSelectors.getViewState2D);
};

export const useViewState3D = () => {
  return useViewStateStore(viewStateSelectors.getViewState3D);
};

export const useLongitude2D = () => {
  return useViewStateStore(viewStateSelectors.getLongitude2D);
};

export const useLatitude2D = () => {
  return useViewStateStore(viewStateSelectors.getLatitude2D);
};

export const useZoom = () => {
  return useViewStateStore(viewStateSelectors.getZoom);
};

export const usePitch = () => {
  return useViewStateStore(viewStateSelectors.getPitch);
};

export const useBearing = () => {
  return useViewStateStore(viewStateSelectors.getBearing);
};

export const useHeight = () => {
  return useViewStateStore(viewStateSelectors.getHeight);
};

export const useLatitude3D = () => {
  return useViewStateStore(viewStateSelectors.getLatitude3D);
};

export const useLongitude3D = () => {
  return useViewStateStore(viewStateSelectors.getLongitude3D);
}; 