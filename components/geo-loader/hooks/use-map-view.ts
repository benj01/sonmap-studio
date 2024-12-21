import { useState, useCallback, useEffect } from 'react';
import { ViewStateChangeEvent } from 'react-map-gl';
import { Feature, BBox } from 'geojson';
import { COORDINATE_SYSTEMS, CoordinateSystem, Bounds, DEFAULT_CENTER } from '../types/coordinates';
import { ViewState, UseMapViewResult } from '../types/map';
import { coordinateSystemManager } from '../core/coordinate-system-manager';
import proj4 from 'proj4';

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

  // Initialize coordinate system manager
  useEffect(() => {
    coordinateSystemManager.initialize().catch(error => {
      console.error('Failed to initialize coordinate system manager:', error);
      // Set default view of Aarau
      setViewState(prev => ({
        ...prev,
        ...DEFAULT_CENTER
      }));
    });
  }, []);

  // Verify coordinate system is supported
  useEffect(() => {
    if (!coordinateSystemManager.isInitialized()) return;
    
    const supportedSystems = coordinateSystemManager.getSupportedSystems();
    if (coordinateSystem && !supportedSystems.includes(coordinateSystem)) {
      console.error(`Coordinate system ${coordinateSystem} is not supported`);
      // Set default view of Aarau
      setViewState(prev => ({
        ...prev,
        ...DEFAULT_CENTER
      }));
    }
  }, [coordinateSystem]);

  const calculateBoundsFromFeatures = useCallback(async (features: Feature[]): Promise<Bounds | null> => {
    if (!features.length) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const updateBounds = async (coords: [number, number]): Promise<void> => {
      // Transform coordinates to WGS84 if needed
      let lon = coords[0];
      let lat = coords[1];

      if (coordinateSystem && coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
        try {
          const transformed = await coordinateSystemManager.transform(
            { x: coords[0], y: coords[1] },
            coordinateSystem,
            COORDINATE_SYSTEMS.WGS84
          );
          // Manager handles coordinate order
          lon = transformed.x;
          lat = transformed.y;
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

    const processCoordinates = async (coords: any): Promise<void> => {
      if (!Array.isArray(coords)) return;
      if (typeof coords[0] === 'number' && coords.length >= 2) {
        await updateBounds(coords as [number, number]);
      } else {
        for (const c of coords) {
          await processCoordinates(c);
        }
      }
    };

    for (const feature of features) {
      if (feature.geometry && 'coordinates' in feature.geometry) {
        await processCoordinates(feature.geometry.coordinates);
      }
    }

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

  const updateViewFromBounds = useCallback(async (bounds: Bounds): Promise<void> => {
    try {
      // Validate bounds first
      if (!bounds || 
          bounds.minX === null || bounds.minY === null || 
          bounds.maxX === null || bounds.maxY === null ||
          !isFinite(bounds.minX) || !isFinite(bounds.minY) ||
          !isFinite(bounds.maxX) || !isFinite(bounds.maxY)) {
        console.warn('Invalid bounds provided, using default center');
        setViewState(prev => ({ ...prev, ...DEFAULT_CENTER }));
        return;
      }

      // Verify coordinate system is supported before attempting transformation
      if (!coordinateSystemManager.isInitialized()) {
        throw new Error('Coordinate system manager not initialized');
      }

      const supportedSystems = coordinateSystemManager.getSupportedSystems();
      if (coordinateSystem && !supportedSystems.includes(coordinateSystem)) {
        throw new Error(`Coordinate system ${coordinateSystem} is not supported`);
      }

      let transformedBounds = bounds;
      
      // Only transform if we're not already in WGS84
      if (coordinateSystem && coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
        try {
          // Transform each corner of the bounds
          const minPoint = await coordinateSystemManager.transform(
            { x: bounds.minX, y: bounds.minY },
            coordinateSystem,
            COORDINATE_SYSTEMS.WGS84
          );
          const maxPoint = await coordinateSystemManager.transform(
            { x: bounds.maxX, y: bounds.maxY },
            coordinateSystem,
            COORDINATE_SYSTEMS.WGS84
          );

          transformedBounds = {
            minX: minPoint.x,
            minY: minPoint.y,
            maxX: maxPoint.x,
            maxY: maxPoint.y
          };

          console.debug('Bounds transformation:', {
            original: bounds,
            transformed: transformedBounds,
            system: coordinateSystem
          });
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

      console.debug('Setting map view:', {
        longitude,
        latitude,
        zoom,
        bounds: transformedBounds
      });

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
    }
  }, [coordinateSystem]);

  const focusOnFeatures = useCallback(async (features: Feature[], padding: number = 50): Promise<void> => {
    const bounds = await calculateBoundsFromFeatures(features);
    if (bounds) {
      await updateViewFromBounds(bounds);
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
      updateViewFromBounds(initialBounds).catch(error => {
        console.error('Failed to update view from initial bounds:', error);
        setViewState(prev => ({ ...prev, ...DEFAULT_CENTER }));
      });
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
