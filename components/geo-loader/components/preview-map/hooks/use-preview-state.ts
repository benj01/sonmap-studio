import { useState, useCallback, useEffect, useRef } from 'react';
import { Feature, FeatureCollection } from 'geojson';
import { PreviewManager } from '../../../preview/preview-manager';
import type { 
  CacheStats, 
  CachedPreviewResult, 
  CachedFeatureCollection,
  PreviewCollections 
} from '../../../types/cache';
import { cacheManager } from '../../../core/cache-manager';
import { COORDINATE_SYSTEMS } from '../../../types/coordinates';

const CACHE_KEY_PREFIX = 'preview-map';
const DEBOUNCE_TIME = 100; // ms

interface PreviewState {
  points: FeatureCollection;
  lines: FeatureCollection;
  polygons: FeatureCollection;
  totalCount: number;
  visibleCount: number;
}

interface CacheStats {
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
}: UsePreviewStateProps) {
  const [previewState, setPreviewState] = useState<PreviewState>({
    points: { type: 'FeatureCollection', features: [] },
    lines: { type: 'FeatureCollection', features: [] },
    polygons: { type: 'FeatureCollection', features: [] },
    totalCount: 0,
    visibleCount: 0
  });

  const [cacheStats, setCacheStats] = useState<CacheStats>({
    hitRate: 0,
    missRate: 0,
    size: 0
  });

  const updateRequestRef = useRef(0);

  // Update visible layers when they change
  useEffect(() => {
    if (!previewManager) return;
    
    console.debug('[DEBUG] Updating preview manager visible layers:', visibleLayers);
    previewManager.setOptions({ visibleLayers });
    updatePreviewRef.current();
  }, [previewManager, visibleLayers]);

  // Stabilize callback references
  const stableOnUpdateBounds = useRef(onUpdateBounds);
  const stableOnPreviewUpdate = useRef(onPreviewUpdate);

  useEffect(() => {
    stableOnUpdateBounds.current = onUpdateBounds;
    stableOnPreviewUpdate.current = onPreviewUpdate;
  }, [onUpdateBounds, onPreviewUpdate]);

  // Separate the update logic into a stable reference
  const updatePreviewRef = useRef(async () => {
    if (!previewManager) return;

    const currentRequest = ++updateRequestRef.current;
    const abortController = new AbortController();

    try {
      console.debug('[DEBUG] Updating preview collections');
      const collections = await previewManager.getPreviewCollections();
      
      if (!collections || currentRequest !== updateRequestRef.current) {
        console.debug('[DEBUG] Preview update cancelled or superseded');
        return;
      }

      console.debug('[DEBUG] Setting new preview state:', {
        pointCount: collections.points.features.length,
        lineCount: collections.lines.features.length,
        polygonCount: collections.polygons.features.length,
        totalCount: collections.totalCount,
        visibleCount: collections.visibleCount
      });

      setPreviewState({
        points: collections.points,
        lines: collections.lines,
        polygons: collections.polygons,
        totalCount: collections.totalCount,
        visibleCount: collections.visibleCount
      });

      if (!initialBoundsSet && collections.bounds) {
        console.debug('[DEBUG] Updating initial bounds:', collections.bounds);
        stableOnUpdateBounds.current?.(collections.bounds);
      }

      stableOnPreviewUpdate.current?.();
    } catch (error) {
      console.error('[ERROR] Failed to update preview:', error);
    } finally {
      abortController.abort();
    }
  });

  // Separate effect for layer visibility
  useEffect(() => {
    if (!previewManager) return;
    
    console.debug('[DEBUG] Syncing layer visibility:', {
      current: previewManager.getOptions().visibleLayers,
      new: visibleLayers
    });

    previewManager.setOptions({ visibleLayers });
    
    // Debounce the preview update
    const timeoutId = setTimeout(() => {
      updatePreviewRef.current();
    }, DEBOUNCE_TIME);

    return () => clearTimeout(timeoutId);
  }, [previewManager, visibleLayers]);

  // Separate effect for viewport updates
  useEffect(() => {
    if (!previewManager || (!initialBoundsSet && !viewportBounds)) return;

    console.debug('[DEBUG] Viewport update triggered:', {
      bounds: viewportBounds,
      initialBoundsSet
    });

    const timeoutId = setTimeout(() => {
      updatePreviewRef.current();
    }, DEBOUNCE_TIME);

    return () => clearTimeout(timeoutId);
  }, [previewManager, viewportBounds, initialBoundsSet]);

  return { previewState, cacheStats };
}
