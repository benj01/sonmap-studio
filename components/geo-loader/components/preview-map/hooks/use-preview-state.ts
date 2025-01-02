import { useState, useCallback, useEffect } from 'react';
import { Feature, FeatureCollection } from 'geojson';
import { PreviewManager } from '../../../preview/preview-manager';
import type { CacheStats, CachedPreviewResult, CachedFeatureCollection } from '../../../types/cache';
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

  // Debounced preview update function
  const updatePreview = useCallback(async () => {
    if (!previewManager) {
      console.debug('[DEBUG] No preview manager available');
      return;
    }

    try {
      console.debug('[DEBUG] Updating preview with state:', {
        initialBoundsSet,
        viewportBounds,
        visibleLayers,
        hasPreviewManager: !!previewManager
      });

      // Get collections first
      const collections = await previewManager.getPreviewCollections();
      if (!collections) return;

      // Update bounds in preview manager
      const options: any = {};
      
      if (!initialBoundsSet && collections.bounds) {
        // On initial load, use collection bounds
        options.initialBounds = collections.bounds;
      } else if (viewportBounds) {
        // After initial load, use viewport bounds
        options.viewportBounds = viewportBounds;
      }

      if (Object.keys(options).length > 0) {
        previewManager.setOptions(options);
      }

      // Filter by layer visibility - empty array means all layers visible
      const filterFeatures = (fc: FeatureCollection) => {
        if (!fc.features.length) return fc;
        
        const filtered = fc.features.filter((f: Feature) => {
          const layer = f.properties?.layer;
          const isVisible = !layer || visibleLayers.length === 0 || visibleLayers.includes(layer);

          console.debug('[DEBUG] Feature visibility check:', {
            layer,
            visibleLayers,
            isVisible,
            geometryType: f.geometry.type,
            coordinates: 'coordinates' in f.geometry ? f.geometry.coordinates : undefined
          });

          return isVisible;
        });

        return { ...fc, features: filtered };
      };

      console.debug('[DEBUG] Filtering collections:', {
        originalCounts: {
          points: collections.points.features.length,
          lines: collections.lines.features.length,
          polygons: collections.polygons.features.length
        }
      });

      const filteredPoints = filterFeatures(collections.points);
      const filteredLines = filterFeatures(collections.lines);
      const filteredPolygons = filterFeatures(collections.polygons);

      console.debug('[DEBUG] Filtered collections:', {
        filteredCounts: {
          points: filteredPoints.features.length,
          lines: filteredLines.features.length,
          polygons: filteredPolygons.features.length
        }
      });

      const filteredVisibleCount = 
        filteredPoints.features.length + 
        filteredLines.features.length + 
        filteredPolygons.features.length;

      setPreviewState({
        points: filteredPoints,
        lines: filteredLines,
        polygons: filteredPolygons,
        totalCount: collections.totalCount,
        visibleCount: filteredVisibleCount
      });

      // Notify that preview has been updated
      onPreviewUpdate?.();

      // Cache the filtered results
      const combinedFeatures: Feature[] = [
        ...filteredPoints.features,
        ...filteredLines.features,
        ...filteredPolygons.features
      ];

      const cacheResult: CachedPreviewResult = {
        features: {
          type: 'FeatureCollection',
          features: combinedFeatures
        },
        viewportBounds,
        layers: visibleLayers,
        featureCount: filteredVisibleCount,
        coordinateSystem: previewManager.getOptions().coordinateSystem || COORDINATE_SYSTEMS.WGS84
      };

      if (viewportBounds) {
        const cacheKey = `${CACHE_KEY_PREFIX}:viewport:${viewportBounds.join(',')}`;
        cacheManager.cachePreview(cacheKey, {
          viewportBounds,
          visibleLayers
        }, cacheResult);

        setCacheStats(prev => ({
          hits: prev.hits,
          misses: prev.misses + 1,
          hitRate: prev.hits / (prev.hits + prev.misses + 1)
        }));
      }

      // Update bounds on initial load
      if (!initialBoundsSet && collections.bounds) {
        onUpdateBounds(collections.bounds);
      }
    } catch (error) {
      console.error('[DEBUG] Error updating preview:', error);
    }
  }, [previewManager, viewportBounds, visibleLayers, initialBoundsSet]);

  // Debounced update effect
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

    // After initial load, debounce updates and require viewportBounds
    if (!viewportBounds) {
      console.debug('[DEBUG] Skipping preview update - missing bounds');
      return;
    }

    console.debug('[DEBUG] Scheduling preview update with state:', {
      hasPreviewManager: !!previewManager,
      viewportBounds,
      visibleLayers,
      initialBoundsSet,
      coordinateSystem: previewManager.getOptions().coordinateSystem
    });

    const timeoutId = setTimeout(updatePreview, DEBOUNCE_TIME);
    return () => clearTimeout(timeoutId);
  }, [previewManager, viewportBounds, visibleLayers, initialBoundsSet, updatePreview]);

  return { previewState, cacheStats };
}
