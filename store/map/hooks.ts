import { useCallback } from 'react';
import { useMapInstanceStore } from './mapInstanceStore';
import { mapInstanceSelectors } from './mapInstanceStore';
import type { Map } from 'mapbox-gl';
import { useViewStateStore } from './viewStateStore';
import { viewStateSelectors } from './viewStateStore';

// Map instance operations
export const useMapInstance = () => {
  const store = useMapInstanceStore();
  const mapboxInstance = useMapInstanceStore(mapInstanceSelectors.getMapboxInstance);
  const cesiumInstance = useMapInstanceStore(mapInstanceSelectors.getCesiumInstance);
  const mapboxStatus = useMapInstanceStore(mapInstanceSelectors.getMapboxStatus);
  const cesiumStatus = useMapInstanceStore(mapInstanceSelectors.getCesiumStatus);
  const mapboxError = useMapInstanceStore(mapInstanceSelectors.getMapboxError);
  const cesiumError = useMapInstanceStore(mapInstanceSelectors.getCesiumError);
  const areInstancesReady = useMapInstanceStore(mapInstanceSelectors.areInstancesReady);
  const hasInstanceError = useMapInstanceStore(mapInstanceSelectors.hasInstanceError);

  const setMapboxInstance = useCallback((instance: Map | null) => {
    store.setMapboxInstance(instance);
  }, [store]);

  const setCesiumInstance = useCallback((instance: any | null) => {
    store.setCesiumInstance(instance);
  }, [store]);

  const setMapboxStatus = useCallback((status: 'initializing' | 'ready' | 'error', error?: string) => {
    store.setMapboxStatus(status, error);
  }, [store]);

  const setCesiumStatus = useCallback((status: 'initializing' | 'ready' | 'error', error?: string) => {
    store.setCesiumStatus(status, error);
  }, [store]);

  const cleanup = useCallback(() => {
    store.cleanup();
  }, [store]);

  return {
    mapboxInstance,
    cesiumInstance,
    mapboxStatus,
    cesiumStatus,
    mapboxError,
    cesiumError,
    areInstancesReady,
    hasInstanceError,
    setMapboxInstance,
    setCesiumInstance,
    setMapboxStatus,
    setCesiumStatus,
    cleanup
  };
};

// Mapbox instance operations
export const useMapboxInstance = () => {
  const store = useMapInstanceStore();
  const instance = useMapInstanceStore(mapInstanceSelectors.getMapboxInstance);
  const status = useMapInstanceStore(mapInstanceSelectors.getMapboxStatus);
  const error = useMapInstanceStore(mapInstanceSelectors.getMapboxError);

  const setInstance = useCallback((instance: Map | null) => {
    store.setMapboxInstance(instance);
  }, [store]);

  const setStatus = useCallback((status: 'initializing' | 'ready' | 'error', error?: string) => {
    store.setMapboxStatus(status, error);
  }, [store]);

  return {
    instance,
    status,
    error,
    setInstance,
    setStatus
  };
};

// Cesium instance operations
export const useCesiumInstance = () => {
  const store = useMapInstanceStore();
  const instance = useMapInstanceStore(mapInstanceSelectors.getCesiumInstance);
  const status = useMapInstanceStore(mapInstanceSelectors.getCesiumStatus);
  const error = useMapInstanceStore(mapInstanceSelectors.getCesiumError);

  const setInstance = useCallback((instance: any | null) => {
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