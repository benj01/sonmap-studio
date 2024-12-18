import { useState, useCallback, useEffect } from 'react';
import { ViewStateChangeEvent } from 'react-map-gl';
import { Feature, BBox } from 'geojson';
import { COORDINATE_SYSTEMS, CoordinateSystem, Bounds } from '../types/coordinates';
import { ViewState, UseMapViewResult } from '../types/map';
import { CoordinateTransformer } from '../utils/coordinate-utils';
import proj4 from 'proj4';

// Default center on Aarau, Switzerland
const DEFAULT_CENTER = {
  longitude: 8.0472,  // Aarau longitude
  latitude: 47.3925,  // Aarau latitude
  zoom: 13
};

// Padding for bounds (in degrees for WGS84)
const BOUNDS_PADDING_DEGREES = 0.01;  // About 1km at Swiss latitudes

export function useMapView(
  initialBounds?: Bounds,
  coordinateSystem: CoordinateSystem = COORDINATE_SYSTEMS.WGS84
): UseMapViewResult {
  const [viewState, setViewState] = useState<ViewState>({
    ...DEFAULT_CENTER,
    bearing: 0,
    pitch: 0
  });

  // Verify coordinate system is registered
  useEffect(() => {
    if (coordinateSystem && !proj4.defs(coordinateSystem)) {
      console.error(`Coordinate system ${coordinateSystem} is not registered with proj4`);
      // Set default view of Aarau
      setViewState(prev => ({
        ...prev,
        ...DEFAULT_CENTER
      }));
    }
  }, [coordinateSystem]);

  const calculateBoundsFromFeatures = useCallback((features: Feature[]): Bounds | null => {
    if (!features.length) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const updateBounds = (coords: [number, number]) => {
      // For Swiss coordinates, we need to transform to WGS84
      let lon = coords[0];
      let lat = coords[1];

      if (coordinateSystem && coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
        try {
          const transformer = new CoordinateTransformer(coordinateSystem, COORDINATE_SYSTEMS.WGS84);
          const transformed = transformer.transform({ x: coords[0], y: coords[1] });
          if (transformed) {
            lon = transformed.x;
            lat = transformed.y;
          }
        } catch (error) {
          console.error('Failed to transform coordinates:', error);
          return;
        }
      }

      if (isFinite(lon) && isFinite(lat)) {
        minX = Math.min(minX, lon);
        minY = Math.min(minY, lat);
        maxX = Math.max(maxX, lon);
        maxY = Math.max(maxY, lat);
      }
    };

    const processCoordinates = (coords: any): void => {
      if (!Array.isArray(coords)) return;
      if (typeof coords[0] === 'number' && coords.length >= 2) {
        updateBounds(coords as [number, number]);
      } else {
        coords.forEach(c => processCoordinates(c));
      }
    };

    features.forEach(feature => {
      if (feature.geometry && 'coordinates' in feature.geometry) {
        processCoordinates(feature.geometry.coordinates);
      }
    });

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      console.warn('Invalid bounds calculated, using default center');
      return {
        minX: DEFAULT_CENTER.longitude - 0.1,
        minY: DEFAULT_CENTER.latitude - 0.1,
        maxX: DEFAULT_CENTER.longitude + 0.1,
        maxY: DEFAULT_CENTER.latitude + 0.1
      };
    }

    return { minX, minY, maxX, maxY };
  }, [coordinateSystem]);

  const updateViewFromBounds = useCallback((bounds: Bounds) => {
    try {
      // Verify coordinate system is registered before attempting transformation
      if (coordinateSystem && !proj4.defs(coordinateSystem)) {
        throw new Error(`Coordinate system ${coordinateSystem} is not registered with proj4`);
      }

      let transformedBounds = bounds;
      
      // Only transform if we're not already in WGS84
      if (coordinateSystem && coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
        try {
          const transformer = new CoordinateTransformer(coordinateSystem, COORDINATE_SYSTEMS.WGS84);
          const result = transformer.transformBounds(bounds);
          if (!result) {
            throw new Error(`Failed to transform bounds from ${coordinateSystem} to WGS84`);
          }
          transformedBounds = result;
        } catch (error) {
          console.error('Coordinate transformation error:', error);
          // If transformation fails, default to Aarau
          setViewState(prev => ({ ...prev, ...DEFAULT_CENTER }));
          return;
        }
      }

      // Add padding
      const width = transformedBounds.maxX - transformedBounds.minX;
      const height = transformedBounds.maxY - transformedBounds.minY;
      const padX = Math.max(width * 0.1, BOUNDS_PADDING_DEGREES);
      const padY = Math.max(height * 0.1, BOUNDS_PADDING_DEGREES);

      transformedBounds = {
        minX: transformedBounds.minX - padX,
        minY: transformedBounds.minY - padY,
        maxX: transformedBounds.maxX + padX,
        maxY: transformedBounds.maxY + padY
      };

      // Constrain to valid WGS84 ranges
      const validMinLat = Math.max(transformedBounds.minY, -85);
      const validMaxLat = Math.min(transformedBounds.maxY, 85);
      const validMinLon = Math.max(transformedBounds.minX, -180);
      const validMaxLon = Math.min(transformedBounds.maxX, 180);

      // Calculate center point
      const longitude = (validMinLon + validMaxLon) / 2;
      const latitude = (validMinLat + validMaxLat) / 2;

      // Calculate zoom level
      const latZoom = Math.log2(360 / (validMaxLat - validMinLat)) - 1;
      const lonZoom = Math.log2(360 / (validMaxLon - validMinLon)) - 1;
      let zoom = Math.min(latZoom, lonZoom);

      // Ensure zoom is within valid range and add slight zoom out for context
      zoom = Math.min(Math.max(zoom - 0.5, 1), 20);

      setViewState(prev => ({
        ...prev,
        longitude,
        latitude,
        zoom
      }));
    } catch (error) {
      console.error('Error setting map view state:', error);
      // Default to Aarau view
      setViewState(prev => ({ ...prev, ...DEFAULT_CENTER }));
      throw error;
    }
  }, [coordinateSystem]);

  const focusOnFeatures = useCallback((features: Feature[], padding: number = 50) => {
    const bounds = calculateBoundsFromFeatures(features);
    if (bounds) {
      updateViewFromBounds(bounds);
    }
  }, [calculateBoundsFromFeatures, updateViewFromBounds]);

  const onMove = useCallback((evt: ViewStateChangeEvent) => {
    setViewState(evt.viewState as ViewState);
  }, []);

  const getViewportBounds = useCallback((): BBox | undefined => {
    if (!viewState) return undefined;

    const { longitude, latitude, zoom } = viewState;
    
    // Calculate viewport bounds based on zoom level
    const latRange = 360 / Math.pow(2, zoom + 1);
    const lonRange = 360 / Math.pow(2, zoom);
    
    return [
      longitude - lonRange / 2,  // minLon
      latitude - latRange / 2,   // minLat
      longitude + lonRange / 2,  // maxLon
      latitude + latRange / 2    // maxLat
    ];
  }, [viewState]);

  // Initialize view when bounds change
  useEffect(() => {
    if (initialBounds) {
      updateViewFromBounds(initialBounds);
    }
  }, [initialBounds, updateViewFromBounds]);

  return {
    viewState,
    onMove,
    updateViewFromBounds,
    focusOnFeatures,
    getViewportBounds
  };
}
