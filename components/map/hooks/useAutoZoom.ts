import { useEffect, useCallback, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import type { GeoJSON } from 'geojson';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useLayers } from '@/store/layers/hooks';
import { LogManager } from '@/core/logging/log-manager';
import type { Layer } from '@/store/layers/types';

const SOURCE = 'useAutoZoom';
const logManager = LogManager.getInstance();

const logger = {
  info: (message: string, data?: any) => {
    logManager.info(SOURCE, message, data);
  },
  warn: (message: string, error?: any) => {
    logManager.warn(SOURCE, message, error);
  },
  error: (message: string, error?: any) => {
    logManager.error(SOURCE, message, error);
  },
  debug: (message: string, data?: any) => {
    logManager.debug(SOURCE, message, data);
  }
};

type Coordinate = [number, number];
type LineCoordinates = Coordinate[];
type PolygonCoordinates = LineCoordinates[];

const MAX_AUTOZOOM_RETRIES = 5;
const AUTOZOOM_RETRY_DELAY = 200;

function isStyleLoaded(map: mapboxgl.Map): boolean {
  try {
    return typeof map.isStyleLoaded === 'function' && map.isStyleLoaded();
  } catch {
    return false;
  }
}

function isGeoJSONSource(source: mapboxgl.AnySourceImpl | undefined): source is mapboxgl.GeoJSONSource {
  return !!source && 'setData' in source && typeof (source as any).setData === 'function';
}

