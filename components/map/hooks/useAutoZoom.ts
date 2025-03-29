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

type SourceState = {
  isLoaded: boolean;
  hasData: boolean;
};

const DEBOUNCE_DELAY = 300;

function isStyleLoaded(map: mapboxgl.Map): boolean {
  try {
    return map.isStyleLoaded();
  } catch {
    return false;
  }
}

function isVectorSource(source: mapboxgl.AnySourceImpl | undefined): source is mapboxgl.VectorTileSource {
  if (!source) return false;
  
  // Primary check: source type is explicitly 'vector'
  if (source.type === 'vector') return true;
  
  // Secondary check: source has vector tile specific properties
  const sourceAny = source as any;
  return !!(
    sourceAny._vectorTileLayerIds || 
    sourceAny.vectorLayerIds ||
    // Check if source has tile-specific properties
    (sourceAny.tiles && Array.isArray(sourceAny.tiles))
  );
}

function isGeoJSONSource(source: mapboxgl.AnySourceImpl | undefined): source is mapboxgl.GeoJSONSource {
  if (!source) return false;
  
  // Primary check: source type is explicitly 'geojson'
  if (source.type === 'geojson') return true;
  
  // Secondary check: source has GeoJSON specific properties
  const sourceAny = source as any;
  return !!(
    sourceAny._data?.type === 'FeatureCollection' ||
    sourceAny._data?.type === 'Feature' ||
    sourceAny._data?.type === 'Point' ||
    sourceAny._data?.type === 'LineString' ||
    sourceAny._data?.type === 'Polygon'
  );
}

function hasValidSourceData(source: mapboxgl.AnySourceImpl, map: mapboxgl.Map, sourceId: string): boolean {
  try {
    // First check if source is loaded at the map level
    if (!map.isSourceLoaded(sourceId)) {
      return false;
    }

    if (isVectorSource(source)) {
      // For vector sources, we need to check if we can query features
      // This indicates the source is ready for use
      const features = map.querySourceFeatures(sourceId);
      return features.length > 0;
    } else if (isGeoJSONSource(source)) {
      // For GeoJSON sources, check if we can access the data
      const sourceAny = source as any;
      const data = sourceAny._data;
      
      if (!data) return false;
      if (typeof data === 'string') return false;
      if (typeof data !== 'object') return false;

      // Check if we can query features
      const features = map.querySourceFeatures(sourceId);
      return features.length > 0;
    }
    
    return false;
  } catch (error) {
    logger.warn('Error checking source data validity:', error);
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
  const zoomCompletedForCurrentLayersRef = useRef<boolean>(false);
  const visibleSourceIdsRef = useRef<string[]>([]);
  
  // Get all visible layers
  const visibleLayerConfigs = layers.filter(layer => layer.visible);
  const visibleLayerIds = visibleLayerConfigs.map(layer => layer.id);
  const visibleSourceIds = visibleLayerConfigs.map(layer => `${layer.id}-source`);

  // Update visibleSourceIdsRef when visible layers change
  useEffect(() => {
    visibleSourceIdsRef.current = visibleSourceIds;
    logger.debug('Visible source IDs updated', { 
      count: visibleSourceIds.length,
      sourceIds: visibleSourceIds 
    });
  }, [visibleSourceIds]);

  // Reset state when map changes
  useEffect(() => {
    if (!mapboxInstance) {
      zoomCompletedForCurrentLayersRef.current = false;
    }
  }, [mapboxInstance]);

  const checkAllSourcesReady = useCallback((): boolean => {
    if (!mapboxInstance || !isStyleLoaded(mapboxInstance)) {
      logger.debug('Map instance or style not ready');
      return false;
    }

    // Only check sources that actually exist on the map
    const existingSources = visibleSourceIdsRef.current.filter(sourceId => mapboxInstance.getSource(sourceId));
    
    if (!existingSources.length) {
      logger.debug('No sources found on map to check');
      return false;
    }

    logger.debug('Checking source readiness:', {
      visibleSourceIds: visibleSourceIdsRef.current,
      existingSources,
      mapInstance: !!mapboxInstance
    });

    let allSourcesReady = true;
    let readySources = 0;

    for (const sourceId of existingSources) {
      const source = mapboxInstance.getSource(sourceId);
      
      if (!source) {
        logger.debug(`Source not found: ${sourceId}`);
        allSourcesReady = false;
        continue;
      }

      const sourceType = isVectorSource(source) ? 'vector' : 'geojson';
      const isLoaded = mapboxInstance.isSourceLoaded(sourceId);
      
      // Check if data is actually queryable
      let hasQueryableData = false;
      if (isLoaded) {
        try {
          const features = mapboxInstance.querySourceFeatures(sourceId);
          hasQueryableData = features.length > 0;
        } catch (error) {
          logger.warn(`Error querying source features for ${sourceId}:`, error);
        }
      }

      logger.debug(`Source ${sourceId} check:`, {
        sourceType,
        isLoaded,
        hasQueryableData,
        source: source.type
      });

      if (!isLoaded || !hasQueryableData) {
        allSourcesReady = false;
      } else {
        readySources++;
      }
    }

    logger.debug('Source readiness check complete:', {
      allSourcesReady,
      readySources,
      totalSources: existingSources.length
    });

    return allSourcesReady && readySources === existingSources.length;
  }, [mapboxInstance]);

  const calculateAndFitBounds = useCallback(() => {
    if (!mapboxInstance || !checkAllSourcesReady()) {
      logger.debug('Skipping zoom: Map not ready or sources not ready');
      return;
    }

    if (zoomCompletedForCurrentLayersRef.current) {
      logger.debug('Skipping zoom: Already completed for current layer set');
      return;
    }

    try {
      logger.info(`Calculating bounds for sources: ${visibleSourceIdsRef.current.join(', ')}`);
      const bounds = getBoundsFromLayers(mapboxInstance, visibleLayerConfigs);

      if (bounds && !bounds.isEmpty()) {
        logger.debug('Calculated combined bounds:', {
          ne: bounds.getNorthEast(),
          sw: bounds.getSouthWest(),
          sourceCount: visibleSourceIdsRef.current.length
        });
        mapboxInstance.fitBounds(bounds, { padding: 50, duration: 500 });
        zoomCompletedForCurrentLayersRef.current = true;
        logger.info('Auto-zoom executed successfully');
      } else {
        logger.warn('Bounds calculation resulted in null or empty bounds');
      }
    } catch (error) {
      logger.error('Error during calculateAndFitBounds:', error);
    }
  }, [mapboxInstance, checkAllSourcesReady, visibleLayerConfigs]);

  // Create the debounced version of the zoom function
  const debouncedZoom = useRef(
    debounce(calculateAndFitBounds, DEBOUNCE_DELAY)
  ).current;

  useEffect(() => {
    if (!mapboxInstance) return;

    const handleSourceData = (e: mapboxgl.MapSourceDataEvent) => {
      if (!e.sourceId || !visibleSourceIdsRef.current.includes(e.sourceId)) return;

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
      visibleSourceIdsRef.current.forEach(sourceId => {
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
  }, [mapboxInstance, debouncedZoom]);

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
        // Try to get features from the source
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