import { useState, useCallback, useEffect } from 'react';
import { ViewStateChangeEvent } from 'react-map-gl';
import { Feature, BBox } from 'geojson';
import { COORDINATE_SYSTEMS, CoordinateSystem, Bounds, DEFAULT_CENTER } from '../types/coordinates';
import { ViewState, UseMapViewResult } from '../types/map';
import { CoordinateTransformer } from '../utils/coordinate-utils';
import { ErrorReporter } from '../utils/errors';
import type { Proj4Type } from '../types/proj4';

const BOUNDS_PADDING_DEGREES = 0.1; // 10% padding

export function useMapView(
  errorReporter: ErrorReporter,
  initialBounds?: Bounds,
  coordinateSystem?: CoordinateSystem,
  proj4Instance?: Proj4Type
): UseMapViewResult {
  const [viewState, setViewState] = useState<ViewState>({
    longitude: DEFAULT_CENTER.longitude,
    latitude: DEFAULT_CENTER.latitude,
    zoom: DEFAULT_CENTER.zoom,
    bearing: 0,
    pitch: 0
  });

  // Verify coordinate system is properly initialized
  useEffect(() => {
    if (!coordinateSystem) {
      return;
    }

    if (!proj4Instance) {
      errorReporter.reportError('INITIALIZATION_ERROR', 'proj4 instance not provided');
      return;
    }

    if (!proj4Instance.defs(coordinateSystem)) {
      errorReporter.reportError('COORDINATE_SYSTEM', 'Coordinate system not initialized', {
        system: coordinateSystem
      });
      setViewState({
        longitude: DEFAULT_CENTER.longitude,
        latitude: DEFAULT_CENTER.latitude,
        zoom: DEFAULT_CENTER.zoom,
        bearing: 0,
        pitch: 0
      });
    }
  }, [coordinateSystem, errorReporter, proj4Instance]);

  const calculateBoundsFromFeatures = useCallback((features: Feature[]): BBox | null => {
    if (features.length === 0) {
      return null;
    }

    let transformer: CoordinateTransformer | undefined;
    if (coordinateSystem && coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
      if (!proj4Instance) {
        errorReporter.reportError('INITIALIZATION_ERROR', 'proj4 instance not provided');
        return null;
      }

      try {
        transformer = new CoordinateTransformer(
          coordinateSystem,
          COORDINATE_SYSTEMS.WGS84,
          errorReporter,
          proj4Instance
        );
      } catch (error) {
        errorReporter.reportError('TRANSFORM_ERROR', 'Failed to create coordinate transformer', {
          error: error instanceof Error ? error.message : 'Unknown error',
          coordinateSystem
        });
        return null;
      }
    }

    try {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      features.forEach(feature => {
        if (feature.bbox) {
          minX = Math.min(minX, feature.bbox[0]);
          minY = Math.min(minY, feature.bbox[1]);
          maxX = Math.max(maxX, feature.bbox[2]);
          maxY = Math.max(maxY, feature.bbox[3]);
        }
      });

      if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
        errorReporter.reportError('BOUNDS_ERROR', 'Invalid bounds calculated from features', {
          minX,
          minY,
          maxX,
          maxY
        });
        return null;
      }

      // Transform bounds if needed
      if (transformer) {
        const transformedBounds = transformer.transformBounds({ minX, minY, maxX, maxY });
        if (!transformedBounds) {
          errorReporter.reportWarning('TRANSFORM_WARNING', 'Failed to transform bounds', {
            originalBounds: { minX, minY, maxX, maxY }
          });
          return null;
        }
        ({ minX, minY, maxX, maxY } = transformedBounds);
      }

      return [minX, minY, maxX, maxY];
    } catch (error) {
      errorReporter.reportError('BOUNDS_ERROR', 'Failed to calculate bounds from features', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }, [coordinateSystem, errorReporter, proj4Instance]);

  const updateViewFromBounds = useCallback((bounds: Bounds) => {
    try {
      let transformer: CoordinateTransformer | undefined;
      if (coordinateSystem && coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
        if (!proj4Instance) {
          errorReporter.reportError('INITIALIZATION_ERROR', 'proj4 instance not provided');
          return;
        }

        transformer = new CoordinateTransformer(
          coordinateSystem,
          COORDINATE_SYSTEMS.WGS84,
          errorReporter,
          proj4Instance
        );
      }

      // Transform bounds if needed
      let { minX, minY, maxX, maxY } = bounds;
      if (transformer) {
        const transformedBounds = transformer.transformBounds(bounds);
        if (!transformedBounds) {
          errorReporter.reportError('TRANSFORM_ERROR', 'Failed to transform bounds', {
            bounds,
            coordinateSystem
          });
          return;
        }
        ({ minX, minY, maxX, maxY } = transformedBounds);
      }

      // Calculate center and zoom
      const centerLon = (minX + maxX) / 2;
      const centerLat = (minY + maxY) / 2;

      // Add padding
      const width = maxX - minX;
      const height = maxY - minY;
      const padding = Math.max(width, height) * BOUNDS_PADDING_DEGREES;

      // Constrain to valid ranges
      const lat = Math.max(-85, Math.min(85, centerLat));
      const lon = ((centerLon + 180) % 360) - 180;

      errorReporter.reportInfo('VIEW_UPDATE', 'Updating map view', {
        center: [lon, lat],
        bounds: [minX, minY, maxX, maxY],
        padding
      });

      setViewState({
        longitude: lon,
        latitude: lat,
        zoom: 12, // TODO: Calculate zoom based on bounds
        bearing: 0,
        pitch: 0
      });
    } catch (error) {
      errorReporter.reportError('VIEW_ERROR', 'Failed to update view from bounds', {
        error: error instanceof Error ? error.message : 'Unknown error',
        bounds
      });
    }
  }, [coordinateSystem, errorReporter, proj4Instance]);

  const focusOnFeatures = useCallback((features: Feature[], padding?: number) => {
    try {
      const bounds = calculateBoundsFromFeatures(features);
      if (!bounds) {
        errorReporter.reportError('FOCUS_ERROR', 'Failed to calculate bounds for features');
        return;
      }

      updateViewFromBounds({
        minX: bounds[0],
        minY: bounds[1],
        maxX: bounds[2],
        maxY: bounds[3]
      });
    } catch (error) {
      errorReporter.reportError('FOCUS_ERROR', 'Failed to focus on features', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }, [calculateBoundsFromFeatures, updateViewFromBounds, errorReporter]);

  const onMove = useCallback((evt: ViewStateChangeEvent) => {
    setViewState(evt.viewState);
  }, []);

  const getViewportBounds = useCallback((): BBox | undefined => {
    try {
      const { longitude, latitude, zoom } = viewState;

      // Calculate viewport dimensions in degrees
      const latRange = 180 / Math.pow(2, zoom);
      const lonRange = 360 / Math.pow(2, zoom);

      errorReporter.reportInfo('VIEWPORT_BOUNDS', 'Calculated viewport bounds', {
        center: [longitude, latitude],
        zoom,
        ranges: [lonRange, latRange]
      });

      return [
        longitude - lonRange / 2,
        latitude - latRange / 2,
        longitude + lonRange / 2,
        latitude + latRange / 2
      ];
    } catch (error) {
      errorReporter.reportError('VIEWPORT_ERROR', 'Failed to calculate viewport bounds', {
        error: error instanceof Error ? error.message : 'Unknown error',
        viewState
      });
      return undefined;
    }
  }, [viewState, errorReporter]);

  // Update view when initial bounds change
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
