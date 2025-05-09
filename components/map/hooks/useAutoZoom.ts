'use client';

import { useEffect, useCallback, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useLayers } from '@/store/layers/hooks';
import { dbLogger } from '@/utils/logging/dbLogger';
import { useAreInitialLayersReady } from '@/store/layers/hooks';

const SOURCE = 'useAutoZoom';

type Coordinate = [number, number];
type LineCoordinates = Coordinate[];
type PolygonCoordinates = LineCoordinates[];

const MAX_AUTOZOOM_RETRIES = 10;
const AUTOZOOM_RETRY_DELAY = 500;

interface GeoJSONFeature {
  id?: string | number;
  type: string;
  geometry: {
    type: string;
    coordinates: Coordinate | LineCoordinates | PolygonCoordinates | PolygonCoordinates[];
  };
  geojson?: string | { type: string; coordinates: unknown };
}

interface GeoJSONData {
  type: string;
  features: GeoJSONFeature[];
}

function isGeoJSONSource(source: mapboxgl.AnySourceImpl | undefined): source is mapboxgl.GeoJSONSource {
  return !!source && 'setData' in source && typeof source.setData === 'function';
}

export function useAutoZoom() {
  // TODO: Update to use new Mapbox instance management once refactor is complete
  // For now, we'll keep using the existing store but with proper typing
  const mapboxInstance = useMapInstanceStore(state => state.mapInstances.cesium.instance as unknown as mapboxgl.Map | null);
  const mapStatus = useMapInstanceStore(state => state.mapInstances.cesium.status);
  const { layers } = useLayers();
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

    const handleSourceData = async (e: mapboxgl.MapSourceDataEvent) => {
      if (e.isSourceLoaded && e.sourceId) {
        await dbLogger.debug('Source data loaded', { source: SOURCE, sourceId: e.sourceId });
        loadedSourcesRef.current.add(e.sourceId);
      }
    };

    (async () => {
      await dbLogger.debug('Adding sourcedata listener', { source: SOURCE });
    })().catch(console.error);
    
    mapboxInstance.on('sourcedata', handleSourceData);

    return () => {
      if (mapboxInstance && mapboxInstance.getCanvas() && !mapboxInstance._removed) {
        (async () => {
          await dbLogger.debug('Removing sourcedata listener', { source: SOURCE });
          try {
            mapboxInstance.off('sourcedata', handleSourceData);
          } catch (offError) {
            await dbLogger.warn('Error removing sourcedata listener', { source: SOURCE, error: offError });
          }
        })().catch(console.error);
      }
    };
  }, [mapboxInstance]);

  const attemptAutoZoom = useCallback(async (retryCount = 0) => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    if (!mapboxInstance || mapStatus !== 'ready' || !areLayersReady) {
      await dbLogger.debug('AutoZoom: Map or layers not ready', { 
        source: SOURCE,
        hasMap: !!mapboxInstance,
        mapStatus,
        areLayersReady,
        retryCount 
      });
      return;
    }

    // Check if the map is currently moving/zooming
    if (mapboxInstance.isMoving() || mapboxInstance.isZooming()) {
      await dbLogger.debug('AutoZoom: Map is moving/zooming, waiting...', { source: SOURCE });
      mapboxInstance.once('moveend', () => {
        if (retryCount < MAX_AUTOZOOM_RETRIES - 1) {
          retryTimeoutRef.current = setTimeout(() => {
            attemptAutoZoom(retryCount + 1).catch(async (error) => {
              await dbLogger.error('Error in autoZoom retry', { source: SOURCE, error, retryCount });
            });
          }, AUTOZOOM_RETRY_DELAY);
        }
      });
      return;
    }

    // Filter layers based on the status set by MapLayer
    const visibleLayers = layers.filter(l => l.visible && l.setupStatus === 'complete');

    if (!visibleLayers.length) {
      await dbLogger.debug('AutoZoom: No visible layers have setupStatus === "complete" yet.', { source: SOURCE });
      return;
    }

    // Proceed directly to bounds calculation
    await dbLogger.debug('AutoZoom: Found layers with setupStatus complete. Calculating bounds.', {
      source: SOURCE,
      visibleLayerCount: visibleLayers.length,
      visibleLayerIds: visibleLayers.map(l => l.id),
    });

    const map = mapboxInstance;
    const bounds = new mapboxgl.LngLatBounds();
    let hasValidBounds = false;
    let totalCoordCount = 0;

    for (const layer of visibleLayers) {
      // Derive source ID based on convention
      const sourceId = `${layer.id}-source`;
      const source = map.getSource(sourceId);

      // Add a check here to ensure the source *actually* exists now
      if (!source) {
        await dbLogger.warn(`AutoZoom: Source ${sourceId} not found for completed layer ${layer.id}. Skipping bounds calculation for this layer.`, { source: SOURCE });
        continue;
      }

      if (isGeoJSONSource(source)) {
        const data = source._data as unknown as GeoJSONData;
        if (data?.features?.length) {
          for (const feature of data.features) {
            try {
              let geometry = feature.geometry;
              
              if (!geometry && feature.geojson) {
                try {
                  geometry = typeof feature.geojson === 'string' 
                    ? JSON.parse(feature.geojson)
                    : feature.geojson;
                } catch (parseError) {
                  await dbLogger.warn('Failed to parse geojson field', {
                    source: SOURCE,
                    layerId: layer.id,
                    featureId: feature.id,
                    error: parseError
                  });
                  continue;
                }
              }

              if (!geometry?.type || !geometry?.coordinates) {
                await dbLogger.warn('Invalid geometry', {
                  source: SOURCE,
                  layerId: layer.id,
                  featureId: feature.id,
                  geometryType: geometry?.type
                });
                continue;
              }

              const addCoordinate = (coord: Coordinate) => {
                bounds.extend(coord as mapboxgl.LngLatLike);
                totalCoordCount++;
              };

              switch (geometry.type) {
                case 'Point':
                  addCoordinate(geometry.coordinates as Coordinate);
                  break;
                case 'LineString':
                  (geometry.coordinates as LineCoordinates).forEach(addCoordinate);
                  break;
                case 'MultiLineString':
                  (geometry.coordinates as LineCoordinates[]).forEach(line => 
                    line.forEach(addCoordinate));
                  break;
                case 'Polygon':
                  (geometry.coordinates as PolygonCoordinates).forEach(ring => 
                    ring.forEach(addCoordinate));
                  break;
                case 'MultiPolygon':
                  (geometry.coordinates as PolygonCoordinates[]).forEach(polygon => 
                    polygon.forEach(ring => ring.forEach(addCoordinate)));
                  break;
                default:
                  await dbLogger.warn('Unsupported geometry type', {
                    source: SOURCE,
                    layerId: layer.id,
                    featureId: feature.id,
                    geometryType: geometry.type
                  });
              }
            } catch (featureError) {
              await dbLogger.warn('Error processing feature geometry', {
                source: SOURCE,
                layerId: layer.id,
                featureId: feature.id,
                error: featureError
              });
            }
          }
        }
      }
    }

    if (totalCoordCount > 0) {
      hasValidBounds = true;
    }

    if (hasValidBounds && bounds.getNorthEast() && bounds.getSouthWest()) {
      await dbLogger.info('AutoZoom: Zooming to bounds', { 
        source: SOURCE,
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
      await dbLogger.warn('AutoZoom: No valid bounds found', { source: SOURCE, totalCoordCount });
    }
  }, [mapboxInstance, mapStatus, layers, areLayersReady]);

  // Main effect to trigger autozoom check
  useEffect(() => {
    // Log the state values *every time* the effect runs
    (async () => {
      await dbLogger.debug('Main effect triggered', {
        source: SOURCE,
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

        await dbLogger.debug('Checking conditions to trigger autoZoom', {
          source: SOURCE,
          conditionsMet: true,
          currentVisibleLayers,
          processedLayers: processedLayersRef.current,
          isDifferent: currentVisibleLayers !== processedLayersRef.current
        });

        if (currentVisibleLayers !== processedLayersRef.current) {
          await dbLogger.debug('Triggering autoZoom', { source: SOURCE });
          processedLayersRef.current = currentVisibleLayers;
          attemptAutoZoom().catch(async (error) => {
            await dbLogger.error('Error in autoZoom', { source: SOURCE, error });
          });
        }
      }
    })().catch(console.error);
  }, [mapboxInstance, mapStatus, layers, areLayersReady, attemptAutoZoom]);

  return attemptAutoZoom;
} 