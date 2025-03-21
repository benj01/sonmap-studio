'use client';

import { LogManager } from '@/core/logging/log-manager';
import { useEffect, useRef } from 'react';
import { Eye, EyeOff, Settings, AlertCircle, Maximize } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMapStore } from '@/store/mapStore';
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
  onVisibilityChange?: (visible: boolean) => void;
}

export function LayerItem({ layer, className = '', onVisibilityChange }: LayerItemProps) {
  const { mapboxInstance, layers, setLayerVisibility } = useMapStore();
  const { data, loading, error } = useLayerData(layer.id);
  const setupCompleteRef = useRef(false);
  const registeredRef = useRef(false);
  const layerId = `layer-${layer.id}`;

  // Register with store on mount
  useEffect(() => {
    if (!registeredRef.current) {
      logger.debug('Registering layer with store', { layerId });
      setLayerVisibility(layerId, true);
      registeredRef.current = true;
    }
  }, [layerId, setLayerVisibility]);

  // Register layer with store and add to map when data is loaded
  useEffect(() => {
    // Skip if map is not ready or data is not loaded
    if (!mapboxInstance?.loaded()) {
      logger.debug('Map not ready yet', { layerId });
      return;
    }

    if (!data || loading) {
      logger.debug('Data not ready yet', {
        hasData: !!data,
        isLoading: loading,
        layerId
      });
      return;
    }

    const sourceId = `source-${layer.id}`;
    let mounted = true;

    const setupLayer = async () => {
      try {
        // Skip if component is unmounted or map is not ready
        if (!mounted || !mapboxInstance?.loaded()) {
          logger.debug('Skipping layer setup - conditions not met', {
            isMounted: mounted,
            mapLoaded: mapboxInstance?.loaded(),
            layerId
          });
          return;
        }

        // If layer is already set up properly, just update visibility
        if (setupCompleteRef.current && mapboxInstance.getLayer(layerId) && mapboxInstance.getSource(sourceId)) {
          const isVisible = layers.get(layerId)?.visible ?? true;
          logger.debug('Layer exists, updating visibility', { layerId, isVisible });
          mapboxInstance.setLayoutProperty(layerId, 'visibility', isVisible ? 'visible' : 'none');
          return;
        }

        // Clean up any partial setup
        try {
          if (mapboxInstance.getLayer(layerId)) {
            mapboxInstance.removeLayer(layerId);
          }
          if (mapboxInstance.getSource(sourceId)) {
            mapboxInstance.removeSource(sourceId);
          }
        } catch (error) {
          logger.warn('Cleanup failed', { error });
        }

        // Get initial visibility state
        const isVisible = layers.get(layerId)?.visible ?? true;

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

        // Wait for map to be ready
        if (!mapboxInstance.isStyleLoaded()) {
          logger.debug('Waiting for style to load', { layerId });
          await new Promise<void>((resolve) => {
            const checkStyle = () => {
              if (mapboxInstance.isStyleLoaded()) {
                resolve();
              } else {
                requestAnimationFrame(checkStyle);
              }
            };
            checkStyle();
          });
        }

        // Add source
        mapboxInstance.addSource(sourceId, {
          type: 'geojson',
          data: geojsonData
        });

        // Determine geometry type and add appropriate layer
        const geometryType = data.features[0]?.geometry?.type;
        
        // For line features
        if (geometryType === 'LineString' || geometryType === 'MultiLineString') {
          // Find the first symbol layer in the map style
          const layers = mapboxInstance.getStyle()?.layers || [];
          const firstSymbolId = layers.find((layer: mapboxgl.Layer) => layer.type === 'symbol')?.id;

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
            mapboxInstance.addLayer(layerOptions, firstSymbolId);
          } else {
            mapboxInstance.addLayer(layerOptions);
          }
        }
        // For point features
        else if (geometryType === 'Point' || geometryType === 'MultiPoint') {
          mapboxInstance.addLayer({
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
          mapboxInstance.addLayer({
            id: layerId,
            source: sourceId,
            type: 'fill',
            paint: {
              'fill-color': '#088',
              'fill-opacity': 0.4
            }
          });

          // Add outline layer for polygons
          mapboxInstance.addLayer({
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
            }
          });

          // Fit bounds with padding
          mapboxInstance.fitBounds(bounds, {
            padding: 50,
            duration: 1000
          });
        }
      } catch (error) {
        logger.error('Error setting up layer', { error, layerId });
      }
    };

    setupLayer();

    return () => {
      mounted = false;
    };
  }, [data, loading, layerId, mapboxInstance, layers]);

  const handleVisibilityToggle = () => {
    const currentVisibility = layers.get(layerId)?.visible ?? true;
    const newVisibility = !currentVisibility;
    setLayerVisibility(layerId, newVisibility);
    onVisibilityChange?.(newVisibility);
  };

  const handleZoomToLayer = () => {
    if (!mapboxInstance || !data?.features?.length) return;

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
      }
    });

    mapboxInstance.fitBounds(bounds, {
      padding: 50,
      duration: 1000
    });
  };

  if (loading) {
    return (
      <div className={cn('flex items-center gap-2 p-2', className)}>
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-16" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('flex items-center gap-2 p-2 text-destructive', className)}>
        <AlertCircle className="h-4 w-4" />
        <span className="text-sm">{error.message}</span>
      </div>
    );
  }

  const isVisible = layers.get(layerId)?.visible ?? true;

  return (
    <div className={cn('flex items-center gap-2 p-2 hover:bg-accent rounded-md', className)}>
      <Button
        variant="ghost"
        size="icon"
        className="h-4 w-4"
        onClick={handleVisibilityToggle}
      >
        {isVisible ? (
          <Eye className="h-4 w-4" />
        ) : (
          <EyeOff className="h-4 w-4" />
        )}
      </Button>
      <span className="text-sm flex-1 truncate">{layer.name}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-4 w-4"
        onClick={handleZoomToLayer}
      >
        <Maximize className="h-4 w-4" />
      </Button>
    </div>
  );
}