import { useState, useCallback } from 'react';
import { ViewStateChangeEvent } from 'react-map-gl';
import { COORDINATE_SYSTEMS, CoordinateSystem, Bounds } from '../types/coordinates';
import { ViewState } from '../types/map';
import { CoordinateTransformer } from '../utils/coordinate-utils';

interface UseMapViewResult {
  viewState: ViewState;
  onMove: (evt: ViewStateChangeEvent) => void;
  updateViewFromBounds: (bounds: Bounds) => void;
}

export function useMapView(
  initialBounds?: Bounds,
  coordinateSystem: CoordinateSystem = COORDINATE_SYSTEMS.WGS84
): UseMapViewResult {
  const [viewState, setViewState] = useState<ViewState>({
    longitude: 0,
    latitude: 0,
    zoom: 1,
    bearing: 0,
    pitch: 0
  });

  const updateViewFromBounds = useCallback((bounds: Bounds) => {
    try {
      let transformedBounds = bounds;
      if (coordinateSystem && coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
        const transformer = new CoordinateTransformer(coordinateSystem, COORDINATE_SYSTEMS.WGS84);
        const result = transformer.transformBounds(bounds);
        if (!result) {
          console.warn('Failed to transform bounds');
          return;
        }
        transformedBounds = result;
      }

      if (!isFinite(transformedBounds.minX) || !isFinite(transformedBounds.minY) ||
          !isFinite(transformedBounds.maxX) || !isFinite(transformedBounds.maxY)) {
        console.warn('Invalid bounds:', transformedBounds);
        return;
      }

      const center = {
        lng: (transformedBounds.minX + transformedBounds.maxX) / 2,
        lat: (transformedBounds.minY + transformedBounds.maxY) / 2
      };

      if (!isFinite(center.lng) || !isFinite(center.lat)) {
        console.warn('Invalid center coordinates:', center);
        return;
      }

      const width = Math.abs(transformedBounds.maxX - transformedBounds.minX);
      const height = Math.abs(transformedBounds.maxY - transformedBounds.minY);
      const maxDimension = Math.max(width, height);
      
      let zoom = coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV95 || 
                 coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV03
        ? Math.floor(14 - Math.log2(maxDimension / 1000))
        : Math.floor(14 - Math.log2(maxDimension));

      zoom = Math.min(Math.max(zoom, 1), 20);

      setTimeout(() => {
        setViewState(prev => ({
          ...prev,
          longitude: center.lng,
          latitude: center.lat,
          zoom: zoom - 0.5
        }));
      }, 100);
    } catch (error) {
      console.error('Error setting map view state:', error);
    }
  }, [coordinateSystem]);

  const onMove = useCallback((evt: ViewStateChangeEvent) => {
    setViewState(evt.viewState as ViewState);
  }, []);

  return {
    viewState,
    onMove,
    updateViewFromBounds
  };
}
