import { useState, useCallback, useEffect } from 'react';
import { ViewStateChangeEvent } from 'react-map-gl';
import { Feature, BBox } from 'geojson';
import { COORDINATE_SYSTEMS, CoordinateSystem, Bounds } from '../types/coordinates';
import { ViewState, UseMapViewResult } from '../types/map';
import { CoordinateTransformer } from '../utils/coordinate-utils';
import proj4 from 'proj4';

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

  // Verify coordinate system is registered
  useEffect(() => {
    if (coordinateSystem && !proj4.defs(coordinateSystem)) {
      console.error(`Coordinate system ${coordinateSystem} is not registered with proj4`);
      // Set a default view of Switzerland if we're using Swiss coordinates
      if (coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV95 || 
          coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV03) {
        setViewState(prev => ({
          ...prev,
          longitude: 8.2275,  // Approximate center of Switzerland
          latitude: 46.8182,
          zoom: 7
        }));
      }
    }
  }, [coordinateSystem]);

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
          // If transformation fails, try to use original bounds but constrained to valid ranges
          transformedBounds = {
            minX: Math.max(Math.min(bounds.minX, 180), -180),
            minY: Math.max(Math.min(bounds.minY, 90), -90),
            maxX: Math.max(Math.min(bounds.maxX, 180), -180),
            maxY: Math.max(Math.min(bounds.maxY, 90), -90)
          };
        }
      }

      // Ensure bounds are valid
      if (!isFinite(transformedBounds.minX) || !isFinite(transformedBounds.minY) ||
          !isFinite(transformedBounds.maxX) || !isFinite(transformedBounds.maxY)) {
        throw new Error('Invalid bounds: coordinates are not finite numbers');
      }

      // Constrain to valid WGS84 ranges
      const validMinLat = Math.max(transformedBounds.minY, -85); // Use 85 instead of 90 for better Mercator projection
      const validMaxLat = Math.min(transformedBounds.maxY, 85);
      const validMinLon = Math.max(transformedBounds.minX, -180);
      const validMaxLon = Math.min(transformedBounds.maxX, 180);

      // Calculate center point
      const center = {
        lng: (validMinLon + validMaxLon) / 2,
        lat: (validMinLat + validMaxLat) / 2
      };

      // Validate center coordinates
      if (!isFinite(center.lng) || !isFinite(center.lat)) {
        throw new Error('Invalid center coordinates: not finite numbers');
      }

      // Calculate appropriate zoom level
      const width = Math.abs(validMaxLon - validMinLon);
      const height = Math.abs(validMaxLat - validMinLat);
      const maxDimension = Math.max(width, height);
      
      // Adjust zoom calculation based on coordinate system
      let zoom = coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV95 || 
                 coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV03
        ? Math.floor(14 - Math.log2(maxDimension / 1000)) // For meter-based systems
        : Math.floor(14 - Math.log2(maxDimension));       // For degree-based systems

      // Ensure zoom is within valid range
      zoom = Math.min(Math.max(zoom, 1), 20);
      
      // Add a small zoom out for better context
      zoom = Math.max(1, zoom - 1);

      setViewState(prev => ({
        ...prev,
        longitude: center.lng,
        latitude: center.lat,
        zoom
      }));
    } catch (error) {
      console.error('Error setting map view state:', error);
      // Set a default view of Switzerland if we're using Swiss coordinates
      if (coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV95 || 
          coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV03) {
        setViewState(prev => ({
          ...prev,
          longitude: 8.2275,  // Approximate center of Switzerland
          latitude: 46.8182,
          zoom: 7
        }));
      }
      throw error;
    }
  }, [coordinateSystem]);

  const focusOnFeatures = useCallback((features: Feature[], padding: number = 0) => {
    const bounds = calculateBoundsFromFeatures(features);
    if (bounds) {
      // Apply padding to bounds
      const width = bounds.maxX - bounds.minX;
      const height = bounds.maxY - bounds.minY;
      const padX = (width * padding) / 100;
      const padY = (height * padding) / 100;
      
      updateViewFromBounds({
        minX: bounds.minX - padX,
        minY: bounds.minY - padY,
        maxX: bounds.maxX + padX,
        maxY: bounds.maxY + padY
      });
    }
  }, [calculateBoundsFromFeatures, updateViewFromBounds]);

  const onMove = useCallback((evt: ViewStateChangeEvent) => {
    setViewState(evt.viewState as ViewState);
  }, []);

  const getViewportBounds = useCallback((): BBox | undefined => {
    if (!viewState) return undefined;

    // Calculate viewport bounds based on current view state
    const { longitude, latitude, zoom } = viewState;
    
    // Rough estimation of viewport bounds (can be improved with actual viewport calculations)
    const latRange = 180 / Math.pow(2, zoom);
    const lonRange = 360 / Math.pow(2, zoom);
    
    return [
      longitude - lonRange / 2,  // minLon
      latitude - latRange / 2,   // minLat
      longitude + lonRange / 2,  // maxLon
      latitude + latRange / 2    // maxLat
    ];
  }, [viewState]);

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
