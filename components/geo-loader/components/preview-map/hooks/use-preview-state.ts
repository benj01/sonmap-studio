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
    const prevBoundsRef = useRef(boundsKey);
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
        previewManager.setOptions({
          viewportBounds,
          visibleLayers,
          enableCaching: true,
          skipTransform: true // Skip coordinate transformation if already transformed
        });

        // Get preview collections
        const collections = await previewManager.getPreviewCollections();
        
        if (!mountedRef.current) return;

        if (!collections || !collections.points || !collections.lines || !collections.polygons) {
          console.debug('[usePreviewState] Invalid collections returned:', collections);
          setState(prev => ({
            ...initialState,
            loading: false
          }));
          return;
        }

        // Validate coordinates in collections
        const validateFeatures = (features: Feature[]): Feature[] => {
          return features.map(feature => {
            // Skip validation if coordinates are already transformed
            if (feature.properties?._transformedCoordinates) {
              return feature;
            }

            // Validate coordinates
            if (feature.geometry && 'coordinates' in feature.geometry) {
              const validateCoord = (coord: number): number => {
                return isFinite(coord) ? coord : 0;
              };

              const processCoordinates = (coords: any[]): any[] => {
                if (typeof coords[0] === 'number') {
                  return coords.map(validateCoord);
                }
                return coords.map(c => processCoordinates(c));
              };

              return {
                ...feature,
                geometry: {
                  ...feature.geometry,
                  coordinates: processCoordinates(feature.geometry.coordinates)
                }
              };
            }
            return feature;
          });
        };

        // Validate and update collections
        const validatedCollections = {
          points: {
            ...collections.points,
            features: validateFeatures(collections.points.features)
          },
          lines: {
            ...collections.lines,
            features: validateFeatures(collections.lines.features)
          },
          polygons: {
            ...collections.polygons,
            features: validateFeatures(collections.polygons.features)
          }
        };

        console.debug('[usePreviewState] Setting preview state:', {
          points: validatedCollections.points.features?.length || 0,
          lines: validatedCollections.lines.features?.length || 0,
          polygons: validatedCollections.polygons.features?.length || 0,
          bounds: collections.bounds,
          hasTransformedFeatures: validatedCollections.points.features.some(f => f.properties?._transformedCoordinates) ||
                                validatedCollections.lines.features.some(f => f.properties?._transformedCoordinates) ||
                                validatedCollections.polygons.features.some(f => f.properties?._transformedCoordinates)
        });

        setState({
          points: validatedCollections.points || emptyCollection,
          lines: validatedCollections.lines || emptyCollection,
          polygons: validatedCollections.polygons || emptyCollection,
          totalCount: collections.totalCount || 0,
          loading: false,
          progress: 1
        });
        
        // Update bounds if needed
        if (!initialBoundsSet && collections.bounds) {
          console.debug('[usePreviewState] Setting initial bounds:', collections.bounds);
          onUpdateBounds?.(collections.bounds);
        }

        // Notify of preview update
        onPreviewUpdate?.();

      } catch (error) {
        if (!mountedRef.current) return;

        console.error('[usePreviewState] Error updating preview:', error);
        setState(prev => ({
          ...initialState,
          loading: false
        }));
      }
    };

    updatePreview();
  }, [previewManager, viewportBounds, visibleLayers, initialBoundsSet]);

  return state;
}
