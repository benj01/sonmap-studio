import { useEffect, useCallback, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import type { GeoJSON, FeatureCollection, Feature, Geometry, Position, Point, LineString, MultiLineString, Polygon, MultiPolygon } from 'geojson';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useLayers } from '@/store/layers/hooks';
import { LogManager } from '@/core/logging/log-manager';
import type { Layer } from '@/store/layers/layerStore';
import { debounce } from 'lodash';

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

interface ExtendedFeature extends Feature {
  geojson?: string | GeoJSON;
}

interface SourceState {
  isLoaded: boolean;
  hasData: boolean;
  lastChecked: number;
}

const DEBOUNCE_DELAY = 300;
const SOURCE_CHECK_INTERVAL = 100;
const MAX_SOURCE_CHECK_ATTEMPTS = 50; // 5 seconds total

function isStyleLoaded(map: mapboxgl.Map): boolean {
  try {
    return map.isStyleLoaded();
  } catch {
    return false;
  }
}

function isVectorSource(source: mapboxgl.AnySourceImpl | undefined): source is mapboxgl.VectorTileSource {
  if (!source) return false;
  return source.type === 'vector' || 
         !!(source as any)._vectorTileLayerIds || 
         !!(source as any).vectorLayerIds ||
         (Array.isArray((source as any).tiles));
}

function isGeoJSONSource(source: mapboxgl.AnySourceImpl | undefined): source is mapboxgl.GeoJSONSource {
  if (!source) return false;
  return source.type === 'geojson' || 
         (source as any)._data?.type === 'FeatureCollection' ||
         (source as any)._data?.type === 'Feature' ||
         (source as any)._data?.type === 'Point' ||
         (source as any)._data?.type === 'LineString' ||
         (source as any)._data?.type === 'Polygon';
}

function hasValidSourceData(source: mapboxgl.AnySourceImpl, map: mapboxgl.Map, sourceId: string): boolean {
  try {
    // For GeoJSON sources added via 'data' property, isSourceLoaded is sufficient
    const loaded = map.isSourceLoaded(sourceId);
    logger.debug(`Source readiness check for ${sourceId}: isSourceLoaded=${loaded}`);
    return loaded;
  } catch (error) {
    logger.warn(`Error checking source readiness for ${sourceId}:`, error);
    return false;
  }
}

function isFeatureCollection(data: any): data is FeatureCollection {
  return data?.type === 'FeatureCollection' && Array.isArray(data?.features);
}

function isPoint(geometry: Geometry): geometry is Point {
  return geometry.type === 'Point';
}

function isLineString(geometry: Geometry): geometry is LineString {
  return geometry.type === 'LineString';
}

function isMultiLineString(geometry: Geometry): geometry is MultiLineString {
  return geometry.type === 'MultiLineString';
}

function isPolygon(geometry: Geometry): geometry is Polygon {
  return geometry.type === 'Polygon';
}

function isMultiPolygon(geometry: Geometry): geometry is MultiPolygon {
  return geometry.type === 'MultiPolygon';
}

