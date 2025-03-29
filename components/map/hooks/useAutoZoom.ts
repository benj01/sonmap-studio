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
type MultiPolygonCoordinates = PolygonCoordinates[];

interface GeoJSONSourceWithData extends Omit<mapboxgl.GeoJSONSource, '_data'> {
  _data?: GeoJSON.FeatureCollection;
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

export function useAutoZoom() {
  const mapboxInstance = useMapInstanceStore(state => state.mapInstances.mapbox.instance);
  const { layers } = useLayers();
  const retryTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const retryCountRef = useRef<number>(0);
  const MAX_RETRIES = 10; // Increased from 5 to 10 to allow more time for layers to load
  const RETRY_DELAY = 500; // 500ms between retries

  useEffect(() => {
    // Cleanup function to clear any pending timeouts
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const attemptAutoZoom = () => {
      // Check if map is available and loaded
      if (!mapboxInstance || !mapboxInstance.isStyleLoaded()) {
        logger.debug('Map style not loaded yet, skipping auto-zoom', {
          hasInstance: !!mapboxInstance,
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
        logger.debug('Not all layer sources are ready, retrying auto-zoom', {
          layerCount: layers.length,
          readyLayers: layers.filter(l => {
            try {
              return l.setupStatus === 'complete' && !!map.getSource(l.id);
            } catch {
              return false;
            }
          }).length
        });

        // Schedule retry if we haven't exceeded max retries
        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current++;
          retryTimeoutRef.current = setTimeout(attemptAutoZoom, RETRY_DELAY);
        }
        return;
      }

      // Get all visible layers
      const visibleLayers = layers.filter(l => l.visible && l.setupStatus === 'complete');
      
      if (visibleLayers.length === 0) {
        logger.debug('No visible layers, skipping auto-zoom');
        return;
      }

      try {
        // Calculate bounds from all visible layers
        let bounds: mapboxgl.LngLatBounds | undefined = undefined;
        let hasValidBoundsForAnyLayer = false;

        visibleLayers.forEach((layer) => {
          try {
            // Try to get the source
            const source = map.getSource(layer.id);
            if (!source) {
              logger.debug('Source not found for layer', { 
                layerId: layer.id,
                retryCount: retryCountRef.current
              });
              return;
            }

            // Handle different source types
            if (source.type === 'vector') {
              // For vector sources, we need to get the tile coverage
              const vectorSource = source as mapboxgl.VectorTileSource;
              
              // Try to get bounds from vector source
              if (vectorSource.bounds) {
                const layerBounds = new mapboxgl.LngLatBounds(
                  [vectorSource.bounds[0], vectorSource.bounds[1]],
                  [vectorSource.bounds[2], vectorSource.bounds[3]]
                );

                if (isValidBounds(layerBounds)) {
                  hasValidBoundsForAnyLayer = true;
                  if (!bounds) {
                    bounds = layerBounds;
                  } else {
                    bounds.extend(layerBounds);
                  }
                }
                return;
              }
            }

            // Handle GeoJSON sources
            if (source.type === 'geojson') {
              const geoJSONSource = source as GeoJSONSourceWithData;
              const features = geoJSONSource._data?.features;

              if (!features?.length) {
                logger.debug('No features found in source', { 
                  layerId: layer.id,
                  featureCount: 0
                });
                return;
              }

              // Create bounds from features
              const layerBounds = new mapboxgl.LngLatBounds();
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

                  if (!geometry) {
                    return;
                  }

                  if (geometry.type === 'Point') {
                    const coordinates = geometry.coordinates as Coordinate;
                    layerBounds.extend(coordsToLngLat(coordinates));
                    coordCount++;
                  } else if (geometry.type === 'LineString') {
                    const coordinates = geometry.coordinates as LineCoordinates;
                    coordinates.forEach(coord => {
                      layerBounds.extend(coordsToLngLat(coord));
                      coordCount++;
                    });
                  } else if (geometry.type === 'MultiLineString') {
                    const coordinates = geometry.coordinates as LineCoordinates[];
                    coordinates.forEach(line => 
                      line.forEach(coord => {
                        layerBounds.extend(coordsToLngLat(coord));
                        coordCount++;
                      })
                    );
                  } else if (geometry.type === 'Polygon') {
                    const coordinates = geometry.coordinates as PolygonCoordinates;
                    coordinates.forEach(ring => 
                      ring.forEach(coord => {
                        layerBounds.extend(coordsToLngLat(coord));
                        coordCount++;
                      })
                    );
                  } else if (geometry.type === 'MultiPolygon') {
                    const coordinates = geometry.coordinates as MultiPolygonCoordinates;
                    coordinates.forEach(polygon => 
                      polygon.forEach(ring => 
                        ring.forEach(coord => {
                          layerBounds.extend(coordsToLngLat(coord));
                          coordCount++;
                        })
                      )
                    );
                  }
                } catch (featureError) {
                  logger.warn('Error processing feature geometry', { 
                    layerId: layer.id, 
                    featureId: feature.id,
                    error: featureError 
                  });
                }
              });

              if (isValidBounds(layerBounds) && coordCount > 0) {
                hasValidBoundsForAnyLayer = true;
                logger.debug('Layer bounds calculated', {
                  layerId: layer.id,
                  coordCount,
                  bounds: {
                    ne: layerBounds.getNorthEast(),
                    sw: layerBounds.getSouthWest()
                  }
                });

                if (!bounds) {
                  bounds = layerBounds;
                } else {
                  bounds.extend(layerBounds);
                }
              }
            }
          } catch (layerError) {
            logger.warn('Error processing layer', { layerId: layer.id, error: layerError });
          }
        });

        if (bounds && isValidBounds(bounds) && hasValidBoundsForAnyLayer) {
          // Explicitly assert the bounds type since we've validated it
          const validBounds = bounds as mapboxgl.LngLatBounds;
          const ne = validBounds.getNorthEast();
          const sw = validBounds.getSouthWest();
          logger.info('Auto-zooming to layer bounds', {
            layerCount: visibleLayers.length,
            bounds: {
              ne: [ne.lng, ne.lat],
              sw: [sw.lng, sw.lat]
            }
          });

          // Fit bounds with padding
          map.fitBounds(validBounds, {
            padding: 50,
            animate: true,
            duration: 1000,
            maxZoom: 18 // Prevent zooming in too far
          });

          // Clear retry count on success
          retryCountRef.current = 0;
        } else {
          logger.warn('No valid bounds found for auto-zoom');

          // Schedule retry if we haven't exceeded max retries
          if (retryCountRef.current < MAX_RETRIES) {
            retryCountRef.current++;
            retryTimeoutRef.current = setTimeout(attemptAutoZoom, RETRY_DELAY);
          }
        }
      } catch (error) {
        logger.error('Error during auto-zoom', error instanceof Error ? { 
          message: error.message,
          stack: error.stack 
        } : { error });
      }
    };

    // Reset retry count when dependencies change
    retryCountRef.current = 0;
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    // Start the auto-zoom attempt
    attemptAutoZoom();
  }, [mapboxInstance, layers]);
} 