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

function getLayerStyle(geometryType: string, properties: Record<string, any> = {}) {
  switch (geometryType) {
    case 'linestring':
    case 'multilinestring':
      return {
        type: 'line' as const,
        paint: {
          'line-color': properties.color || '#FF0000',
          'line-width': properties.width || 3,
          'line-opacity': properties.opacity || 0.8
        },
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        }
      };
    case 'point':
    case 'multipoint':
      return {
        type: 'circle' as const,
        paint: {
          'circle-color': properties.color || '#088',
          'circle-radius': properties.radius || 6,
          'circle-opacity': properties.opacity || 0.8
        },
        layout: {}
      };
    case 'polygon':
    case 'multipolygon':
      return {
        type: 'fill' as const,
        paint: {
          'fill-color': properties.color || '#088',
          'fill-opacity': properties.opacity || 0.4,
          'fill-outline-color': properties.outlineColor || '#066'
        },
        layout: {}
      };
    default:
      logger.warn('Unknown geometry type, defaulting to point style', { geometryType });
      return {
        type: 'circle' as const,
        paint: {
          'circle-color': '#088',
          'circle-radius': 6
        },
        layout: {}
      };
  }
}

export function LayerItem({ layer, className = '', onVisibilityChange }: LayerItemProps) {
  const { mapboxInstance, layers, setLayerVisibility } = useMapStore();
  const rawLayerId = layer.id.replace('layer-', '');
  const { data, loading, error } = useLayerData(rawLayerId);
  const setupCompleteRef = useRef(false);
  const registeredRef = useRef(false);
  const layerId = layer.id;
  const mounted = useRef(true);
  const cleanupInProgressRef = useRef(false);
  const setupLayerRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    mounted.current = true;
    cleanupInProgressRef.current = false;
    return () => {
      mounted.current = false;
      cleanupInProgressRef.current = true;
      // Clean up layer if it exists
      if (mapboxInstance?.getLayer(layerId)) {
        try {
          mapboxInstance.removeLayer(layerId);
        } catch (error) {
          logger.warn('Error removing layer during cleanup', { error, layerId });
        }
      }
      const sourceId = `source-${layerId}`;
      if (mapboxInstance?.getSource(sourceId)) {
        try {
          mapboxInstance.removeSource(sourceId);
        } catch (error) {
          logger.warn('Error removing source during cleanup', { error, sourceId });
        }
      }
    };
  }, [layerId, mapboxInstance]);

  // Register layer with store and add to map when data is loaded
  useEffect(() => {
    // Skip if component is unmounted or cleanup is in progress
    if (!mounted.current || cleanupInProgressRef.current) return;

    // Skip if map is not ready
    if (!mapboxInstance?.loaded() || !mapboxInstance?.isStyleLoaded()) {
      logger.debug('Map or style not ready yet', { 
        layerId,
        mapLoaded: mapboxInstance?.loaded(),
        styleLoaded: mapboxInstance?.isStyleLoaded()
      });
      
      // Wait for both map and style to be loaded
      const setupOnLoad = () => {
        if (mapboxInstance?.loaded() && mapboxInstance?.isStyleLoaded() && setupLayerRef.current) {
          setupLayerRef.current();
        }
      };
      
      mapboxInstance?.on('load', setupOnLoad);
      mapboxInstance?.on('style.load', setupOnLoad);
      
      return () => {
        mapboxInstance?.off('load', setupOnLoad);
        mapboxInstance?.off('style.load', setupOnLoad);
      };
    }

    // If we have an error (like layer not found), clean up the layer from the store
    if (error) {
      logger.debug('Layer data error, cleaning up', { layerId, error });
      // Remove layer from map store since it no longer exists in the database
      setLayerVisibility(layerId, false);
      return;
    }

    // Skip if data is not loaded yet
    if (!data || loading) {
      logger.debug('Data not ready yet', {
        hasData: !!data,
        isLoading: loading,
        layerId
      });
      return;
    }

    const sourceId = `source-${layerId}`;

    const setupLayer = async () => {
      try {
        // Skip if component is unmounted, cleanup is in progress, or map is not ready
        if (!mounted.current || cleanupInProgressRef.current || !mapboxInstance?.loaded() || !mapboxInstance?.isStyleLoaded()) {
          logger.debug('Skipping layer setup - conditions not met', {
            isMounted: mounted.current,
            isCleaningUp: cleanupInProgressRef.current,
            mapLoaded: mapboxInstance?.loaded(),
            styleLoaded: mapboxInstance?.isStyleLoaded(),
            layerId
          });
          return;
        }

        // Get initial visibility state
        const isVisible = layers.get(layerId)?.visible ?? true;

        // If layer is already set up properly, just update visibility
        if (setupCompleteRef.current && mapboxInstance.getLayer(layerId) && mapboxInstance.getSource(sourceId)) {
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

        // Skip if cleanup started during setup
        if (cleanupInProgressRef.current) return;

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

        // Skip if cleanup started during setup
        if (cleanupInProgressRef.current) return;

        // Add source and layer
        mapboxInstance.addSource(sourceId, {
          type: 'geojson',
          data: geojsonData
        });

        // Skip if cleanup started during setup
        if (cleanupInProgressRef.current) {
          try {
            mapboxInstance.removeSource(sourceId);
          } catch (error) {
            logger.warn('Error removing source after cleanup started', { error, sourceId });
          }
          return;
        }

        // Add layer with appropriate styling based on geometry type
        const firstFeature = data.features[0];
        const geometryType = firstFeature?.geometry?.type?.toLowerCase() || 'point';

        const layerStyle = getLayerStyle(geometryType, data.properties);
        mapboxInstance.addLayer({
          id: layerId,
          source: sourceId,
          type: layerStyle.type,
          paint: layerStyle.paint,
          layout: {
            ...layerStyle.layout,
            visibility: isVisible ? 'visible' : 'none'
          }
        });

        setupCompleteRef.current = true;
        logger.debug('Layer setup complete', { layerId });
      } catch (error) {
        logger.error('Error setting up layer', { error, layerId });
        // Clean up any partial setup on error
        try {
          if (mapboxInstance.getLayer(layerId)) {
            mapboxInstance.removeLayer(layerId);
          }
          if (mapboxInstance.getSource(sourceId)) {
            mapboxInstance.removeSource(sourceId);
          }
        } catch (cleanupError) {
          logger.warn('Error cleaning up after setup failure', { error: cleanupError });
        }
      }
    };

    // Store the setupLayer function in the ref
    setupLayerRef.current = setupLayer;

    setupLayer();
  }, [layerId, data, loading, error, mapboxInstance, layers, setLayerVisibility]);

  const handleVisibilityToggle = () => {
    const currentVisibility = layers.get(layerId)?.visible ?? true;
    const newVisibility = !currentVisibility;
    
    // Update the store first
    setLayerVisibility(layerId, newVisibility);
    
    // Update the Mapbox layer visibility if it exists
    if (mapboxInstance?.getLayer(layerId)) {
      try {
        mapboxInstance.setLayoutProperty(layerId, 'visibility', newVisibility ? 'visible' : 'none');
        
        // Also update the outline layer if it exists (for polygons)
        const outlineLayerId = `${layerId}-outline`;
        if (mapboxInstance.getLayer(outlineLayerId)) {
          mapboxInstance.setLayoutProperty(outlineLayerId, 'visibility', newVisibility ? 'visible' : 'none');
        }
        
        logger.debug('Updated Mapbox layer visibility', { layerId, visible: newVisibility });
      } catch (error) {
        logger.error('Error updating layer visibility', { error, layerId });
        // If we failed to update visibility, try to re-add the layer
        setupLayerRef.current?.();
      }
    } else {
      // If the layer doesn't exist, try to re-add it
      logger.debug('Layer not found, attempting to re-add', { layerId });
      setupLayerRef.current?.();
    }
    
    // Notify parent component
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
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{layer.name}</div>
        <div className="text-xs text-muted-foreground truncate">{layer.type}</div>
      </div>
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