export function useAutoZoom(isMapReady: boolean) {
  const mapboxInstance = useMapInstanceStore(state => state.mapInstances.mapbox.instance);
  const { layers } = useLayers();
  const zoomCompletedRef = useRef<boolean>(false);
  const sourceStatesRef = useRef<Record<string, SourceState>>({});
  const lastVisibleLayerIdsRef = useRef<string[]>([]);
  const missingSourcesRef = useRef<Set<string>>(new Set());
  
  // Get all visible layers
  const visibleLayerConfigs = layers.filter(layer => layer.visible);
  const visibleLayerIds = visibleLayerConfigs.map(layer => layer.id);
  const visibleSourceIds = visibleLayerConfigs.map(layer => `${layer.id}-source`);

  // Reset state when visible layers change
  useEffect(() => {
    const currentVisibleIds = visibleLayerIds.join(',');
    const lastVisibleIds = lastVisibleLayerIdsRef.current.join(',');
    
    if (currentVisibleIds !== lastVisibleIds) {
      logger.debug('Visible layers changed, resetting zoom state', {
        previous: lastVisibleLayerIdsRef.current,
        current: visibleLayerIds,
        visibleSourceIds
      });
      
      zoomCompletedRef.current = false;
      sourceStatesRef.current = {};
      missingSourcesRef.current = new Set();
      lastVisibleLayerIdsRef.current = visibleLayerIds;
    }
  }, [visibleLayerIds]);

  // Reset state when map changes
  useEffect(() => {
    if (!mapboxInstance) {
      zoomCompletedRef.current = false;
      sourceStatesRef.current = {};
      missingSourcesRef.current = new Set();
    }
  }, [mapboxInstance]);

  const checkSourceReadiness = useCallback((sourceId: string): boolean => {
    if (!mapboxInstance || !isStyleLoaded(mapboxInstance)) {
      return false;
    }

    const source = mapboxInstance.getSource(sourceId);
    if (!source) {
      // Track missing sources
      if (!missingSourcesRef.current.has(sourceId)) {
        missingSourcesRef.current.add(sourceId);
        logger.warn(`Source not found on map: ${sourceId}`, {
          visibleSourceIds,
          existingSources: Object.keys(sourceStatesRef.current)
        });
      }
      return false;
    }

    const currentTime = Date.now();
    const state = sourceStatesRef.current[sourceId];

    // If we've checked recently, return cached state
    if (state && currentTime - state.lastChecked < SOURCE_CHECK_INTERVAL) {
      return state.isLoaded;
    }

    // Check source readiness
    const isLoaded = mapboxInstance.isSourceLoaded(sourceId);

    // Update state
    sourceStatesRef.current[sourceId] = {
      isLoaded,
      hasData: isLoaded, // For GeoJSON sources, isLoaded implies hasData
      lastChecked: currentTime
    };

    // Log state changes
    if (state && state.isLoaded !== isLoaded) {
      logger.debug(`Source ${sourceId} state changed:`, {
        previous: state,
        current: { isLoaded }
      });
    }

    return isLoaded;
  }, [mapboxInstance]);

  const checkAllSourcesReady = useCallback((): boolean => {
    if (!mapboxInstance || !isStyleLoaded(mapboxInstance)) {
      return false;
    }

    // Only check sources that actually exist on the map
    const existingSources = visibleSourceIds.filter(sourceId => mapboxInstance.getSource(sourceId));
    
    if (!existingSources.length) {
      logger.debug('No sources found on map to check', {
        visibleSourceIds,
        missingSources: Array.from(missingSourcesRef.current)
      });
      return false;
    }

    // Log missing sources periodically
    if (missingSourcesRef.current.size > 0) {
      logger.warn('Missing sources detected:', {
        missing: Array.from(missingSourcesRef.current),
        visible: visibleSourceIds,
        existing: existingSources
      });
    }

    logger.debug('Checking source readiness:', {
      visibleSourceIds,
      existingSources,
      missingSources: Array.from(missingSourcesRef.current),
      mapInstance: !!mapboxInstance
    });

    let allSourcesReady = true;
    let readySources = 0;

    for (const sourceId of existingSources) {
      const isReady = checkSourceReadiness(sourceId);
      
      if (!isReady) {
        allSourcesReady = false;
      } else {
        readySources++;
      }
    }

    logger.debug('Source readiness check complete:', {
      allSourcesReady,
      readySources,
      totalSources: existingSources.length,
      missingSources: Array.from(missingSourcesRef.current)
    });

    return allSourcesReady && readySources === existingSources.length;
  }, [mapboxInstance, visibleSourceIds, checkSourceReadiness]);

  const calculateAndFitBounds = useCallback(() => {
    if (!mapboxInstance || !checkAllSourcesReady()) {
      logger.debug('Skipping zoom: Map not ready or sources not ready');
      return;
    }

    if (zoomCompletedRef.current) {
      logger.debug('Skipping zoom: Already completed for current layer set');
      return;
    }

    try {
      logger.info(`Calculating bounds for sources: ${visibleSourceIds.join(', ')}`);
      const bounds = getBoundsFromLayers(mapboxInstance, visibleLayerConfigs);

      if (bounds && !bounds.isEmpty()) {
        logger.debug('Calculated combined bounds:', {
          ne: bounds.getNorthEast(),
          sw: bounds.getSouthWest(),
          sourceCount: visibleSourceIds.length
        });
        mapboxInstance.fitBounds(bounds, { padding: 50, duration: 500 });
        zoomCompletedRef.current = true;
        logger.info('Auto-zoom executed successfully');
      } else {
        logger.warn('Bounds calculation resulted in null or empty bounds');
      }
    } catch (error) {
      logger.error('Error during calculateAndFitBounds:', error);
    }
  }, [mapboxInstance, checkAllSourcesReady, visibleLayerConfigs, visibleSourceIds]);

  // Create the debounced version of the zoom function
  const debouncedZoom = useRef(
    debounce(calculateAndFitBounds, DEBOUNCE_DELAY)
  ).current;

  // Effect to handle source data events and style loading
  useEffect(() => {
    if (!mapboxInstance) return;

    const handleSourceData = (e: mapboxgl.MapSourceDataEvent) => {
      if (!e.sourceId || !visibleSourceIds.includes(e.sourceId)) return;

      const source = mapboxInstance.getSource(e.sourceId);
      if (!source) return;

      logger.debug(`Source data event for ${e.sourceId}:`, {
        dataType: e.dataType,
        isSourceLoaded: e.isSourceLoaded,
        sourceType: source.type
      });

      // Only trigger zoom on 'source' data type events
      if (e.dataType === 'source') {
        debouncedZoom();
      }
    };

    mapboxInstance.on('sourcedata', handleSourceData);
    mapboxInstance.on('style.load', () => {
      logger.debug('Style loaded, checking source states');
      visibleSourceIds.forEach(sourceId => {
        const source = mapboxInstance.getSource(sourceId);
        if (source) {
          const event = {
            sourceId,
            isSourceLoaded: true,
            source: source,
            dataType: 'source' as const
          } as mapboxgl.MapSourceDataEvent;
          handleSourceData(event);
        }
      });
    });

    return () => {
      mapboxInstance.off('sourcedata', handleSourceData);
      mapboxInstance.off('style.load', () => {});
      debouncedZoom.cancel();
    };
  }, [mapboxInstance, visibleSourceIds, debouncedZoom]);

  const getBoundsFromLayers = (map: mapboxgl.Map, layerConfigs: Layer[]): mapboxgl.LngLatBounds | null => {
    const bounds = new mapboxgl.LngLatBounds();
    let hasValidCoordinates = false;
    let processedSources = 0;

    logger.debug('Starting bounds calculation for layers:', {
      layerCount: layerConfigs.length,
      layerIds: layerConfigs.map(l => l.id)
    });

    for (const layerConfig of layerConfigs) {
      const sourceId = `${layerConfig.id}-source`;
      const source = map.getSource(sourceId);

      if (!source) {
        logger.warn(`Source not found: ${sourceId}`);
        continue;
      }

      try {
        const features = map.querySourceFeatures(sourceId);
        
        if (features.length > 0) {
          features.forEach(feature => {
            if (feature.geometry) {
              switch (feature.geometry.type) {
                case 'Point':
                  bounds.extend(feature.geometry.coordinates as mapboxgl.LngLatLike);
                  hasValidCoordinates = true;
                  break;
                case 'LineString':
                  feature.geometry.coordinates.forEach(coord => {
                    bounds.extend(coord as mapboxgl.LngLatLike);
                    hasValidCoordinates = true;
                  });
                  break;
                case 'Polygon':
                  feature.geometry.coordinates.forEach(ring => {
                    ring.forEach(coord => {
                      bounds.extend(coord as mapboxgl.LngLatLike);
                      hasValidCoordinates = true;
                    });
                  });
                  break;
              }
            }
          });
          processedSources++;
          logger.debug(`Extended bounds from source features: ${sourceId}`, {
            featureCount: features.length,
            currentBounds: {
              ne: bounds.getNorthEast(),
              sw: bounds.getSouthWest()
            }
          });
        } else {
          logger.debug(`No features found in source: ${sourceId}`);
        }
      } catch (error) {
        logger.warn(`Failed to get features from source: ${sourceId}`, error);
      }
    }

    if (!hasValidCoordinates) {
      logger.warn('No valid coordinates found across all visible layers for bounds calculation.');
      return null;
    }

    logger.debug('Completed bounds calculation:', {
      processedSources,
      totalSources: layerConfigs.length,
      finalBounds: {
        ne: bounds.getNorthEast(),
        sw: bounds.getSouthWest()
      }
    });

    return bounds;
  };

  return null;
} 