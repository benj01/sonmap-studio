import { useState, useCallback, useEffect } from 'react';
import { ViewStateChangeEvent } from 'react-map-gl';
import { Feature, BBox } from 'geojson';
import { 
  COORDINATE_SYSTEMS, 
  CoordinateSystem, 
  Bounds, 
  DEFAULT_CENTER,
  isSwissSystem 
} from '../types/coordinates';
import { ViewState, UseMapViewResult } from '../types/map';
import { coordinateSystemManager } from '../core/coordinate-system-manager';
import proj4 from 'proj4';

// Padding for bounds (in degrees for WGS84)
const BOUNDS_PADDING_DEGREES = 0.1;  // About 10km at Swiss latitudes
const BOUNDS_PADDING_PERCENT = 0.2;   // 20% padding for better context

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

      // Add padding based on coordinate system
      const width = transformedBounds.maxX - transformedBounds.minX;
      const height = transformedBounds.maxY - transformedBounds.minY;
      
      // Use percentage-based padding for projected systems, fixed degrees for WGS84
      const padX = isSwissSystem(coordinateSystem) 
        ? width * BOUNDS_PADDING_PERCENT 
        : Math.max(width * 0.1, BOUNDS_PADDING_DEGREES);
      const padY = isSwissSystem(coordinateSystem)
        ? height * BOUNDS_PADDING_PERCENT
        : Math.max(height * 0.1, BOUNDS_PADDING_DEGREES);

      console.debug('[DEBUG] Calculating bounds padding:', {
        width,
        height,
        padX,
        padY,
        system: coordinateSystem,
        isSwiss: isSwissSystem(coordinateSystem)
      });

      transformedBounds = {
        minX: transformedBounds.minX - padX,
        minY: transformedBounds.minY - padY,
        maxX: transformedBounds.maxX + padX,
        maxY: transformedBounds.maxY + padY
      };

      // Log bounds before validation
      console.debug('[DEBUG] Bounds before validation:', {
        original: bounds,
        transformed: transformedBounds,
        system: coordinateSystem
      });

      // Constrain to valid WGS84 ranges
      const validMinLat = Math.max(transformedBounds.minY, -85);
      const validMaxLat = Math.min(transformedBounds.maxY, 85);
      const validMinLon = Math.max(transformedBounds.minX, -180);
      const validMaxLon = Math.min(transformedBounds.maxX, 180);

      // Log bounds after validation
      console.debug('[DEBUG] Bounds after validation:', {
        minLat: { original: transformedBounds.minY, validated: validMinLat },
        maxLat: { original: transformedBounds.maxY, validated: validMaxLat },
        minLon: { original: transformedBounds.minX, validated: validMinLon },
        maxLon: { original: transformedBounds.maxX, validated: validMaxLon }
      });

      // Calculate center point
      const longitude = (validMinLon + validMaxLon) / 2;
      const latitude = (validMinLat + validMaxLat) / 2;

      // Calculate zoom level with enhanced precision
      const latZoom = Math.log2(360 / Math.max(0.000001, validMaxLat - validMinLat)) - 1;
      const lonZoom = Math.log2(360 / Math.max(0.000001, validMaxLon - validMinLon)) - 1;
      let zoom = Math.min(latZoom, lonZoom);

      // Ensure zoom is within valid range and add slight zoom out for context
      zoom = Math.min(Math.max(zoom - 1.5, 1), 20); // Zoom out more for better context

      console.debug('[DEBUG] View state calculation:', {
        bounds: transformedBounds,
        validBounds: {
          minLat: validMinLat,
          maxLat: validMaxLat,
          minLon: validMinLon,
          maxLon: validMaxLon
        },
        center: { longitude, latitude },
        zoom: {
          latZoom,
          lonZoom,
          finalZoom: zoom
        }
      });

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

  const getViewportBounds = useCallback((): [number, number, number, number] | undefined => {
    if (!viewState) return undefined;

    const { longitude, latitude, zoom } = viewState;
    
    // Validate all values are finite numbers
    if (!isFinite(longitude) || !isFinite(latitude) || !isFinite(zoom)) {
      console.debug('[DEBUG] Invalid viewState values:', { longitude, latitude, zoom });
      return undefined;
    }
    
    // Calculate viewport bounds based on zoom level
    const latRange = 360 / Math.pow(2, zoom + 1);
    const lonRange = 360 / Math.pow(2, zoom);
    
    // Calculate bounds
    const minLon = longitude - lonRange / 2;
    const minLat = latitude - latRange / 2;
    const maxLon = longitude + lonRange / 2;
    const maxLat = latitude + latRange / 2;
    
    // Validate calculated bounds
    if (!isFinite(minLon) || !isFinite(minLat) || !isFinite(maxLon) || !isFinite(maxLat)) {
      console.debug('[DEBUG] Invalid calculated bounds:', { minLon, minLat, maxLon, maxLat });
      return undefined;
    }
    
    // Ensure we return exactly 4 numbers for 2D bounds
    return [minLon, minLat, maxLon, maxLat];
  }, [viewState.longitude, viewState.latitude, viewState.zoom]); // Only depend on needed values

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
