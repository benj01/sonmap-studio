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

    // Skip updates if viewport bounds haven't changed significantly
    const boundsKey = viewportBounds ? viewportBounds.join(',') : '';
    if (boundsKey && boundsKey === prevBoundsRef.current) {
      console.debug('[usePreviewState] Skipping update - bounds unchanged');
      return;
    }
    prevBoundsRef.current = boundsKey;

    console.debug('[usePreviewState] Updating preview collections:', {
      viewportBounds,
      visibleLayers,
      initialBoundsSet
    });

    const updatePreview = async () => {
      if (!mountedRef.current) return;

      try {
        setState(prev => ({ ...prev, loading: true }));

        // Update preview manager options
        console.debug('[DEBUG] Updating preview manager options in usePreviewState:', {
          viewportBounds,
          visibleLayers,
          enableCaching: true
        });

        previewManager.setOptions({
          viewportBounds,
          visibleLayers,
          enableCaching: true
        });

        // Get preview collections
        console.debug('[DEBUG] Getting preview collections...');
        const collections = await previewManager.getPreviewCollections();
        console.debug('[DEBUG] Preview collections received:', {
          hasCollections: !!collections,
          points: collections?.points?.features?.length || 0,
          lines: collections?.lines?.features?.length || 0,
          polygons: collections?.polygons?.features?.length || 0,
          bounds: collections?.bounds,
          totalCount: collections?.totalCount || 0
        });

        if (!mountedRef.current) return;

        if (!collections) {
          console.debug('[DEBUG] No collections returned');
          setState(prev => ({
            ...initialState,
            loading: false
          }));
          return;
        }

        // Validate and update collections
        const result = {
          points: collections.points || emptyCollection,
          lines: collections.lines || emptyCollection,
          polygons: collections.polygons || emptyCollection,
          totalCount: collections.totalCount || 0,
          loading: false,
          progress: 1
        };

        console.debug('[DEBUG] Setting new preview state:', {
          pointFeatures: result.points.features?.length || 0,
          lineFeatures: result.lines.features?.length || 0,
          polygonFeatures: result.polygons.features?.length || 0,
          totalCount: result.totalCount,
          visibleLayers
        });

        setState(result);

        // Update bounds if needed
        if (!initialBoundsSet && collections.bounds) {
          console.debug('[DEBUG] Setting initial bounds:', collections.bounds);
          onUpdateBounds?.(collections.bounds);
        }

        // Notify of preview update
        onPreviewUpdate?.();

      } catch (error) {
        console.error('[DEBUG] Error updating preview:', error);
        setState(prev => ({
          ...initialState,
          loading: false
        }));
      }
    };

    updatePreview();
  }, [previewManager, viewportBounds, visibleLayers, initialBoundsSet, onUpdateBounds, onPreviewUpdate]);

  return state;
}
