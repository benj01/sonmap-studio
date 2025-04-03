import { useEffect, useCallback, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import type { GeoJSON } from 'geojson';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useLayers } from '@/store/layers/hooks';
import { useLogger } from '@/core/logging/LoggerContext';
import type { Layer } from '@/store/layers/types';
import { useAreInitialLayersReady } from '@/store/layers/hooks';

const SOURCE = 'useAutoZoom';

type Coordinate = [number, number];
type LineCoordinates = Coordinate[];
type PolygonCoordinates = LineCoordinates[];

const MAX_AUTOZOOM_RETRIES = 10;
const AUTOZOOM_RETRY_DELAY = 500;

function isGeoJSONSource(source: mapboxgl.AnySourceImpl | undefined): source is mapboxgl.GeoJSONSource {
  return !!source && 'setData' in source && typeof (source as any).setData === 'function';
}

export function useAutoZoom() {
  const mapboxInstance = useMapInstanceStore(state => state.mapInstances.mapbox.instance);
  const mapStatus = useMapInstanceStore(state => state.mapInstances.mapbox.status);
  const { layers } = useLayers();
  const logger = useLogger();
  const processedLayersRef = useRef<string>('');
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadedSourcesRef = useRef<Set<string>>(new Set());
  const areLayersReady = useAreInitialLayersReady();

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Effect to listen for source data events
  useEffect(() => {
    if (!mapboxInstance) return;

    const handleSourceData = (e: mapboxgl.MapSourceDataEvent) => {
      if (e.isSourceLoaded && e.sourceId) {
        logger.debug(SOURCE, 'Source data loaded', { sourceId: e.sourceId });
        loadedSourcesRef.current.add(e.sourceId);
      }
    };

    logger.debug(SOURCE, 'Adding sourcedata listener');
    mapboxInstance.on('sourcedata', handleSourceData);

    return () => {
      if (mapboxInstance && mapboxInstance.getCanvas() && !mapboxInstance._removed) {
        logger.debug(SOURCE, 'Removing sourcedata listener');
        try {
          mapboxInstance.off('sourcedata', handleSourceData);
        } catch (offError) {
          logger.warn(SOURCE, 'Error removing sourcedata listener', { error: offError });
        }
      }
    };
  }, [mapboxInstance, logger]);

  const attemptAutoZoom = useCallback((retryCount = 0) => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    if (!mapboxInstance || mapStatus !== 'ready' || !areLayersReady) {
      logger.debug(SOURCE, 'AutoZoom: Map or layers not ready', { 
        hasMap: !!mapboxInstance,
        mapStatus,
        areLayersReady,
        retryCount 
      });
      return;
    }

    // Check if the map is currently moving/zooming
    if (mapboxInstance.isMoving() || mapboxInstance.isZooming()) {
      logger.debug(SOURCE, 'AutoZoom: Map is moving/zooming, waiting...');
      mapboxInstance.once('moveend', () => {
        if (retryCount < MAX_AUTOZOOM_RETRIES - 1) {
          retryTimeoutRef.current = setTimeout(() => attemptAutoZoom(retryCount + 1), AUTOZOOM_RETRY_DELAY);
        }
      });
      return;
    }

    // Filter layers based on the status set by MapLayer
    const visibleLayers = layers.filter(l => l.visible && l.setupStatus === 'complete');

    if (!visibleLayers.length) {
      logger.debug(SOURCE, 'AutoZoom: No visible layers have setupStatus === "complete" yet.');
      return;
    }

    // Proceed directly to bounds calculation
    logger.debug(SOURCE, 'AutoZoom: Found layers with setupStatus complete. Calculating bounds.', {
      visibleLayerCount: visibleLayers.length,
      visibleLayerIds: visibleLayers.map(l => l.id),
    });

    const map = mapboxInstance;
    const bounds = new mapboxgl.LngLatBounds();
    let hasValidBounds = false;
    let totalCoordCount = 0;

    visibleLayers.forEach(layer => {
      // Derive source ID based on convention
      const sourceId = `${layer.id}-source`;
      const source = map.getSource(sourceId);

      // Add a check here to ensure the source *actually* exists now
      if (!source) {
        logger.warn(SOURCE, `AutoZoom: Source ${sourceId} not found for completed layer ${layer.id}. Skipping bounds calculation for this layer.`);
        return; // Skip this layer if source is missing unexpectedly
      }

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
  }, [mapboxInstance, mapStatus, layers, areLayersReady, logger]);

  // Main effect to trigger autozoom check
  useEffect(() => {
    // Log the state values *every time* the effect runs
    logger.debug(SOURCE, 'Main effect triggered', {
      hasMap: !!mapboxInstance,
      mapStatus,
      areLayersReady,
      layerCount: layers.length,
      completeLayerIds: layers.filter(l => l.setupStatus === 'complete').map(l => l.id),
      processedLayers: processedLayersRef.current
    });

    if (mapboxInstance && mapStatus === 'ready' && areLayersReady) {
      const currentVisibleLayers = layers
        .filter(l => l.visible && l.setupStatus === 'complete')
        .map(l => l.id)
        .sort()
        .join(',');

      logger.debug(SOURCE, 'Checking conditions to trigger autoZoom', {
        conditionsMet: true,
        currentVisibleLayers,
        processedLayers: processedLayersRef.current,
        isDifferent: currentVisibleLayers !== processedLayersRef.current
      });

      if (currentVisibleLayers !== processedLayersRef.current) {
        logger.info(SOURCE, 'Conditions met and layers changed! Triggering attemptAutoZoom.');
        processedLayersRef.current = currentVisibleLayers;
        loadedSourcesRef.current = new Set();
        attemptAutoZoom();
      } else {
        logger.debug(SOURCE, 'Conditions met, but layers haven\'t changed since last processed.');
      }
    } else {
      logger.debug(SOURCE, 'Conditions NOT met to trigger autoZoom', {
        hasMap: !!mapboxInstance,
        mapStatus,
        areLayersReady
      });
      // Reset state when map is not ready
      if (processedLayersRef.current !== '') {
        logger.debug(SOURCE, 'AutoZoom: Map or layers not ready, resetting state', {
          hasMap: !!mapboxInstance,
          mapStatus,
          areLayersReady
        });
        processedLayersRef.current = '';
        loadedSourcesRef.current = new Set();
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = null;
        }
      }
    }
  }, [mapboxInstance, mapStatus, layers, areLayersReady, attemptAutoZoom, logger]);
} 