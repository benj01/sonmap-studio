// D:\HE\GitHub\sonmap-studio\components\geo-loader\components\preview-map\hooks\use-preview-state.ts
import { useState, useCallback, useEffect, useRef } from 'react';
import { Feature, FeatureCollection } from 'geojson';
import { PreviewManager } from '../../../preview/preview-manager';
import type {
  CachedPreviewResult,
  CachedFeatureCollection,
  PreviewCollections
} from '../../../types/cache';
import { cacheManager } from '../../../core/cache-manager';
import { COORDINATE_SYSTEMS } from '../../../types/coordinates';
import { Bounds } from '../../../core/feature-manager/bounds';
import { LogManager } from '../../../core/logging/log-manager';

const CACHE_KEY_PREFIX = 'preview-map';
const DEBOUNCE_TIME = 250; // ms
const MIN_UPDATE_INTERVAL = 1000; // ms
const PROGRESS_UPDATE_INTERVAL = 250; // ms

interface PreviewState {
  points: FeatureCollection;
  lines: FeatureCollection;
  polygons: FeatureCollection;
  totalCount: number;
  loading: boolean;
  progress: number;
}

interface PreviewCacheStats {
  hitRate: number;
  missRate: number;
  size: number;
}

interface UsePreviewStateProps {
  previewManager: PreviewManager | null;
  viewportBounds?: [number, number, number, number];
  visibleLayers: string[];
  initialBoundsSet: boolean;
  onUpdateBounds?: (bounds: Bounds) => void;
  onPreviewUpdate?: () => void;
}

export function usePreviewState({
  previewManager,
  viewportBounds,
  visibleLayers,
  initialBoundsSet,
  onUpdateBounds,
  onPreviewUpdate
}: UsePreviewStateProps): PreviewState {
  const emptyCollection = { type: 'FeatureCollection', features: [] } as FeatureCollection;
  const initialState: PreviewState = {
    points: emptyCollection,
    lines: emptyCollection,
    polygons: emptyCollection,
    totalCount: 0,
    loading: false,
    progress: 0
  };

  const [state, setState] = useState<PreviewState>(initialState);
  const mountedRef = useRef<boolean>(true);
  const prevBoundsRef = useRef<[number, number, number, number] | undefined>(undefined);
  const updateTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const lastUpdateRef = useRef<number>(0);
  const lastUpdateTimeRef = useRef<number>(0);

  // Helper to check if bounds have changed significantly
  const haveBoundsChangedSignificantly = (
    oldBounds?: [number, number, number, number],
    newBounds?: [number, number, number, number],
    threshold = 0.0001 // Increased threshold to reduce sensitivity
  ): boolean => {
    if (!oldBounds && !newBounds) return false;
    if (!oldBounds || !newBounds) return true;
    return oldBounds.some((value, index) => 
      Math.abs(value - newBounds[index]) > threshold
    );
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  // Update preview collections when viewport or layers change
  useEffect(() => {
    if (!previewManager) return;

    // Skip updates if viewport bounds haven't changed significantly
    if (!haveBoundsChangedSignificantly(prevBoundsRef.current, viewportBounds)) {
      return;
    }

    // Check if enough time has passed since last update
    const now = Date.now();
    if (now - lastUpdateTimeRef.current < MIN_UPDATE_INTERVAL) {
      // If we're updating too frequently, schedule an update for later
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      updateTimeoutRef.current = setTimeout(() => {
        // This will trigger the effect again after MIN_UPDATE_INTERVAL
        prevBoundsRef.current = undefined;
      }, MIN_UPDATE_INTERVAL - (now - lastUpdateTimeRef.current));
      return;
    }

    // Clear previous timeout
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    // Generate unique timestamp for this update
    const updateTimestamp = Date.now();
    lastUpdateRef.current = updateTimestamp;

    // Debounce viewport updates
    updateTimeoutRef.current = setTimeout(async () => {
      // Skip if component unmounted or newer update is pending
      if (!mountedRef.current || lastUpdateRef.current !== updateTimestamp) {
        return;
      }

      try {
        setState(prev => ({ ...prev, loading: true }));
        prevBoundsRef.current = viewportBounds;
        lastUpdateTimeRef.current = Date.now();

        // Update preview manager options
        previewManager.setOptions({
          viewportBounds,
          visibleLayers,
          enableCaching: true
        });

        // Get preview collections
        const collections = await previewManager.getPreviewCollections();
        
        // Skip if component unmounted or newer update is pending
        if (!mountedRef.current || lastUpdateRef.current !== updateTimestamp) {
          return;
        }

        if (!collections) {
          setState(prev => ({
            ...initialState,
            loading: false
          }));
          return;
        }

        // Only log significant state changes in development
        if (process.env.NODE_ENV === 'development') {
          const logger = LogManager.getInstance();
          const totalFeatures = (collections.points?.features.length || 0) +
                              (collections.lines?.features.length || 0) +
                              (collections.polygons?.features.length || 0);
          if (totalFeatures > 0) {
            logger.info('PreviewState', 'Updated collections', {
              totalFeatures,
              pointCount: collections.points?.features.length || 0,
              lineCount: collections.lines?.features.length || 0,
              polygonCount: collections.polygons?.features.length || 0
            });
          }
        }

        // Update state with new collections
        setState({
          points: collections.points || emptyCollection,
          lines: collections.lines || emptyCollection,
          polygons: collections.polygons || emptyCollection,
          totalCount: collections.totalCount || 0,
          loading: false,
          progress: 1
        });

        // Update bounds if needed
        if (!initialBoundsSet && collections.bounds && typeof onUpdateBounds === 'function') {
          onUpdateBounds(collections.bounds);
        }

        // Notify of preview update
        onPreviewUpdate?.();

      } catch (error) {
        // Only log errors
        const logger = LogManager.getInstance();
        logger.error('PreviewState', 'Failed to update preview', {
          error: error instanceof Error ? error.message : String(error)
        });
        
        setState(prev => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : String(error)
        }));
      }
    }, DEBOUNCE_TIME);

    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [previewManager, viewportBounds, visibleLayers, initialBoundsSet, onUpdateBounds, onPreviewUpdate]);

  return state;
}
