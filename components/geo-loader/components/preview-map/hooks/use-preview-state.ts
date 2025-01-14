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

const CACHE_KEY_PREFIX = 'preview-map';
const DEBOUNCE_TIME = 100; // ms
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
  onUpdateBounds: (bounds: any) => void;
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
  const mountedRef = useRef(true);
  const prevBoundsRef = useRef(''); // Move useRef to the top level

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Update preview collections when viewport or layers change
  useEffect(() => {
    if (!previewManager) {
      console.debug('[usePreviewState] No preview manager available');
      return;
    }

    // Verify previewManager methods
    if (typeof previewManager.updatePreview !== 'function' || 
        typeof previewManager.getPreviewCollections !== 'function') {
      console.error('[usePreviewState] Preview manager missing required methods');
      return;
    }

    // Skip updates if viewport bounds haven't changed significantly
    const boundsKey = viewportBounds ? viewportBounds.join(',') : '';
    if (boundsKey && boundsKey === prevBoundsRef.current) {
      console.debug('[usePreviewState] Skipping update - bounds unchanged');
      return;
    }
    prevBoundsRef.current = boundsKey;

    const updatePreview = async () => {
      if (!mountedRef.current) return;

      try {
        setState(prev => ({ ...prev, loading: true, progress: 0 }));

        // Validate viewport bounds
        if (viewportBounds) {
          const [minX, minY, maxX, maxY] = viewportBounds;
          if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
            console.warn('[usePreviewState] Invalid viewport bounds:', viewportBounds);
            setState(prev => ({ ...prev, loading: false }));
            return;
          }

          // Check for valid bounds range
          if (minX >= maxX || minY >= maxY) {
            console.warn('[usePreviewState] Invalid bounds range:', viewportBounds);
            setState(prev => ({ ...prev, loading: false }));
            return;
          }
        }

        // Update preview manager with debounced options
        await previewManager.setOptions({
          viewportBounds,
          visibleLayers,
          enableCaching: true,
          debounceTime: DEBOUNCE_TIME
        });

        // Start progress tracking
        let progressInterval: NodeJS.Timeout | null = null;
        if (onPreviewUpdate) {
          progressInterval = setInterval(() => {
            if (mountedRef.current) {
              setState(prev => ({ ...prev, progress: Math.min(prev.progress + 10, 90) }));
            }
          }, PROGRESS_UPDATE_INTERVAL);
        }

        try {
          // Update preview features with timeout
          const updatePromise = previewManager.updatePreview({
            bounds: viewportBounds,
            visibleLayers,
            enableCaching: true
          });

          const result = await Promise.race([
            updatePromise,
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Preview update timeout')), 30000)
            )
          ]);

          if (!result) {
            throw new Error('Preview update returned no result');
          }

          // Get and validate collections
          const collections = await previewManager.getPreviewCollections();
          if (!mountedRef.current) return;

          if (!collections || !collections.points || !collections.lines || !collections.polygons) {
            throw new Error('Invalid collections returned');
          }

          // Update state with new collections
          setState(prev => ({
            points: collections.points,
            lines: collections.lines,
            polygons: collections.polygons,
            totalCount: 
              collections.points.features.length + 
              collections.lines.features.length + 
              collections.polygons.features.length,
            loading: false,
            progress: 100
          }));

          // Notify of update completion
          if (onPreviewUpdate) {
            onPreviewUpdate();
          }
        } finally {
          // Clean up progress interval
          if (progressInterval) {
            clearInterval(progressInterval);
          }
        }
      } catch (error) {
        console.error('[usePreviewState] Error updating preview:', error);
        setState(prev => ({
          ...initialState,
          loading: false,
          progress: 0
        }));
      }
    };

    updatePreview();
  }, [previewManager, viewportBounds, visibleLayers, initialBoundsSet, onUpdateBounds, onPreviewUpdate]);

  return state;
}