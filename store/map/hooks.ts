import { useCallback } from 'react';
import { useMapInstanceStore } from './mapInstanceStore';
import { mapInstanceSelectors } from './mapInstanceStore';
import { useViewStateStore } from './viewStateStore';
import { viewStateSelectors } from './viewStateStore';
import type { CesiumInstance } from './mapInstanceStore';

// Map instance operations (Cesium only, Mapbox selectors/actions removed)
export const useMapInstance = () => {
  const store = useMapInstanceStore();
  const cesiumInstance = useMapInstanceStore(mapInstanceSelectors.getCesiumInstance);
  const cesiumStatus = useMapInstanceStore(mapInstanceSelectors.getCesiumStatus);
  const cesiumError = useMapInstanceStore(mapInstanceSelectors.getCesiumError);

  const setCesiumInstance = useCallback((instance: CesiumInstance | null) => {
    store.setCesiumInstance(instance);
  }, [store]);

  const setCesiumStatus = useCallback((status: 'initializing' | 'ready' | 'error', error?: string) => {
    store.setCesiumStatus(status, error);
  }, [store]);

  const cleanup = useCallback(() => {
    store.cleanup();
  }, [store]);

  return {
    cesiumInstance,
    cesiumStatus,
    cesiumError,
    setCesiumInstance,
    setCesiumStatus,
    cleanup
  };
};

// Cesium instance operations
export const useCesiumInstance = () => {
  const store = useMapInstanceStore();
  const instance = useMapInstanceStore(mapInstanceSelectors.getCesiumInstance);
  const status = useMapInstanceStore(mapInstanceSelectors.getCesiumStatus);
  const error = useMapInstanceStore(mapInstanceSelectors.getCesiumError);

  const setInstance = useCallback((instance: CesiumInstance | null) => {
    store.setCesiumInstance(instance);
  }, [store]);

  const setStatus = useCallback((status: 'initializing' | 'ready' | 'error', error?: string) => {
    store.setCesiumStatus(status, error);
  }, [store]);

  return {
    instance,
    status,
    error,
    setInstance,
    setStatus
  };
};

// View state operations
export const useViewState = () => {
  const store = useViewStateStore();
  const center = useViewStateStore(viewStateSelectors.getCenter);
  const zoom = useViewStateStore(viewStateSelectors.getZoom);
  const bearing = useViewStateStore(viewStateSelectors.getBearing);
  const pitch = useViewStateStore(viewStateSelectors.getPitch);
  const isAnimating = useViewStateStore(viewStateSelectors.isAnimating);
  const hasChanges = useViewStateStore(viewStateSelectors.hasChanges);

  const setCenter = useCallback((center: [number, number]) => {
    store.setCenter(center);
  }, [store]);

  const setZoom = useCallback((zoom: number) => {
    store.setZoom(zoom);
  }, [store]);

  const setBearing = useCallback((bearing: number) => {
    store.setBearing(bearing);
  }, [store]);

  const setPitch = useCallback((pitch: number) => {
    store.setPitch(pitch);
  }, [store]);

  const setViewState = useCallback((viewState: {
    center?: [number, number];
    zoom?: number;
    bearing?: number;
    pitch?: number;
  }) => {
    store.setViewState(viewState);
  }, [store]);

  const startAnimation = useCallback(() => {
    store.startAnimation();
  }, [store]);

  const stopAnimation = useCallback(() => {
    store.stopAnimation();
  }, [store]);

  const reset = useCallback(() => {
    store.reset();
  }, [store]);

  return {
    center,
    zoom,
    bearing,
    pitch,
    isAnimating,
    hasChanges,
    setCenter,
    setZoom,
    setBearing,
    setPitch,
    setViewState,
    startAnimation,
    stopAnimation,
    reset
  };
};

// View state animation operations
export const useViewStateAnimation = () => {
  const store = useViewStateStore();
  const isAnimating = useViewStateStore(viewStateSelectors.isAnimating);
  const hasChanges = useViewStateStore(viewStateSelectors.hasChanges);

  const startAnimation = useCallback(() => {
    store.startAnimation();
  }, [store]);

  const stopAnimation = useCallback(() => {
    store.stopAnimation();
  }, [store]);

  return {
    isAnimating,
    hasChanges,
    startAnimation,
    stopAnimation
  };
}; 