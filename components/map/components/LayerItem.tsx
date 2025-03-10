'use client';

import { LogManager } from '@/core/logging/log-manager';
import { useEffect, useRef } from 'react';
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
  const setupCompleteRef = useRef(false);
  const registeredRef = useRef(false);
  const layerId = `layer-${layer.id}`;  // Define layerId once to ensure consistency

  // Register with context on mount
  useEffect(() => {
    if (!registeredRef.current) {
      logger.debug('Registering layer with context', { layerId });
      addLayer(layerId);
      registeredRef.current = true;
    }
  }, [layerId, addLayer]);

  // Register layer with context and add to map when data is loaded
  useEffect(() => {
    if (!map || !data || loading) {
      logger.debug('Skipping layer setup - prerequisites not met', {
        hasMap: !!map,
        hasData: !!data,
        isLoading: loading,
        layerId
      });
      return;
    }

    const sourceId = `source-${layer.id}`;
    let mounted = true;

    const setupLayer = async () => {
      if (!mounted || !map || !map.loaded()) {
        logger.debug('Skipping layer setup - conditions not met', {
          isMounted: mounted,
          hasMap: !!map,
          isMapLoaded: map?.loaded(),
          layerId
        });
        return;
      }

      // If layer is already set up properly, just update visibility
      if (setupCompleteRef.current && map.getLayer(layerId) && map.getSource(sourceId)) {
        const isVisible = layers.get(layerId) ?? true;
        logger.debug('Layer exists, updating visibility', { layerId, isVisible });
        map.setLayoutProperty(layerId, 'visibility', isVisible ? 'visible' : 'none');
        return;
      }

      try {
        // Clean up any partial setup
        try {
          if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
          }
          if (map.getSource(sourceId)) {
            map.removeSource(sourceId);
          }
        } catch (error) {
          logger.warn('Cleanup failed', { error });
        }

        // Get initial visibility state
        const isVisible = layers.get(layerId) ?? true;

        // Validate features
        if (!data.features?.length) {
          logger.warn('No features to display', { layerId });
          return;
        }

        // Create GeoJSON data
        const geojsonData: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: data.features
        };

        // Add source
        map.addSource(sourceId, {
          type: 'geojson',
          data: geojsonData
        });

        // Determine geometry type and add appropriate layer
        const geometryType = data.features[0]?.geometry?.type;
        
        // For line features
        if (geometryType === 'LineString' || geometryType === 'MultiLineString') {
          // Find the first symbol layer in the map style
          const layers = map.getStyle()?.layers || [];
          const firstSymbolId = layers.find(layer => layer.type === 'symbol')?.id;

          // Add the custom layer before the first symbol layer
          const layerOptions: mapboxgl.LineLayer = {
            id: layerId,
            source: sourceId,
            type: 'line',
            paint: {
              'line-color': '#FF0000',
              'line-width': 3,
              'line-opacity': 0.8
            },
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
              'visibility': isVisible ? 'visible' : 'none'
            }
          };

          if (firstSymbolId) {
            map.addLayer(layerOptions, firstSymbolId);
          } else {
            map.addLayer(layerOptions);
          }
        }
        // For point features
        else if (geometryType === 'Point' || geometryType === 'MultiPoint') {
          map.addLayer({
            id: layerId,
            source: sourceId,
            type: 'circle',
            paint: {
              'circle-color': '#088',
              'circle-radius': 6
            }
          });
        }
        // For polygon features
        else if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
          map.addLayer({
            id: layerId,
            source: sourceId,
            type: 'fill',
            paint: {
              'fill-color': '#088',
              'fill-opacity': 0.4
            }
          });

          // Add outline layer for polygons
          map.addLayer({
            id: `${layerId}-outline`,
            source: sourceId,
            type: 'line',
            paint: {
              'line-color': '#066',
              'line-width': 1
            }
          });
        } else {
          throw new Error(`Unsupported geometry type: ${geometryType}`);
        }

        setupCompleteRef.current = true;
        logger.info('Layer setup complete', { 
          layerId,
          name: data.name,
          featureCount: data.features.length,
          geometryType,
          isVisible
        });

        // Calculate bounds
        if (data.features.length > 0) {
          const bounds = new mapboxgl.LngLatBounds();
          data.features.forEach(feature => {
            if (!feature.geometry) return;
            
            switch (feature.geometry.type) {
              case 'Point': {
                const point = feature.geometry as GeoJSON.Point;
                bounds.extend(point.coordinates as [number, number]);
                break;
              }
              case 'LineString': {
                const line = feature.geometry as GeoJSON.LineString;
                line.coordinates.forEach(coord => bounds.extend(coord as [number, number]));
                break;
              }
              case 'Polygon': {
                const polygon = feature.geometry as GeoJSON.Polygon;
                polygon.coordinates[0].forEach(coord => bounds.extend(coord as [number, number]));
                break;
              }
              case 'MultiPoint': {
                const multiPoint = feature.geometry as GeoJSON.MultiPoint;
                multiPoint.coordinates.forEach(coord => bounds.extend(coord as [number, number]));
                break;
              }
              case 'MultiLineString': {
                const multiLine = feature.geometry as GeoJSON.MultiLineString;
                multiLine.coordinates.forEach(line => 
                  line.forEach(coord => bounds.extend(coord as [number, number]))
                );
                break;
              }
              case 'MultiPolygon': {
                const multiPolygon = feature.geometry as GeoJSON.MultiPolygon;
                multiPolygon.coordinates.forEach(polygon => 
                  polygon[0].forEach(coord => bounds.extend(coord as [number, number]))
                );
                break;
              }
            }
          });

          map.fitBounds(bounds, {
            padding: 50,
            animate: true,
            maxZoom: 18
          });
        }
      } catch (error) {
        logger.error('Layer setup failed', { error, layerId });
        setupCompleteRef.current = false;
      }
    };

    // Set up layer
    setupLayer();

    // Listen for style load
    const onStyleLoad = () => {
      if (mounted) {
        setupCompleteRef.current = false;  // Reset on style load
        setupLayer();
      }
    };
    map.on('style.load', onStyleLoad);

    return () => {
      mounted = false;
      map.off('style.load', onStyleLoad);
      
      // Don't remove the layer on unmount unless we're really cleaning up
      // This prevents the layer from being removed when the component re-renders
      if (map.getStyle() && !map._removed) {
        logger.debug('Component unmounting - preserving layer', { layerId });
      }
    };
  }, [map, data?.features, layerId]); // Simplified dependencies

  // Handle visibility changes separately
  useEffect(() => {
    if (!map || !map.getLayer(layerId)) return;
    
    const isVisible = layers.get(layerId) ?? true;
    logger.debug('Updating layer visibility', { layerId, isVisible });
    map.setLayoutProperty(layerId, 'visibility', isVisible ? 'visible' : 'none');
  }, [map, layerId, layers]);

  const isVisible = layers.get(layerId) ?? true;

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
          onClick={() => {
            logger.debug('Toggle button clicked', { 
              layerId,
              currentVisibility: isVisible,
              hasLayer: map?.getLayer(layerId) !== undefined
            });
            toggleLayer(layerId);
          }}
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