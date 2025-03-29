import { useEffect, useRef } from 'react';
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

interface GeoJSONSourceWithData extends Omit<mapboxgl.GeoJSONSource, '_data'> {
  _data?: string | GeoJSON.FeatureCollection;
}

function coordsToLngLat(coords: Coordinate): mapboxgl.LngLatLike {
  // PostGIS returns coordinates in WGS84 (EPSG:4326) format
  // Mapbox GL expects coordinates in [longitude, latitude] order
  return coords;
}

function isValidBounds(bounds: mapboxgl.LngLatBounds): boolean {
  try {
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    return !!(ne && sw && ne.lng !== sw.lng && ne.lat !== sw.lat);
  } catch {
    return false;
  }
}

function isMapReady(map: mapboxgl.Map | null): boolean {
  if (!map) return false;
  try {
    // Check if the map is fully loaded and interactive
    return map.isStyleLoaded() && !map.isMoving() && !map.isZooming();
  } catch {
    return false;
  }
}

export function useAutoZoom(isMapReady: boolean) {
  const mapboxInstance = useMapInstanceStore(state => state.mapInstances.mapbox.instance);
  const { layers } = useLayers();
  const retryTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const retryCountRef = useRef<number>(0);
  const MAX_RETRIES = 10;
  const RETRY_DELAY = 500;

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const attemptAutoZoom = () => {
      // Check if map is ready and style is loaded
      if (!isMapReady || !mapboxInstance || !mapboxInstance.isStyleLoaded()) {
        logger.debug('Map not ready or style not loaded yet, skipping auto-zoom', {
          hasInstance: !!mapboxInstance,
          isMapReady,
          isStyleLoaded: mapboxInstance?.isStyleLoaded(),
          retryCount: retryCountRef.current
        });

        // Schedule retry if we haven't exceeded max retries
        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current++;
          retryTimeoutRef.current = setTimeout(attemptAutoZoom, RETRY_DELAY);
        } else {
          logger.warn('Max retries exceeded for auto-zoom, giving up', {
            maxRetries: MAX_RETRIES,
            totalDelay: MAX_RETRIES * RETRY_DELAY
          });
        }
        return;
      }

      // At this point we know mapboxInstance is ready
      const map = mapboxInstance;

      // Check if all layers are loaded and have sources
      const allLayersReady = layers.every(l => {
        if (l.setupStatus !== 'complete') return false;
        try {
          return !!map.getSource(l.id);
        } catch {
          return false;
        }
      });

      if (!allLayersReady) {
        logger.debug('Not all layer sources are ready yet', {
          layerCount: layers.length,
          readyLayers: layers.filter(l => l.setupStatus === 'complete').length
        });

        // Schedule retry if we haven't exceeded max retries
        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current++;
          retryTimeoutRef.current = setTimeout(attemptAutoZoom, RETRY_DELAY);
        }
        return;
      }

      // Get visible layers
      const visibleLayers = layers.filter(l => l.visible && l.setupStatus === 'complete');

      if (!visibleLayers.length) {
        logger.debug('No visible layers to zoom to');
        return;
      }

      // Create bounds from all visible layers
      const bounds = new mapboxgl.LngLatBounds();
      let hasValidBounds = false;

      visibleLayers.forEach((layer) => {
        try {
          const source = map.getSource(layer.id);
          if (!source) {
            logger.debug('Source not found for layer', { layerId: layer.id });
            return;
          }

          // Handle vector sources
          if (source.type === 'vector') {
            const vectorSource = source as mapboxgl.VectorTileSource;
            if (vectorSource.bounds) {
              bounds.extend([
                [vectorSource.bounds[0], vectorSource.bounds[1]],
                [vectorSource.bounds[2], vectorSource.bounds[3]]
              ]);
              hasValidBounds = true;
            }
          }

          // Handle GeoJSON sources
          if (source.type === 'geojson') {
            const geoJSONSource = source as GeoJSONSourceWithData;
            const data = typeof geoJSONSource._data === 'string' 
              ? JSON.parse(geoJSONSource._data) 
              : geoJSONSource._data;
            
            const features = data?.features;

            if (!features?.length) {
              logger.debug('No features found in source', { 
                layerId: layer.id,
                featureCount: 0
              });
              return;
            }

            // Create bounds from features
            let coordCount = 0;

            features.forEach((feature: any) => {
              try {
                // Try to get geometry from standard GeoJSON structure first
                let geometry = feature.geometry;
                
                // If not found, try to parse from geojson field
                if (!geometry && feature.geojson) {
                  try {
                    geometry = JSON.parse(feature.geojson);
                  } catch (parseError) {
                    logger.warn('Failed to parse geojson field', {
                      layerId: layer.id,
                      featureId: feature.id,
                      error: parseError
                    });
                    return;
                  }
                }

                if (!geometry) return;

                const addCoordinate = (coord: Coordinate) => {
                  bounds.extend(coord as mapboxgl.LngLatLike);
                  coordCount++;
                };

                if (geometry.type === 'Point') {
                  addCoordinate(geometry.coordinates);
                } else if (geometry.type === 'LineString') {
                  geometry.coordinates.forEach(addCoordinate);
                } else if (geometry.type === 'MultiLineString') {
                  geometry.coordinates.forEach((line: LineCoordinates) => line.forEach(addCoordinate));
                } else if (geometry.type === 'Polygon') {
                  geometry.coordinates.forEach((ring: LineCoordinates) => ring.forEach(addCoordinate));
                } else if (geometry.type === 'MultiPolygon') {
                  geometry.coordinates.forEach((polygon: PolygonCoordinates) => 
                    polygon.forEach((ring: LineCoordinates) => ring.forEach(addCoordinate))
                  );
                }

                if (coordCount > 0) {
                  hasValidBounds = true;
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
        } catch (error) {
          logger.error('Error processing layer for bounds', {
            layerId: layer.id,
            error
          });
        }
      });

      if (hasValidBounds && bounds.getNorthEast() && bounds.getSouthWest()) {
        logger.info('Zooming to combined layer bounds', {
          bounds: {
            ne: bounds.getNorthEast(),
            sw: bounds.getSouthWest()
          }
        });

        map.fitBounds(bounds, {
          padding: 50,
          animate: true,
          duration: 1000,
          maxZoom: 18
        });
      } else {
        logger.warn('No valid bounds found for visible layers');
      }
    };

    // Only attempt auto-zoom when map becomes ready
    if (isMapReady) {
      attemptAutoZoom();
    }
  }, [isMapReady, mapboxInstance, layers]);
} 