import { useEffect, useCallback, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import type { GeoJSON } from 'geojson';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useLayers } from '@/store/layers/hooks';
import { useLogger } from '@/core/logging/LoggerContext';
import type { Layer } from '@/store/layers/types';

const SOURCE = 'useAutoZoom';

type Coordinate = [number, number];
type LineCoordinates = Coordinate[];
type PolygonCoordinates = LineCoordinates[];

const MAX_AUTOZOOM_RETRIES = 10;
const AUTOZOOM_RETRY_DELAY = 500; // Increased delay for more patience

function isGeoJSONSource(source: mapboxgl.AnySourceImpl | undefined): source is mapboxgl.GeoJSONSource {
  return !!source && 'setData' in source && typeof (source as any).setData === 'function';
}

export function useAutoZoom(isMapReady: boolean) {
  const mapboxInstance = useMapInstanceStore(state => state.mapInstances.mapbox.instance);
  const { layers } = useLayers();
  const logger = useLogger();
  const processedLayersRef = useRef<string>('');
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const addedSourcesRef = useRef<Set<string>>(new Set());

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Effect to listen for custom source added events
  useEffect(() => {
    if (!mapboxInstance) return;

    const handleSourceAdded = (e: any) => {
      if (e && e.sourceId && typeof e.sourceId === 'string') {
        logger.debug(SOURCE, 'Detected custom source added event', { sourceId: e.sourceId });
        if (!addedSourcesRef.current.has(e.sourceId)) {
          addedSourcesRef.current.add(e.sourceId);
        }
      } else {
        logger.warn(SOURCE, 'Received invalid sourceaddedcustom event', { eventData: e });
      }
    };

    logger.debug(SOURCE, 'Adding sourceaddedcustom listener');
    mapboxInstance.on('sourceaddedcustom', handleSourceAdded);

    return () => {
      if (mapboxInstance && mapboxInstance.getCanvas() && !mapboxInstance._removed) {
        logger.debug(SOURCE, 'Removing sourceaddedcustom listener');
        try {
          mapboxInstance.off('sourceaddedcustom', handleSourceAdded);
        } catch (offError) {
          logger.warn(SOURCE, 'Error removing sourceaddedcustom listener', { error: offError });
        }
      }
    };
  }, [mapboxInstance, logger]);

  const attemptAutoZoom = useCallback((retryCount = 0) => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    if (!isMapReady || !mapboxInstance) {
      logger.debug(SOURCE, 'AutoZoom: Map instance not ready', { isMapReady, hasMap: !!mapboxInstance, retryCount });
      return;
    }

    const visibleLayers = layers.filter(l => l.visible && l.setupStatus === 'complete');
    if (!visibleLayers.length) {
      logger.debug(SOURCE, 'AutoZoom: No visible layers ready for zooming');
      return;
    }

    const map = mapboxInstance;

    // Check if sources have been added (event received) AND are loaded
    const sourceStates = visibleLayers.map(layer => {
      const sourceId = `${layer.id}-source`;
      const hasBeenAdded = addedSourcesRef.current.has(sourceId);
      let isLoaded = false; // Assume not loaded initially
      let reason = 'pending_add_event';
      let sourceExists = map.getSource(sourceId); // Check if source object exists

      if (hasBeenAdded) {
        if (sourceExists) {
          isLoaded = map.isSourceLoaded(sourceId);
          reason = isLoaded ? 'loaded' : 'loading_after_add';
        } else {
          // This is weird: event fired but getSource is null?
          reason = 'event_fired_source_gone';
          logger.warn(SOURCE, `Source ${sourceId} missing after 'sourceaddedcustom' event.`);
        }
      } else if (sourceExists) {
        reason = 'pending_add_event_source_exists';
      } else {
        reason = 'not_found';
      }

      // Add specific log if waiting for load
      if (reason === 'loading_after_add') {
        logger.debug(SOURCE, `Waiting for map.isSourceLoaded('${sourceId}')`);
      }

      return {
        sourceId,
        ready: isLoaded, // Final readiness depends only on isLoaded
        reason,
        hasBeenAdded,
        sourceExists // Log if the source object itself exists
      };
    });

    const allSourcesReady = sourceStates.every(state => state.ready);

    if (!allSourcesReady) {
      logger.warn(SOURCE, 'AutoZoom: Not all sources ready yet', {
        attempt: retryCount + 1,
        maxRetries: MAX_AUTOZOOM_RETRIES,
        sourceStates,
        totalWaitTime: (retryCount + 1) * AUTOZOOM_RETRY_DELAY
      });

      if (retryCount < MAX_AUTOZOOM_RETRIES - 1) {
        retryTimeoutRef.current = setTimeout(() => attemptAutoZoom(retryCount + 1), AUTOZOOM_RETRY_DELAY);
      } else {
        logger.error(SOURCE, 'AutoZoom failed: Max retries exceeded waiting for sources', {
          sourceStates,
          totalWaitTime: MAX_AUTOZOOM_RETRIES * AUTOZOOM_RETRY_DELAY
        });
      }
      return;
    }

    // All sources are ready, proceed with bounds calculation
    logger.debug(SOURCE, 'AutoZoom: All required sources are added and loaded, calculating bounds', {
      visibleLayerCount: visibleLayers.length,
      visibleLayerIds: visibleLayers.map(l => l.id),
      addedSources: Array.from(addedSourcesRef.current)
    });

    const bounds = new mapboxgl.LngLatBounds();
    let hasValidBounds = false;
    let totalCoordCount = 0;

    visibleLayers.forEach(layer => {
      const sourceId = `${layer.id}-source`;
      const source = map.getSource(sourceId);

      if (isGeoJSONSource(source)) {
        const data = source._data;
        if (typeof data === 'object' && 
            data !== null && 
            'features' in data && 
            Array.isArray((data as any).features)) {
          (data as any).features.forEach((feature: any) => {
            try {
              let geometry = feature.geometry;
              
              if (!geometry && feature.geojson) {
                try {
                  geometry = typeof feature.geojson === 'string' 
                    ? JSON.parse(feature.geojson)
                    : feature.geojson;
                } catch (parseError) {
                  logger.warn(SOURCE, 'Failed to parse geojson field', {
                    layerId: layer.id,
                    featureId: feature.id,
                    error: parseError
                  });
                  return;
                }
              }

              if (!geometry?.type || !geometry?.coordinates) {
                logger.warn(SOURCE, 'Invalid geometry', {
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
                  logger.warn(SOURCE, 'Unsupported geometry type', {
                    layerId: layer.id,
                    featureId: feature.id,
                    geometryType: geometry.type
                  });
              }
            } catch (featureError) {
              logger.warn(SOURCE, 'Error processing feature geometry', {
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
      logger.info(SOURCE, 'AutoZoom: Zooming to bounds', { 
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
      logger.warn(SOURCE, 'AutoZoom: No valid bounds found', { totalCoordCount });
    }
  }, [isMapReady, mapboxInstance, layers, logger]);

  // Main effect to trigger autozoom check
  useEffect(() => {
    if (isMapReady && mapboxInstance) {
      const currentVisibleLayers = layers
        .filter(l => l.visible && l.setupStatus === 'complete')
        .map(l => l.id)
        .sort()
        .join(',');

      if (currentVisibleLayers !== processedLayersRef.current) {
        logger.debug(SOURCE, 'AutoZoom: Triggering check due to map readiness or layer change', {
          previousLayers: processedLayersRef.current,
          currentLayers: currentVisibleLayers,
          mapReady: isMapReady
        });
        processedLayersRef.current = currentVisibleLayers;
        addedSourcesRef.current = new Set();
        logger.debug(SOURCE, 'Resetting addedSources ref due to layer change');
        attemptAutoZoom(); // Start the check
      } else {
        logger.debug(SOURCE, 'AutoZoom: No relevant layer changes detected', { currentLayers: currentVisibleLayers });
      }
    } else {
      // Reset state when map is not ready
      if (processedLayersRef.current !== '') {
        logger.debug(SOURCE, 'AutoZoom: Map not ready, resetting state');
        processedLayersRef.current = '';
        addedSourcesRef.current = new Set();
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = null;
        }
      }
    }
  }, [isMapReady, mapboxInstance, layers, attemptAutoZoom, logger]);
} 