import { useState, useCallback, useEffect } from 'react';
import { Feature, FeatureCollection } from 'geojson';
import { PreviewManager } from '../../../preview/preview-manager';
import type { CacheStats, CachedPreviewResult, CachedFeatureCollection } from '../../../types/cache';
import { cacheManager } from '../../../core/cache-manager';
import { COORDINATE_SYSTEMS } from '../../../types/coordinates';
import bboxPolygon from '@turf/bbox-polygon';
import booleanIntersects from '@turf/boolean-intersects';

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

  // Memoize viewport polygon calculation with enhanced bounds validation
  const viewportPolygon = useCallback(() => {
    const isValidBounds = (bounds: any): bounds is [number, number, number, number] => {
      return (
        Array.isArray(bounds) &&
        bounds.length === 4 &&
        bounds.every(n => typeof n === 'number' && isFinite(n)) &&
        bounds[0] < bounds[2] && // minX < maxX
        bounds[1] < bounds[3]    // minY < maxY
      );
    };

    if (!viewportBounds || !isValidBounds(viewportBounds)) {
      console.debug('[DEBUG] Invalid viewport bounds:', viewportBounds);
      return null;
    }

    try {
      return bboxPolygon(viewportBounds);
    } catch (error) {
      console.error('[DEBUG] Failed to create viewport polygon:', error);
      return null;
    }
  }, [viewportBounds]);

  // Debounced preview update function
  const updatePreview = useCallback(async () => {
    if (!previewManager) return;

    try {
      // Only update bounds if we're doing the initial load
      if (!initialBoundsSet) {
        if (viewportBounds) {
          previewManager.setOptions({
            viewportBounds
          });
        }
      }

      const collections = await previewManager.getPreviewCollections();
      if (!collections) return;

      // Try to get filtered features from cache first
      const bounds2D = viewportBounds;
      const cacheKey = `${CACHE_KEY_PREFIX}:viewport:${bounds2D?.join(',')}`;
      const cached = cacheManager.getCachedPreview(cacheKey, {
        viewportBounds,
        visibleLayers
      });

      if (cached) {
        // Get cached features and apply visibility filter
        const cachedFeatures = ((cached as unknown) as { features: { features: Feature[] } }).features.features;
        
        // Filter by layer visibility - empty array means all layers visible
        const visibleFeatures = visibleLayers.length > 0
          ? cachedFeatures.filter((f: Feature) => 
              f.properties && 
              typeof f.properties.layer === 'string' && 
              visibleLayers.includes(f.properties.layer)
            )
          : cachedFeatures;

        // Split the visible features by geometry type
        const pointFeatures = visibleFeatures.filter((f: Feature) => 
          f.geometry.type === 'Point'
        );
        const lineFeatures = visibleFeatures.filter((f: Feature) => 
          f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString'
        );
        const polygonFeatures = visibleFeatures.filter((f: Feature) => 
          f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'
        );

        const newState: PreviewState = {
          points: { type: 'FeatureCollection', features: pointFeatures },
          lines: { type: 'FeatureCollection', features: lineFeatures },
          polygons: { type: 'FeatureCollection', features: polygonFeatures },
          totalCount: collections.totalCount,
          visibleCount: visibleFeatures.length
        };

        setPreviewState(newState);
        setCacheStats(prev => ({
          hits: prev.hits + 1,
          misses: prev.misses,
          hitRate: (prev.hits + 1) / (prev.hits + prev.misses + 1)
        }));
        return;
      }

      // Filter features by viewport and visibility
      const polygon = viewportPolygon();
      const filterFeatures = (fc: FeatureCollection) => {
        if (!fc.features.length) return fc;
        
        let filtered = fc.features;

        // Filter by viewport if we have valid bounds
        if (polygon) {
          filtered = filtered.filter((f: Feature) => booleanIntersects(f, polygon));
        }

        // Filter by layer visibility - empty array means all layers visible
        if (visibleLayers.length > 0) {
          filtered = filtered.filter((f: Feature) => 
            f.properties && 
            typeof f.properties.layer === 'string' && 
            visibleLayers.includes(f.properties.layer)
          );
        }

        return { ...fc, features: filtered };
      };

      const filteredPoints = filterFeatures(collections.points);
      const filteredLines = filterFeatures(collections.lines);
      const filteredPolygons = filterFeatures(collections.polygons);

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
        viewportBounds: bounds2D,
        layers: visibleLayers,
        featureCount: filteredVisibleCount,
        coordinateSystem: COORDINATE_SYSTEMS.WGS84
      };

      cacheManager.cachePreview(cacheKey, {
        viewportBounds,
        visibleLayers
      }, cacheResult);

      setCacheStats(prev => ({
        hits: prev.hits,
        misses: prev.misses + 1,
        hitRate: prev.hits / (prev.hits + prev.misses + 1)
      }));

      // Update bounds on initial load
      if (!initialBoundsSet && collections.bounds) {
        onUpdateBounds(collections.bounds);
      }
    } catch (error) {
      console.error('Failed to update preview collections:', error);
    }
  }, [previewManager, viewportBounds, visibleLayers, initialBoundsSet, viewportPolygon, onUpdateBounds, onPreviewUpdate]);

  // Effect to handle debounced preview updates
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const updatePreviewCollections = async () => {
      // Clear any pending update
      if (timeoutId) clearTimeout(timeoutId);
      
      // Skip debounce for initial load
      if (!initialBoundsSet) {
        updatePreview();
        return;
      }
      
      // Schedule new update with debounce time
      timeoutId = setTimeout(() => {
        updatePreview();
      }, DEBOUNCE_TIME);
    };

    updatePreviewCollections();

    // Cleanup timeout on unmount or deps change
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [updatePreview, initialBoundsSet]);

  return {
    previewState,
    cacheStats
  };
}
