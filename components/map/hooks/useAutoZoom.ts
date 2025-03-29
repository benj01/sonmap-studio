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

const MAX_RETRIES = 10;
const RETRY_DELAY = 500;

function isMapReadyForZoom(map: mapboxgl.Map | null): map is mapboxgl.Map {
  if (!map) return false;
  try {
    return map.isStyleLoaded() && 
           typeof map.getSource === 'function' &&
           typeof map.getLayer === 'function';
  } catch {
    return false;
  }
}

export function useAutoZoom(isMapReady: boolean) {
  const mapboxInstance = useMapInstanceStore(state => state.mapInstances.mapbox.instance);
  const { layers } = useLayers();
  const processedLayersRef = useRef<string>('');
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout>();

  const attemptAutoZoom = useCallback(() => {
    if (!isMapReady || !isMapReadyForZoom(mapboxInstance)) {
      logger.debug('Map not ready for auto-zoom', {
        isMapReady,
        hasMap: !!mapboxInstance,
        isStyleLoaded: mapboxInstance ? mapboxInstance.isStyleLoaded() : false,
        retryCount: retryCountRef.current
      });

      // Retry if we haven't exceeded max retries
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        retryTimeoutRef.current = setTimeout(attemptAutoZoom, RETRY_DELAY);
        return;
      }

      logger.warn('Max retries reached for auto-zoom', {
        retryCount: retryCountRef.current
      });
      return;
    }

    // Reset retry count on successful attempt
    retryCountRef.current = 0;
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    const visibleLayers = layers.filter(l => l.visible && l.setupStatus === 'complete');
    
    if (!visibleLayers.length) {
      logger.debug('No visible and complete layers for auto-zoom');
      return;
    }

    // Check if all sources are ready
    const allSourcesReady = visibleLayers.every(layer => {
      const sourceId = `${layer.id}-source`;
      try {
        const source = mapboxInstance.getSource(sourceId);
        if (!source) return false;
        
        // For GeoJSON sources, check if data is loaded
        if ('_data' in source) {
          const geoJSONSource = source as any;
          return !!geoJSONSource._data?.features?.length;
        }
        
        return true;
      } catch {
        return false;
      }
    });

    if (!allSourcesReady) {
      logger.debug('Not all sources ready for auto-zoom', {
        visibleLayerIds: visibleLayers.map(l => l.id),
        retryCount: retryCountRef.current
      });

      // Retry if we haven't exceeded max retries
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        retryTimeoutRef.current = setTimeout(attemptAutoZoom, RETRY_DELAY);
        return;
      }

      logger.warn('Max retries reached waiting for sources', {
        retryCount: retryCountRef.current
      });
      return;
    }

    logger.debug('Calculating bounds for auto-zoom', {
      visibleLayerCount: visibleLayers.length
    });

    const bounds = new mapboxgl.LngLatBounds();
    let hasValidBounds = false;
    let coordCount = 0;

    visibleLayers.forEach(layer => {
      try {
        const sourceId = `${layer.id}-source`;
        const source = mapboxInstance.getSource(sourceId);
        
        if (!source) {
          logger.warn('Source not found for layer', { layerId: layer.id, sourceId });
          return;
        }

        if ('_data' in source) {
          const geoJSONSource = source as any;
          const features = geoJSONSource._data?.features;

          if (!features?.length) {
            logger.debug('No features in source', { layerId: layer.id });
            return;
          }

          features.forEach((feature: any) => {
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
                coordCount++;
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
      } catch (layerError) {
        logger.warn('Error processing layer for bounds', {
          layerId: layer.id,
          error: layerError
        });
      }
    });

    if (coordCount > 0) {
      hasValidBounds = true;
    }

    if (hasValidBounds && bounds.getNorthEast() && bounds.getSouthWest()) {
      logger.info('Zooming to bounds', {
        coordCount,
        bounds: {
          ne: bounds.getNorthEast().toArray(),
          sw: bounds.getSouthWest().toArray()
        }
      });
      
      mapboxInstance.fitBounds(bounds, {
        padding: 50,
        animate: true,
        duration: 1000,
        maxZoom: 18
      });
    } else {
      logger.warn('No valid bounds calculated', { coordCount });
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
        processedLayersRef.current = currentProcessedLayers;
        attemptAutoZoom();
      }
    }

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [isMapReady, layers, attemptAutoZoom]);
} 