export function useAutoZoom(isMapReady: boolean) {
  const mapboxInstance = useMapInstanceStore(state => state.mapInstances.mapbox.instance);
  const { layers } = useLayers();
  const processedLayersRef = useRef<string>('');
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  const attemptAutoZoom = useCallback((retryCount = 0) => {
    // Clear any pending retry from previous calls within this effect run
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    if (!isMapReady || !mapboxInstance) {
      logger.debug('AutoZoom: Map instance not ready', { 
        isMapReady,
        hasMap: !!mapboxInstance,
        retryCount
      });
      return;
    }

    // Check Style Loaded
    if (!isStyleLoaded(mapboxInstance)) {
      logger.warn(`AutoZoom: Style not loaded (attempt ${retryCount + 1})`, {
        retryCount,
        maxRetries: MAX_AUTOZOOM_RETRIES
      });
      if (retryCount < MAX_AUTOZOOM_RETRIES - 1) {
        retryTimeoutRef.current = setTimeout(() => attemptAutoZoom(retryCount + 1), AUTOZOOM_RETRY_DELAY);
      } else {
        logger.error(`AutoZoom failed: Max retries exceeded waiting for style`);
      }
      return;
    }

    // Style is loaded, proceed
    const map = mapboxInstance;
    const visibleLayers = layers.filter(l => l.visible && l.setupStatus === 'complete');

    if (!visibleLayers.length) {
      logger.debug('AutoZoom: No visible layers');
      return;
    }

    const allSourcesReady = visibleLayers.every(layer => {
      const sourceId = `${layer.id}-source`;
      try {
        const source = map.getSource(sourceId);
        if (!source) return false;
        
        // For GeoJSON sources, check if data is loaded
        if (isGeoJSONSource(source)) {
          return !!source._data?.features?.length;
        }
        
        return true;
      } catch {
        return false;
      }
    });

    if (!allSourcesReady) {
      logger.warn(`AutoZoom: Not all sources ready yet (attempt ${retryCount + 1})`, {
        visibleLayerIds: visibleLayers.map(l => l.id),
        retryCount,
        maxRetries: MAX_AUTOZOOM_RETRIES
      });
      if (retryCount < MAX_AUTOZOOM_RETRIES - 1) {
        retryTimeoutRef.current = setTimeout(() => attemptAutoZoom(retryCount + 1), AUTOZOOM_RETRY_DELAY);
      } else {
        logger.error(`AutoZoom failed: Max retries exceeded waiting for sources`);
      }
      return;
    }

    // Sources are ready
    logger.debug('AutoZoom: Calculating bounds', { 
      visibleLayerCount: visibleLayers.length,
      visibleLayerIds: visibleLayers.map(l => l.id)
    });

    const bounds = new mapboxgl.LngLatBounds();
    let hasValidBounds = false;
    let totalCoordCount = 0;

    visibleLayers.forEach(layer => {
      const sourceId = `${layer.id}-source`;
      const source = map.getSource(sourceId);
      
      if (isGeoJSONSource(source)) {
        const data = source._data;
        if (typeof data === 'object' && data?.features) {
          data.features.forEach((feature: any) => {
            try {
              let geometry = feature.geometry;
              
              if (!geometry && feature.geojson) {
                try {
                  geometry = typeof feature.geojson === 'string' 
                    ? JSON.parse(feature.geojson)
                    : feature.geojson;
                } catch (parseError) {
                  logger.warn('Failed to parse geojson field', {
                    layerId: layer.id,
                    featureId: feature.id,
                    error: parseError
                  });
                  return;
                }
              }

              if (!geometry?.type || !geometry?.coordinates) {
                logger.warn('Invalid geometry', {
                  layerId: layer.id,
                  featureId: feature.id,
                  geometryType: geometry?.type
                });
                return;
              }

              const addCoordinate = (coord: Coordinate) => {
                bounds.extend(coord as mapboxgl.LngLatLike);
                totalCoordCount++;
              };

              switch (geometry.type) {
                case 'Point':
                  addCoordinate(geometry.coordinates);
                  break;
                case 'LineString':
                  geometry.coordinates.forEach(addCoordinate);
                  break;
                case 'MultiLineString':
                  geometry.coordinates.forEach((line: LineCoordinates) => 
                    line.forEach(addCoordinate));
                  break;
                case 'Polygon':
                  geometry.coordinates.forEach((ring: LineCoordinates) => 
                    ring.forEach(addCoordinate));
                  break;
                case 'MultiPolygon':
                  geometry.coordinates.forEach((polygon: PolygonCoordinates) => 
                    polygon.forEach(ring => ring.forEach(addCoordinate)));
                  break;
                default:
                  logger.warn('Unsupported geometry type', {
                    layerId: layer.id,
                    featureId: feature.id,
                    geometryType: geometry.type
                  });
              }
            } catch (featureError) {
              logger.warn('Error processing feature geometry', {
                layerId: layer.id,
                featureId: feature.id,
                error: featureError
              });
            }
          });
        }
      }
    });

    if (totalCoordCount > 0) {
      hasValidBounds = true;
    }

    if (hasValidBounds && bounds.getNorthEast() && bounds.getSouthWest()) {
      logger.info('AutoZoom: Zooming to bounds', { 
        coordCount: totalCoordCount,
        bounds: {
          ne: bounds.getNorthEast().toArray(),
          sw: bounds.getSouthWest().toArray()
        }
      });
      
      map.fitBounds(bounds, {
        padding: 50,
        animate: true,
        duration: 1000,
        maxZoom: 18
      });
    } else {
      logger.warn('AutoZoom: No valid bounds found', { totalCoordCount });
    }
  }, [isMapReady, mapboxInstance, layers]);

  useEffect(() => {
    if (isMapReady) {
      const currentProcessedLayers = layers
        .filter(l => l.visible && l.setupStatus === 'complete')
        .map(l => l.id)
        .sort()
        .join(',');

      if (currentProcessedLayers !== processedLayersRef.current) {
        logger.debug('AutoZoom: Triggering check due to map readiness or layer change', {
          previousLayers: processedLayersRef.current,
          currentLayers: currentProcessedLayers
        });
        processedLayersRef.current = currentProcessedLayers;
        attemptAutoZoom();
      }
    } else {
      processedLayersRef.current = '';
      // Clear any pending retry if map becomes not ready
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    }
  }, [isMapReady, layers, attemptAutoZoom]);
} 