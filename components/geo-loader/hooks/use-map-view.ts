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
      // Transform coordinates to WGS84 if needed
      let lon = coords[0];
      let lat = coords[1];

      if (coordinateSystem && coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
        const transformed = await transformCoordinates(
          { x: coords[0], y: coords[1] },
          coordinateSystem,
          COORDINATE_SYSTEMS.WGS84
        );
        lon = transformed.x;
        lat = transformed.y;
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

      // Transform bounds to WGS84 if needed
      let transformedBounds = bounds;
      
      if (coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
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
        
        transformedBounds = {
          minX: minPoint.x,
          minY: minPoint.y,
          maxX: maxPoint.x,
          maxY: maxPoint.y
        };
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
    if (!viewState || !initialBoundsSet) {
      if (initialBounds) {
        return [
          initialBounds.minX,
          initialBounds.minY,
          initialBounds.maxX,
          initialBounds.maxY
        ];
      }
      return undefined;
    }

    const { longitude, latitude, zoom } = viewState;
    
    if (!isFinite(longitude) || !isFinite(latitude) || !isFinite(zoom)) {
      console.debug('[DEBUG] Invalid viewState values:', { longitude, latitude, zoom });
      return undefined;
    }
    
    if (zoom < 10) {
      return undefined;
    }
    
    const latRange = 360 / Math.pow(2, zoom + 1);
    const lonRange = 360 / Math.pow(2, zoom);
    
    const minLon = longitude - lonRange / 2;
    const minLat = latitude - latRange / 2;
    const maxLon = longitude + lonRange / 2;
    const maxLat = latitude + latRange / 2;
    
    if (!isFinite(minLon) || !isFinite(minLat) || !isFinite(maxLon) || !isFinite(maxLat)) {
      console.debug('[DEBUG] Invalid calculated bounds:', { minLon, minLat, maxLon, maxLat });
      return undefined;
    }
    
    return [minLon, minLat, maxLon, maxLat];
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
