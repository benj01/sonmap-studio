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
import WebMercatorViewport from '@math.gl/web-mercator';

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

    const isSupported = coordinateSystemManager.isSupported(coordinateSystem);
    console.debug('[DEBUG] Coordinate system check:', {
      system: coordinateSystem,
      isSupported,
      initialized: coordinateSystemManager.isInitialized()
    });

    if (!isSupported) {
      console.warn(`[DEBUG] Unsupported coordinate system: ${coordinateSystem}`);
      // Fallback to WGS84 if system not supported
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

  const updateViewFromBounds = useCallback(async (bounds: Bounds) => {
    if (!coordinateSystemManager.isInitialized()) {
      console.warn('[DEBUG] Coordinate system manager not initialized');
      return;
    }

    try {
      console.debug('[DEBUG] Updating view from bounds:', {
        bounds,
        coordinateSystem,
        currentView: viewState
      });

      // Transform bounds to WGS84 if needed
      const transformedBounds = coordinateSystem === COORDINATE_SYSTEMS.WGS84
        ? bounds
        : await coordinateSystemManager.transformBounds(bounds, coordinateSystem, COORDINATE_SYSTEMS.WGS84);

      console.debug('[DEBUG] Transformed bounds:', {
        original: bounds,
        transformed: transformedBounds
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
    } catch (error) {
      console.error('[DEBUG] Error updating view from bounds:', error);
    }
  }, [coordinateSystem, viewState]);

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
