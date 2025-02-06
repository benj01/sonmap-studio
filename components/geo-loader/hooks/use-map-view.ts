// D:\HE\GitHub\sonmap-studio\components\geo-loader\hooks\use-map-view.ts
import { useState, useCallback, useEffect } from 'react';
import { ViewStateChangeEvent } from 'react-map-gl';
import { Feature, BBox } from 'geojson';
import {
  COORDINATE_SYSTEMS,
  CoordinateSystem,
  Bounds,
  DEFAULT_CENTER,
  isSwissSystem,
  isWGS84System
} from '../types/coordinates';
import { ViewState, UseMapViewResult } from '../types/map';
import proj4 from 'proj4';
import WebMercatorViewport from '@math.gl/web-mercator';

// Define projections for Swiss coordinate systems
const SWISS_PROJECTIONS: Record<string, string> = {
  [COORDINATE_SYSTEMS.SWISS_LV95]: '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs',
  [COORDINATE_SYSTEMS.SWISS_LV03]: '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=600000 +y_0=200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs'
};

// Helper to get projection string for a coordinate system
const getProjection = (system: CoordinateSystem): string | null => {
  if (isSwissSystem(system)) {
    return SWISS_PROJECTIONS[system];
  }
  return null;
};

// Padding for bounds
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
  const [initialBoundsSet, setInitialBoundsSet] = useState(false);

  // Transform coordinates between systems
  const transformCoordinates = useCallback(async (
    point: { x: number, y: number },
    fromSystem: CoordinateSystem,
    toSystem: CoordinateSystem = COORDINATE_SYSTEMS.WGS84
  ): Promise<{ x: number, y: number }> => {
    if (fromSystem === toSystem) return point;

    try {
      const projection = getProjection(fromSystem);
      const targetProjection = getProjection(toSystem);

      // Handle Swiss to WGS84 transformation
      if (isSwissSystem(fromSystem) && isWGS84System(toSystem)) {
        if (!projection) {
          console.error('[use-map-view] No projection found for:', fromSystem);
          return point;
        }

        // Validate Swiss coordinates with reasonable bounds
        const isValidSwissCoord = (coord: number, isX: boolean) => {
          const [minX, maxX] = [2000000, 3000000];  // Swiss X range
          const [minY, maxY] = [1000000, 2000000];  // Swiss Y range
          const value = isX ? coord : coord;
          const [min, max] = isX ? [minX, maxX] : [minY, maxY];
          return isFinite(value) && value >= min && value <= max;
        };

        if (!isValidSwissCoord(point.x, true) || !isValidSwissCoord(point.y, false)) {
          console.warn('[use-map-view] Invalid Swiss coordinates:', {
            point,
            fromSystem,
            toSystem
          });
          return point;
        }

        const [lon, lat] = proj4(projection, 'WGS84', [point.x, point.y]);
        
        // Validate transformed coordinates
        if (!isFinite(lon) || !isFinite(lat) || 
            Math.abs(lat) > 90 || Math.abs(lon) > 180) {
          console.error('[use-map-view] Invalid transformation result:', { lon, lat });
          return point;
        }

        console.debug('[use-map-view] Transformed Swiss to WGS84:', {
          from: [point.x, point.y],
          to: [lon, lat]
        });

        return { x: lon, y: lat };
      }

      // Handle WGS84 to Swiss transformation
      if (isWGS84System(fromSystem) && isSwissSystem(toSystem)) {
        if (!targetProjection) {
          console.error('[use-map-view] No projection found for target:', toSystem);
          return point;
        }

        // Validate WGS84 coordinates
        if (!isFinite(point.x) || !isFinite(point.y) ||
            Math.abs(point.y) > 90 || Math.abs(point.x) > 180) {
          console.warn('[use-map-view] Invalid WGS84 coordinates:', point);
          return point;
        }

        const [x, y] = proj4('WGS84', targetProjection, [point.x, point.y]);
        
        // Validate transformed coordinates
        const isValidSwissResult = (coord: number, isX: boolean) => {
          const [minX, maxX] = [2000000, 3000000];
          const [minY, maxY] = [1000000, 2000000];
          const value = isX ? coord : coord;
          const [min, max] = isX ? [minX, maxX] : [minY, maxY];
          return isFinite(value) && value >= min && value <= max;
        };

        if (!isValidSwissResult(x, true) || !isValidSwissResult(y, false)) {
          console.error('[use-map-view] Invalid Swiss transformation result:', { x, y });
          return point;
        }

        console.debug('[use-map-view] Transformed WGS84 to Swiss:', {
          from: [point.x, point.y],
          to: [x, y]
        });

        return { x, y };
      }

      console.warn('[use-map-view] Unsupported transformation:', { fromSystem, toSystem });
      return point;
    } catch (error) {
      console.error('[use-map-view] Coordinate transformation error:', error);
      return point;
    }
  }, []);

  // Transform bounds between coordinate systems
  const transformBounds = useCallback(async (
    bounds: Bounds,
    fromSystem: CoordinateSystem,
    toSystem: CoordinateSystem = COORDINATE_SYSTEMS.WGS84
  ): Promise<Bounds> => {
    if (fromSystem === toSystem) return bounds;

    try {
      console.debug('[use-map-view] Transforming bounds:', {
        from: fromSystem,
        to: toSystem,
        bounds
      });

      // For Swiss coordinates, validate bounds are within reasonable range
      if (isSwissSystem(fromSystem)) {
        const isValidSwissBounds = (
          bounds.minX >= 2000000 && bounds.maxX <= 3000000 &&
          bounds.minY >= 1000000 && bounds.maxY <= 2000000
        );

        if (!isValidSwissBounds) {
          console.warn('[use-map-view] Swiss bounds outside valid range:', bounds);
          return bounds;
        }
      }

      // Transform each corner and midpoints for better accuracy
      const points = [
        // Corners
        { x: bounds.minX, y: bounds.minY },
        { x: bounds.minX, y: bounds.maxY },
        { x: bounds.maxX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.maxY },
        // Midpoints
        { x: (bounds.minX + bounds.maxX) / 2, y: bounds.minY },
        { x: (bounds.minX + bounds.maxX) / 2, y: bounds.maxY },
        { x: bounds.minX, y: (bounds.minY + bounds.maxY) / 2 },
        { x: bounds.maxX, y: (bounds.minY + bounds.maxY) / 2 }
      ];

      const transformedPoints = await Promise.all(
        points.map(point => transformCoordinates(point, fromSystem, toSystem))
      );

      // Filter out invalid transformations and get valid bounds
      const validPoints = transformedPoints.filter(point => 
        isFinite(point.x) && isFinite(point.y) &&
        (isWGS84System(toSystem) ? 
          Math.abs(point.y) <= 90 && Math.abs(point.x) <= 180 :
          point.x >= 2000000 && point.x <= 3000000 && 
          point.y >= 1000000 && point.y <= 2000000)
      );

      if (validPoints.length === 0) {
        console.error('[use-map-view] No valid points after transformation');
        return bounds;
      }

      // Calculate new bounds from transformed points
      const transformedBounds = {
        minX: Math.min(...validPoints.map(p => p.x)),
        minY: Math.min(...validPoints.map(p => p.y)),
        maxX: Math.max(...validPoints.map(p => p.x)),
        maxY: Math.max(...validPoints.map(p => p.y))
      };

      // Add padding for better visibility
      if (isWGS84System(toSystem)) {
        const dx = (transformedBounds.maxX - transformedBounds.minX) * BOUNDS_PADDING_PERCENT;
        const dy = (transformedBounds.maxY - transformedBounds.minY) * BOUNDS_PADDING_PERCENT;
        transformedBounds.minX -= dx;
        transformedBounds.minY -= dy;
        transformedBounds.maxX += dx;
        transformedBounds.maxY += dy;
      }

      console.debug('[use-map-view] Transformed bounds:', {
        original: bounds,
        transformed: transformedBounds,
        validPoints: validPoints.length
      });

      return transformedBounds;
    } catch (error) {
      console.error('[use-map-view] Error transforming bounds:', error);
      return bounds;
    }
  }, [transformCoordinates]);

  const calculateBoundsFromFeatures = useCallback(async (features: Feature[]): Promise<Bounds | null> => {
    if (!features.length) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const updateBounds = async (coords: [number, number]): Promise<void> => {
      try {
        // Transform coordinates if needed
        if (coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
          const transformed = await transformCoordinates(
            { x: coords[0], y: coords[1] },
            coordinateSystem,
            COORDINATE_SYSTEMS.WGS84
          );
          
          if (isFinite(transformed.x) && isFinite(transformed.y)) {
            minX = Math.min(minX, transformed.x);
            minY = Math.min(minY, transformed.y);
            maxX = Math.max(maxX, transformed.x);
            maxY = Math.max(maxY, transformed.y);
          }
        } else {
          if (isFinite(coords[0]) && isFinite(coords[1])) {
            minX = Math.min(minX, coords[0]);
            minY = Math.min(minY, coords[1]);
            maxX = Math.max(maxX, coords[0]);
            maxY = Math.max(maxY, coords[1]);
          }
        }
      } catch (error) {
        console.error('[use-map-view] Error updating bounds:', error);
      }
    };

    const processCoordinates = async (coords: any, isTransformed: boolean = false): Promise<void> => {
      if (!Array.isArray(coords)) return;
      if (typeof coords[0] === 'number' && coords.length >= 2) {
        if (isTransformed) {
          // Use coordinates directly if already transformed
          minX = Math.min(minX, coords[0]);
          minY = Math.min(minY, coords[1]);
          maxX = Math.max(maxX, coords[0]);
          maxY = Math.max(maxY, coords[1]);
        } else {
          await updateBounds(coords as [number, number]);
        }
      } else {
        for (const c of coords) {
          await processCoordinates(c, isTransformed);
        }
      }
    };

    for (const feature of features) {
      if (feature.geometry && 'coordinates' in feature.geometry) {
        const isTransformed = feature.properties?._transformedCoordinates === true;
        await processCoordinates(feature.geometry.coordinates, isTransformed);
      }
    }

    // Validate bounds values
    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY) ||
        minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
      console.warn('[DEBUG] Invalid bounds calculated:', { minX, minY, maxX, maxY });
      return {
        minX: DEFAULT_CENTER.longitude - 0.1,
        minY: DEFAULT_CENTER.latitude - 0.1,
        maxX: DEFAULT_CENTER.longitude + 0.1,
        maxY: DEFAULT_CENTER.latitude + 0.1
      };
    }

    // Validate bounds are reasonable
    if (Math.abs(maxX - minX) > 360 || Math.abs(maxY - minY) > 180) {
      console.warn('[DEBUG] Unreasonable bounds calculated:', { minX, minY, maxX, maxY });
      return {
        minX: DEFAULT_CENTER.longitude - 0.1,
        minY: DEFAULT_CENTER.latitude - 0.1,
        maxX: DEFAULT_CENTER.longitude + 0.1,
        maxY: DEFAULT_CENTER.latitude + 0.1
      };
    }

    return { minX, minY, maxX, maxY };
  }, [coordinateSystem, transformCoordinates]);

  const updateViewFromBounds = useCallback(async (bounds: Bounds) => {
    // Skip if bounds are already set and we're just changing coordinate systems
    if (initialBoundsSet && viewState.zoom > 0) {
      console.debug('[DEBUG] Skipping bounds update - view already initialized');
      return;
    }

    try {
      console.debug('[DEBUG] Updating view from bounds:', {
        bounds,
        coordinateSystem,
        currentZoom: viewState.zoom
      });

      // Transform bounds to WGS84 if needed
      let transformedBounds = bounds;
      if (coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
        transformedBounds = await transformBounds(bounds, coordinateSystem, COORDINATE_SYSTEMS.WGS84);
      }

      // Skip bounds update if zooming out beyond reasonable limits
      if (viewState.zoom < 2 && Math.abs(transformedBounds.maxX - transformedBounds.minX) > 360) {
        console.debug('[DEBUG] Skipping bounds update - zoom level too low:', viewState.zoom);
        return;
      }

      // Calculate viewport settings from bounds
      const viewport = new WebMercatorViewport({
        width: window.innerWidth,
        height: window.innerHeight
      });

      // Add validation before fitBounds
      if (transformedBounds &&
        isFinite(transformedBounds.minX) &&
        isFinite(transformedBounds.minY) &&
        isFinite(transformedBounds.maxX) &&
        isFinite(transformedBounds.maxY)) {
        const { longitude, latitude, zoom } = viewport.fitBounds(
          [
            [transformedBounds.minX, transformedBounds.minY],
            [transformedBounds.maxX, transformedBounds.maxY]
          ],
          { padding: 20 }
        );

        setViewState(prev => ({
          ...prev,
          longitude,
          latitude,
          zoom: Math.min(zoom, 20), // Cap zoom level
          transitionDuration: 1000
        }));
      } else {
        console.warn('[DEBUG] Invalid bounds for fitBounds:', transformedBounds);
      }
    } catch (error) {
      console.error('[DEBUG] Error updating view from bounds:', error);
    }
  }, [coordinateSystem, viewState, initialBoundsSet, transformBounds, transformCoordinates]);

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
    // If view isn't initialized, use initial bounds
    if (!viewState || !initialBoundsSet) {
      if (initialBounds) {
        // If initial bounds are in WGS84 or already transformed, use them directly
        if (coordinateSystem === COORDINATE_SYSTEMS.WGS84 || initialBounds._transformedCoordinates) {
          return [
            initialBounds.minX,
            initialBounds.minY,
            initialBounds.maxX,
            initialBounds.maxY
          ];
        }
        // Otherwise, skip bounds calculation until transformation is complete
        return undefined;
      }
      return undefined;
    }

    const { longitude, latitude, zoom } = viewState;

    // Skip bounds calculation for invalid view state
    if (!isFinite(longitude) || !isFinite(latitude) || !isFinite(zoom)) {
      console.debug('[DEBUG] Invalid viewState values:', { longitude, latitude, zoom });
      return undefined;
    }

    // Skip bounds calculation for low zoom levels
    if (zoom < 10) {
      return undefined;
    }

    try {
      const latRange = 360 / Math.pow(2, zoom + 1);
      const lonRange = 360 / Math.pow(2, zoom);

      const minLon = longitude - lonRange / 2;
      const minLat = latitude - latRange / 2;
      const maxLon = longitude + lonRange / 2;
      const maxLat = latitude + latRange / 2;

      // Validate calculated bounds
      if (!isFinite(minLon) || !isFinite(minLat) || !isFinite(maxLon) || !isFinite(maxLat)) {
        console.debug('[DEBUG] Invalid calculated bounds:', { minLon, minLat, maxLon, maxLat });
        return undefined;
      }

      return [minLon, minLat, maxLon, maxLat];
    } catch (error) {
      console.error('[DEBUG] Error calculating viewport bounds:', error);
      return undefined;
    }
  }, [viewState.longitude, viewState.latitude, viewState.zoom, initialBoundsSet, initialBounds, coordinateSystem]);

  // Set initial bounds
  useEffect(() => {
    if (!initialBounds || initialBoundsSet) return;

    const setBounds = async () => {
      try {
        console.debug('[use-map-view] Setting initial bounds:', {
          bounds: initialBounds,
          system: coordinateSystem
        });

        // Transform bounds to WGS84 if needed
        const wgs84Bounds = await transformBounds(initialBounds, coordinateSystem);
        
        // Add padding
        const dx = (wgs84Bounds.maxX - wgs84Bounds.minX) * BOUNDS_PADDING_PERCENT;
        const dy = (wgs84Bounds.maxY - wgs84Bounds.minY) * BOUNDS_PADDING_PERCENT;
        const paddedBounds = {
          minX: wgs84Bounds.minX - dx,
          minY: wgs84Bounds.minY - dy,
          maxX: wgs84Bounds.maxX + dx,
          maxY: wgs84Bounds.maxY + dy
        };

        // Create viewport and get new view state
        const viewport = new WebMercatorViewport({
          width: window.innerWidth,
          height: window.innerHeight
        });

        const { longitude, latitude, zoom } = viewport.fitBounds(
          [[paddedBounds.minX, paddedBounds.minY], [paddedBounds.maxX, paddedBounds.maxY]],
          { padding: 20 }
        );

        console.debug('[use-map-view] Setting view state:', {
          longitude,
          latitude,
          zoom
        });

        setViewState(prev => ({
          ...prev,
          longitude,
          latitude,
          zoom
        }));
        setInitialBoundsSet(true);
      } catch (error) {
        console.error('[use-map-view] Error setting initial bounds:', error);
      }
    };

    setBounds();
  }, [initialBounds, coordinateSystem, initialBoundsSet, transformBounds]);

  return {
    viewState,
    onMove,
    updateViewFromBounds,
    focusOnFeatures,
    getViewportBounds,
    initialBoundsSet
  };
}
