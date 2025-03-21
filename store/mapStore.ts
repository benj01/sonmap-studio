import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'mapStore';
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

export interface LayerMetadata {
  name: string;
  type: string;
  properties: Record<string, any>;
}

export interface LayerState {
  id: string;
  sourceId?: string;
  visible: boolean;
  added: boolean;
  metadata?: LayerMetadata;
}

export interface ViewState {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

export interface CesiumViewState {
  latitude: number;
  longitude: number;
  height: number;
}

export interface MapState {
  // Layer states
  layers: Map<string, LayerState>;
  // View states
  viewState2D: ViewState;
  viewState3D: CesiumViewState;
  // Map instances
  mapboxInstance: any | null;
  cesiumInstance: any | null;
  // Actions
  setLayerVisibility: (layerId: string, visible: boolean) => void;
  addLayer: (layerId: string, initialVisibility?: boolean, sourceId?: string, metadata?: LayerMetadata) => void;
  removeLayer: (layerId: string) => void;
  setViewState2D: (state: ViewState) => void;
  setViewState3D: (state: CesiumViewState) => void;
  setMapboxInstance: (instance: any) => void;
  setCesiumInstance: (instance: any) => void;
  reset: () => void;
  cleanup: () => void;
}

export const useMapStore = create<MapState>()(
  persist(
    (set, get) => ({
      // Initial state
      layers: new Map(),
      viewState2D: {
        center: [0, 0],
        zoom: 1,
        pitch: 0,
        bearing: 0
      },
      viewState3D: {
        latitude: 0,
        longitude: 0,
        height: 10000000
      },
      mapboxInstance: null,
      cesiumInstance: null,

      // Actions
      setLayerVisibility: (layerId, visible) => {
        set((state) => {
          const newLayers = new Map(state.layers);
          const layer = newLayers.get(layerId);
          if (layer) {
            newLayers.set(layerId, { ...layer, visible });
            logger.debug('Layer visibility updated', { layerId, visible });
          }
          return { layers: newLayers };
        });
      },

      addLayer: (layerId, initialVisibility = true, sourceId, metadata) => {
        set((state) => {
          const newLayers = new Map(state.layers);
          newLayers.set(layerId, {
            id: layerId,
            sourceId,
            visible: initialVisibility,
            added: false,
            metadata
          });
          logger.debug('Layer added', { layerId, sourceId, initialVisibility, metadata });
          return { layers: newLayers };
        });
      },

      removeLayer: (layerId) => {
        set((state) => {
          const newLayers = new Map(state.layers);
          newLayers.delete(layerId);
          logger.debug('Layer removed', { layerId });
          return { layers: newLayers };
        });
      },

      setViewState2D: (state) => {
        set({ viewState2D: state });
        logger.debug('2D view state updated', { state });
      },

      setViewState3D: (state) => {
        set({ viewState3D: state });
        logger.debug('3D view state updated', { state });
      },

      setMapboxInstance: (instance) => {
        set({ mapboxInstance: instance });
        logger.debug('Mapbox instance set', { hasInstance: !!instance });
      },

      setCesiumInstance: (instance) => {
        set({ cesiumInstance: instance });
        logger.debug('Cesium instance set', { hasInstance: !!instance });
      },

      cleanup: () => {
        set((state) => {
          // Cleanup map instances
          if (state.mapboxInstance) {
            state.mapboxInstance.remove();
          }
          if (state.cesiumInstance) {
            state.cesiumInstance.destroy();
          }
          return {
            mapboxInstance: null,
            cesiumInstance: null
          };
        });
      },

      reset: () => {
        set((state) => {
          logger.info('Resetting map state');
          
          // Clean up existing map instances
          if (state.mapboxInstance) {
            state.mapboxInstance.remove();
          }
          if (state.cesiumInstance) {
            state.cesiumInstance.destroy();
          }

          // Return to initial state but preserve layers
          return {
            // Keep existing layers
            layers: state.layers,
            viewState2D: {
              center: [0, 0],
              zoom: 1,
              pitch: 0,
              bearing: 0
            },
            viewState3D: {
              latitude: 0,
              longitude: 0,
              height: 10000000
            },
            mapboxInstance: null,
            cesiumInstance: null
          };
        });
      }
    }),
    {
      name: 'map-storage',
      partialize: (state) => ({
        viewState2D: state.viewState2D,
        viewState3D: state.viewState3D,
        // Only persist non-volatile state
      })
    }
  )
); 