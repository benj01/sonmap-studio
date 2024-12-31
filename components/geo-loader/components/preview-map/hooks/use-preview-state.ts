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

      // Update bounds in preview manager
      if (viewportBounds) {
        previewManager.setOptions({
          viewportBounds,
          // Only set as initial bounds if not already set
          ...((!initialBoundsSet && {
            initialBounds: {
              minX: viewportBounds[0],
              minY: viewportBounds[1],
              maxX: viewportBounds[2],
              maxY: viewportBounds[3]
            }
          }))
        });
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
        const visibleFeatures = cachedFeatures.filter((f: Feature) => {
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

        console.debug('[DEBUG] Feature counts after filtering:', {
          total: visibleFeatures.length,
          points: pointFeatures.length,
          lines: lineFeatures.length,
          polygons: polygonFeatures.length
        });

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

      // Skip viewport filtering on initial load to ensure features are visible
      const shouldFilterByViewport = initialBoundsSet;
      const polygon = shouldFilterByViewport ? viewportPolygon() : null;

      console.debug('[DEBUG] Preview filtering state:', {
        initialBoundsSet,
        shouldFilterByViewport,
        viewportBounds,
        polygon: polygon ? {
          type: polygon.geometry.type,
          coordinates: polygon.geometry.coordinates
        } : null,
        visibleLayers,
        allLayersVisible: visibleLayers.length === 0,
        totalFeatures: collections.totalCount
      });

      const filterFeatures = (fc: FeatureCollection) => {
        if (!fc.features.length) return fc;
        
        let filtered = fc.features;

        // Only filter by viewport if we're past initial load
        if (shouldFilterByViewport && polygon) {
          filtered = filtered.filter((f: Feature) => {
            const intersects = booleanIntersects(f, polygon);
            console.debug('[DEBUG] Feature intersection test:', {
              featureType: f.geometry.type,
              coordinates: 'coordinates' in f.geometry ? f.geometry.coordinates : undefined,
              layer: f.properties?.layer,
              intersects,
              viewportBounds
            });
            return intersects;
          });
        }

        // Filter by layer visibility - empty array means all layers visible
        filtered = filtered.filter((f: Feature) => {
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
        viewportBounds: bounds2D,
        layers: visibleLayers,
        featureCount: filteredVisibleCount,
        coordinateSystem: previewManager.getOptions().coordinateSystem || COORDINATE_SYSTEMS.WGS84
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
      console.error('[DEBUG] Error updating preview:', error);
    }
  }, [previewManager, viewportBounds, visibleLayers, initialBoundsSet, viewportPolygon]);

  // Debounced update effect
  useEffect(() => {
    if (!previewManager || !viewportBounds) {
      console.debug('[DEBUG] Skipping preview update - missing manager or bounds');
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
