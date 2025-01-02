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
const DEBOUNCE_TIME = 250;

interface PreviewState {
  points: FeatureCollection;
  lines: FeatureCollection;
  polygons: FeatureCollection;
  totalCount: number;
  visibleCount: number;
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
    hits: 0,
    misses: 0,
    hitRate: 0
  });

  // Track the last update request to prevent race conditions
  const updateRequestRef = useRef(0);

  // Memoized cache key generation
  const getCacheKey = useCallback((bounds?: [number, number, number, number]) => {
    if (!bounds) return null;
    return `${CACHE_KEY_PREFIX}:viewport:${bounds.join(',')}:layers:${visibleLayers.join(',')}`;
  }, [visibleLayers]);

  // Split features by geometry type
  const splitFeatures = useCallback((features: Feature[]) => {
    const points: Feature[] = [];
    const lines: Feature[] = [];
    const polygons: Feature[] = [];

    features.forEach(feature => {
      if (!feature.geometry) return;
      
      switch (feature.geometry.type) {
        case 'Point':
          points.push(feature);
          break;
        case 'LineString':
        case 'MultiLineString':
          lines.push(feature);
          break;
        case 'Polygon':
        case 'MultiPolygon':
          polygons.push(feature);
          break;
      }
    });

    return { points, lines, polygons };
  }, []);

  // Optimized preview update with improved race condition handling
  const updatePreview = useCallback(async () => {
    if (!previewManager) {
      console.debug('[DEBUG] No preview manager available');
      return;
    }

    // Generate unique request ID
    const currentRequest = ++updateRequestRef.current;
    const abortController = new AbortController();

    try {
      // Try to get from cache first with versioned key
      const cacheKey = getCacheKey(viewportBounds);
      console.debug('[DEBUG] Updating preview with:', {
        requestId: currentRequest,
        hasViewportBounds: !!viewportBounds,
        visibleLayers,
        cacheKey
      });

      // Check cache with version tracking
      if (cacheKey) {
        const cached = await Promise.race([
          cacheManager.getCachedPreview('preview', {
            viewportBounds,
            visibleLayers,
            coordinateSystem: previewManager.getOptions().coordinateSystem,
            version: currentRequest // Add version to cache key
          }),
          new Promise((_, reject) => {
            abortController.signal.addEventListener('abort', () => 
              reject(new Error('Preview update aborted'))
            );
          })
        ]);

        if (cached && currentRequest === updateRequestRef.current) {
          console.debug('[DEBUG] Using cached preview for request:', currentRequest);
          const features = (cached as unknown as { features: { features: Feature[] } }).features;
          const { points, lines, polygons } = splitFeatures(features.features);

          setPreviewState(prev => ({
            points: { type: 'FeatureCollection', features: points },
            lines: { type: 'FeatureCollection', features: lines },
            polygons: { type: 'FeatureCollection', features: polygons },
            totalCount: features.features.length,
            visibleCount: points.length + lines.length + polygons.length
          }));
          
          setCacheStats(prev => ({
            hits: prev.hits + 1,
            misses: prev.misses,
            hitRate: (prev.hits + 1) / (prev.hits + prev.misses + 1)
          }));
          
          onPreviewUpdate?.();
          return;
        }
      }

      if (currentRequest !== updateRequestRef.current) {
        throw new Error('Preview update superseded');
      }

      console.debug('[DEBUG] Fetching fresh preview data for request:', currentRequest);

      // Get collections with abort signal and type assertion
      const collections = await Promise.race([
        previewManager.getPreviewCollections(),
        new Promise((_, reject) => {
          abortController.signal.addEventListener('abort', () => 
            reject(new Error('Preview update aborted'))
          );
        })
      ]);

      // Type guard for PreviewCollections
      const isPreviewCollections = (obj: any): obj is PreviewCollections => {
        return obj && 
          typeof obj === 'object' &&
          'points' in obj &&
          'lines' in obj &&
          'polygons' in obj &&
          'totalCount' in obj;
      };

      if (!collections || !isPreviewCollections(collections)) {
        console.debug('[DEBUG] Invalid collections data');
        return;
      }

      // Update bounds atomically
      const boundsUpdate = !initialBoundsSet && collections.bounds
        ? { initialBounds: collections.bounds }
        : viewportBounds
        ? { viewportBounds }
        : null;

      if (boundsUpdate) {
        previewManager.setOptions(boundsUpdate);
      }

      // Process collections atomically
      if (currentRequest === updateRequestRef.current) {
        // Calculate visible count from collections
        const visibleCount = 
          collections.points.features.length + 
          collections.lines.features.length + 
          collections.polygons.features.length;

        // Atomic state update using collections directly
        setPreviewState({
          points: collections.points,
          lines: collections.lines,
          polygons: collections.polygons,
          totalCount: collections.totalCount,
          visibleCount
        });

        // Cache result with version
        if (cacheKey) {
          const cacheResult: CachedPreviewResult = {
            features: {
              type: 'FeatureCollection',
              features: [
                ...collections.points.features,
                ...collections.lines.features,
                ...collections.polygons.features
              ]
            },
            viewportBounds,
            layers: visibleLayers,
            featureCount: visibleCount,
            coordinateSystem: previewManager.getOptions().coordinateSystem || COORDINATE_SYSTEMS.WGS84,
            version: currentRequest
          };

          cacheManager.cachePreview('preview', {
            viewportBounds,
            visibleLayers,
            coordinateSystem: previewManager.getOptions().coordinateSystem,
            version: currentRequest
          }, cacheResult);

          setCacheStats(prev => ({
            hits: prev.hits,
            misses: prev.misses + 1,
            hitRate: prev.hits / (prev.hits + prev.misses + 1)
          }));
        }

        onPreviewUpdate?.();

        // Update bounds if needed
        if (!initialBoundsSet && collections.bounds) {
          onUpdateBounds(collections.bounds);
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage !== 'Preview update superseded' && errorMessage !== 'Preview update aborted') {
        console.error('[DEBUG] Error updating preview:', errorMessage);
      }
    } finally {
      // Clean up abort controller
      abortController.abort();
    }
  }, [previewManager, viewportBounds, visibleLayers, initialBoundsSet, splitFeatures, getCacheKey, onUpdateBounds, onPreviewUpdate]);

  // Immediate effect for layer visibility updates
  useEffect(() => {
    if (!previewManager) return;

    console.debug('[DEBUG] Syncing layer visibility:', {
      current: previewManager.getOptions().visibleLayers,
      new: visibleLayers
    });

    previewManager.setOptions({ visibleLayers });
  }, [previewManager, visibleLayers]);

  // Debounced effect for preview updates
  useEffect(() => {
    if (!previewManager) {
      console.debug('[DEBUG] Skipping preview update - missing manager');
      return;
    }

    // On initial load, don't wait for viewportBounds
    if (!initialBoundsSet) {
      updatePreview();
      return;
    }

    // After initial load, require viewportBounds
    if (!viewportBounds) {
      console.debug('[DEBUG] Skipping preview update - missing bounds');
      return;
    }

    console.debug('[DEBUG] Scheduling preview update with state:', {
      hasPreviewManager: !!previewManager,
      viewportBounds,
      initialBoundsSet,
      coordinateSystem: previewManager.getOptions().coordinateSystem
    });

    const timeoutId = setTimeout(updatePreview, DEBOUNCE_TIME);
    return () => clearTimeout(timeoutId);
  }, [previewManager, viewportBounds, initialBoundsSet, updatePreview]);

  return { previewState, cacheStats };
}
