import { useState, useCallback, useEffect } from 'react';
import { ViewStateChangeEvent } from 'react-map-gl';
import { Feature } from 'geojson';
import { COORDINATE_SYSTEMS, CoordinateSystem, Bounds } from '../types/coordinates';
import { ViewState } from '../types/map';
import { CoordinateTransformer } from '../utils/coordinate-utils';

interface UseMapViewResult {
  viewState: ViewState;
  onMove: (evt: ViewStateChangeEvent) => void;
  updateViewFromBounds: (bounds: Bounds) => void;
  focusOnFeatures: (features: Feature[]) => void;
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

  const calculateBoundsFromFeatures = useCallback((features: Feature[]): Bounds | null => {
    if (!features.length) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    features.forEach(feature => {
      const coords = feature.geometry.type === 'Point' 
        ? [feature.geometry.coordinates] 
        : feature.geometry.type === 'LineString'
        ? feature.geometry.coordinates
        : feature.geometry.type === 'Polygon'
        ? feature.geometry.coordinates[0]
        : feature.geometry.type === 'MultiLineString'
        ? feature.geometry.coordinates.flat()
        : feature.geometry.type === 'MultiPolygon'
        ? feature.geometry.coordinates.flat(2)
        : [];

      coords.forEach(([lon, lat]) => {
        // Note: GeoJSON coordinates are [longitude, latitude]
        minX = Math.min(minX, lon);
        minY = Math.min(minY, lat);
        maxX = Math.max(maxX, lon);
        maxY = Math.max(maxY, lat);
      });
    });

    return {
      minX,
      minY,
      maxX,
      maxY
    };
  }, []);

  const updateViewFromBounds = useCallback((bounds: Bounds) => {
    try {
      let transformedBounds = bounds;
      
      // Only transform if not already in WGS84
      if (coordinateSystem && coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
        const transformer = new CoordinateTransformer(coordinateSystem, COORDINATE_SYSTEMS.WGS84);
        const result = transformer.transformBounds(bounds);
        if (!result) {
          console.warn('Failed to transform bounds');
          return;
        }
        transformedBounds = result;
      }

      // Validate transformed bounds
      if (!isFinite(transformedBounds.minX) || !isFinite(transformedBounds.minY) ||
          !isFinite(transformedBounds.maxX) || !isFinite(transformedBounds.maxY)) {
        console.warn('Invalid bounds:', transformedBounds);
        return;
      }

      // For WGS84, ensure bounds are within valid ranges
      const validMinLat = Math.max(transformedBounds.minY, -90);
      const validMaxLat = Math.min(transformedBounds.maxY, 90);
      const validMinLon = Math.max(transformedBounds.minX, -180);
      const validMaxLon = Math.min(transformedBounds.maxX, 180);

      // Calculate center using valid coordinates
      const center = {
        // longitude is X in WGS84
        lng: (validMinLon + validMaxLon) / 2,
        // latitude is Y in WGS84
        lat: (validMinLat + validMaxLat) / 2
      };

      if (!isFinite(center.lng) || !isFinite(center.lat)) {
        console.warn('Invalid center coordinates:', center);
        return;
      }

      // Validate center coordinates are within WGS84 bounds
      if (center.lat < -90 || center.lat > 90 || center.lng < -180 || center.lng > 180) {
        console.warn('Center coordinates out of WGS84 bounds:', center);
        return;
      }

      const width = Math.abs(validMaxLon - validMinLon);
      const height = Math.abs(validMaxLat - validMinLat);
      const maxDimension = Math.max(width, height);
      
      // Adjust zoom calculation based on coordinate system
      let zoom = coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV95 || 
                 coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV03
        ? Math.floor(14 - Math.log2(maxDimension / 1000))
        : Math.floor(14 - Math.log2(maxDimension));

      // Ensure zoom stays within reasonable bounds
      zoom = Math.min(Math.max(zoom, 1), 20);

      // Add padding to zoom level for better visibility
      zoom = Math.max(1, zoom - 1);

      setViewState(prev => ({
        ...prev,
        longitude: center.lng,
        latitude: center.lat,
        zoom
      }));
    } catch (error) {
      console.error('Error setting map view state:', error);
    }
  }, [coordinateSystem]);

  const focusOnFeatures = useCallback((features: Feature[]) => {
    const bounds = calculateBoundsFromFeatures(features);
    if (bounds) {
      updateViewFromBounds(bounds);
    }
  }, [calculateBoundsFromFeatures, updateViewFromBounds]);

  const onMove = useCallback((evt: ViewStateChangeEvent) => {
    setViewState(evt.viewState as ViewState);
  }, []);

  // Initialize view with bounds if provided
  useEffect(() => {
    if (initialBounds) {
      updateViewFromBounds(initialBounds);
    }
  }, [initialBounds, updateViewFromBounds]);

  return {
    viewState,
    onMove,
    updateViewFromBounds,
    focusOnFeatures
  };
}
