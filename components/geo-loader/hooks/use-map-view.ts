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
      if (isSwissSystem(fromSystem) && isWGS84System(toSystem)) {
        const projection = getProjection(fromSystem);
        if (!projection) return point;
        const [lon, lat] = proj4(projection, 'WGS84', [point.x, point.y]);
        return { x: lon, y: lat };
      } else if (isWGS84System(fromSystem) && isSwissSystem(toSystem)) {
        const projection = getProjection(toSystem);
        if (!projection) return point;
        const [x, y] = proj4('WGS84', projection, [point.x, point.y]);
        return { x, y };
      }
      return point;
    } catch (error) {
      console.error('Coordinate transformation error:', error);
      return point;
    }
  }, []);

  const calculateBoundsFromFeatures = useCallback(async (features: Feature[]): Promise<Bounds | null> => {
    if (!features.length) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const updateBounds = async (coords: [number, number]): Promise<void> => {
      // Use coordinates directly if already transformed, otherwise transform
      let lon = coords[0];
      let lat = coords[1];

      // Only transform if needed and not already transformed
      if (coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
        // Check if feature has already been transformed
        const isTransformed = features.some(f => f.properties?._transformedCoordinates);
        
        if (!isTransformed) {
          const transformed = await transformCoordinates(
            { x: coords[0], y: coords[1] },
            coordinateSystem,
            COORDINATE_SYSTEMS.WGS84
          );
          lon = transformed.x;
          lat = transformed.y;
        }
      }

      if (isFinite(lon) && isFinite(lat)) {
        minX = Math.min(minX, lon);
        minY = Math.min(minY, lat);
        maxX = Math.max(maxX, lon);
        maxY = Math.max(maxY, lat);
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
        currentView: viewState
      });

      // Use bounds directly if they're already in WGS84
      let transformedBounds = bounds;
      
      // Only transform if needed and bounds aren't already transformed
      if (coordinateSystem !== COORDINATE_SYSTEMS.WGS84 && !bounds._transformedCoordinates) {
        try {
          const minPoint = await transformCoordinates(
            { x: bounds.minX, y: bounds.minY },
            coordinateSystem,
            COORDINATE_SYSTEMS.WGS84
          );
          const maxPoint = await transformCoordinates(
            { x: bounds.maxX, y: bounds.maxY },
            coordinateSystem,
            COORDINATE_SYSTEMS.WGS84
          );

          // Validate transformed coordinates
          if (isFinite(minPoint.x) && isFinite(minPoint.y) && 
              isFinite(maxPoint.x) && isFinite(maxPoint.y)) {
            transformedBounds = {
              minX: minPoint.x,
              minY: minPoint.y,
              maxX: maxPoint.x,
              maxY: maxPoint.y,
              _transformedCoordinates: true
            };
          } else {
            console.warn('[DEBUG] Invalid transformed bounds, using original:', {
              minPoint,
              maxPoint
            });
          }
        } catch (error) {
          console.error('[DEBUG] Error transforming bounds:', error);
        }
      }

      console.debug('[DEBUG] Transformed bounds:', {
        original: bounds,
        transformed: transformedBounds,
        fromSystem: coordinateSystem,
        toSystem: COORDINATE_SYSTEMS.WGS84
      });

      // Calculate viewport settings from bounds
      const viewport = new WebMercatorViewport({
        width: window.innerWidth,
        height: window.innerHeight
      });

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
      setInitialBoundsSet(true);
    } catch (error) {
      console.error('[DEBUG] Error updating view from bounds:', error);
    }
  }, [coordinateSystem, viewState, initialBoundsSet]);

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
  }, [viewState.longitude, viewState.latitude, viewState.zoom, initialBoundsSet, initialBounds]);

  // Handle bounds updates after coordinate system verification
  useEffect(() => {
    const updateBounds = async () => {
      try {
        // Verify coordinate system support
        const supported = isSwissSystem(coordinateSystem) || isWGS84System(coordinateSystem);
        if (!supported) {
          console.warn('[DEBUG] Unsupported coordinate system:', coordinateSystem);
          return;
        }

        if (initialBounds) {
          console.debug('[DEBUG] Updating view with initial bounds:', {
            bounds: initialBounds,
            system: coordinateSystem
          });
          await updateViewFromBounds(initialBounds);
        }
      } catch (error) {
        console.error('[DEBUG] Failed to update view from bounds:', error);
        setViewState(prev => ({ ...prev, ...DEFAULT_CENTER }));
      }
    };

    updateBounds();
  }, [initialBounds, coordinateSystem, updateViewFromBounds]);

  return {
    viewState,
    onMove,
    updateViewFromBounds,
    focusOnFeatures,
    getViewportBounds,
    initialBoundsSet
  };
}
