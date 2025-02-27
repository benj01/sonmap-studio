'use client';

import { LogManager } from '@/core/logging/log-manager';
import { useEffect } from 'react';
import { Eye, EyeOff, Settings, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMapContext } from '../hooks/useMapContext';
import { useLayerData } from '../hooks/useLayerData';
import { Skeleton } from '@/components/ui/skeleton';
import * as mapboxgl from 'mapbox-gl';

const SOURCE = 'LayerItem';
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

interface Layer {
  id: string;
  name: string;
  type: string;
  properties: Record<string, any>;
}

interface LayerItemProps {
  layer: Layer;
  className?: string;
}

export function LayerItem({ layer, className = '' }: LayerItemProps) {
  const { map, layers, toggleLayer, addLayer } = useMapContext();
  const { data, loading, error } = useLayerData(layer.id);

  // Add logging for component mount and data loading
  useEffect(() => {
    logger.info('LayerItem mounted', {
      layerId: layer.id,
      hasMap: !!map,
      mapLoaded: map?.loaded(),
      loading,
      hasData: !!data,
      featureCount: data?.features?.length,
      error: !!error
    });

    return () => {
      logger.info('LayerItem unmounting', {
        layerId: layer.id,
        hasMap: !!map,
        mapLoaded: map?.loaded()
      });
    };
  }, []);

  // Log data loading state changes
  useEffect(() => {
    logger.info('Layer data state changed', {
      layerId: layer.id,
      loading,
      hasData: !!data,
      featureCount: data?.features?.length,
      error: !!error
    });
  }, [data, loading, error, layer.id]);

  // Register layer with context and add to map when data is loaded
  useEffect(() => {
    if (!map || !data || loading) {
      logger.info('Map or data not ready', { 
        hasMap: !!map, 
        hasData: !!data,
        mapLoaded: map?.loaded(),
        layerId: layer.id,
        loading,
        error: !!error
      });
      return;
    }

    const sourceId = `source-${layer.id}`;
    const layerId = `layer-${layer.id}`;

    const setupLayer = () => {
      try {
        if (!map.getStyle()) {
          logger.warn('Map style not available yet', { layerId });
          return;
        }

        logger.info('Setting up layer', { 
          sourceId, 
          layerId, 
          featureCount: data.features.length,
          mapLoaded: map.loaded(),
          hasStyle: true,
          styleLoaded: map.isStyleLoaded(),
          existingSource: !!map.getSource(sourceId),
          existingLayer: !!map.getLayer(layerId)
        });

        // Add source if it doesn't exist
        if (!map.getSource(sourceId)) {
          try {
            logger.info('Adding source', { 
              sourceId, 
              featureCount: data.features.length,
              firstFeature: data.features[0]
            });
            
            const geojsonData: GeoJSON.FeatureCollection = {
              type: 'FeatureCollection',
              features: data.features
            };
            
            map.addSource(sourceId, {
              type: 'geojson',
              data: geojsonData
            });
            logger.info('Source added successfully', { sourceId });
          } catch (error) {
            logger.error('Failed to add source', { error, sourceId });
            return;
          }
        }

        // Add layer if it doesn't exist
        if (!map.getLayer(layerId)) {
          try {
            logger.info('Adding layer', { 
              layerId, 
              type: layer.type,
              sourceId,
              firstFeatureType: data.features[0]?.geometry?.type
            });

            map.addLayer({
              id: layerId,
              source: sourceId,
              type: 'line',
              paint: {
                'line-color': '#088',
                'line-width': 2
              }
            });

            // Verify layer was added
            if (!map.getLayer(layerId)) {
              logger.error('Layer not found after adding', { layerId });
              return;
            }

            // Register with context
            addLayer(layerId);
            logger.info('Layer added successfully', { layerId });
            
            // Fit map to layer bounds if we have features
            if (data.features.length > 0) {
              try {
                const bounds = new mapboxgl.LngLatBounds();
                let hasValidBounds = false;

                data.features.forEach(feature => {
                  if (feature.geometry?.type === 'LineString') {
                    const coords = (feature.geometry as GeoJSON.LineString).coordinates;
                    coords.forEach(coord => {
                      bounds.extend([coord[0], coord[1]]);
                      hasValidBounds = true;
                    });
                  } else if (feature.geometry?.type === 'MultiLineString') {
                    const coords = (feature.geometry as GeoJSON.MultiLineString).coordinates;
                    coords.forEach(line => {
                      line.forEach(coord => {
                        bounds.extend([coord[0], coord[1]]);
                        hasValidBounds = true;
                      });
                    });
                  }
                });
                
                if (hasValidBounds) {
                  logger.info('Fitting to bounds', { 
                    bounds: bounds.toArray(),
                    featureCount: data.features.length
                  });
                  map.fitBounds(bounds, { 
                    padding: 50,
                    animate: true
                  });
                } else {
                  logger.warn('No valid bounds found for layer', { layerId });
                }
              } catch (error) {
                logger.error('Error fitting to bounds', { error, layerId });
              }
            }
          } catch (error) {
            logger.error('Failed to setup layer', { error, layerId, sourceId });
          }
        }
      } catch (error) {
        logger.error('Failed to setup layer', { error, layerId, sourceId });
      }
    };

    // Wait for map to be ready
    if (!map.loaded()) {
      logger.info('Map not loaded, waiting for load event', { layerId });
      map.once('load', setupLayer);
    } else {
      setupLayer();
    }

    return () => {
      logger.info('Cleaning up layer', { layerId, sourceId });
      if (map && map.getStyle()) {
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId);
          logger.info('Layer removed', { layerId });
        }
        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
          logger.info('Source removed', { sourceId });
        }
      }
    };
  }, [map, data, layer.id, layer.type, loading, addLayer]);

  const isVisible = layers.get(`layer-${layer.id}`) ?? true;

  if (loading) {
    return (
      <div className={cn('p-2', className)}>
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn(
        'flex items-center gap-2 p-2 text-destructive',
        className
      )}>
        <AlertCircle className="h-4 w-4" />
        <span className="text-sm">Failed to load layer</span>
      </div>
    );
  }

  return (
    <div 
      className={cn(
        'flex items-center justify-between p-2 rounded-md hover:bg-accent/50',
        className
      )}
    >
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => toggleLayer(`layer-${layer.id}`)}
          className="h-8 w-8"
        >
          {isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </Button>
        <div>
          <div className="font-medium">{layer.name}</div>
          <div className="text-xs text-muted-foreground">
            {data?.features.length || 0} features
          </div>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
      >
        <Settings className="h-4 w-4" />
      </Button>
    </div>
  );
}