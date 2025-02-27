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

  // Register with context on mount
  useEffect(() => {
    if (!registeredRef.current) {
      addLayer(`layer-${layer.id}`);
      registeredRef.current = true;
    }
  }, [layer.id, addLayer]);

  // Register layer with context and add to map when data is loaded
  useEffect(() => {
    if (!map || !data || loading) {
      return;
    }

    const sourceId = `source-${layer.id}`;
    const layerId = `layer-${layer.id}`;
    let mounted = true;

    const setupLayer = () => {
      if (!mounted || setupCompleteRef.current || !map || !map.loaded()) return;

      try {
        // Skip if layer already exists and is properly set up
        if (map.getStyle() && map.getLayer(layerId) && map.getSource(sourceId)) {
          setupCompleteRef.current = true;
          return;
        }

        // Clean up any partial setup
        try {
          if (map.getStyle() && map.getLayer(layerId)) {
            map.removeLayer(layerId);
          }
          if (map.getStyle() && map.getSource(sourceId)) {
            map.removeSource(sourceId);
          }
        } catch (error) {
          logger.warn('Cleanup failed', { error });
        }

        // Validate features
        if (!data.features?.length) {
          logger.warn('No features to display');
          return;
        }

        // Log feature information for debugging
        logger.info('Setting up layer', {
          layerId,
          featureCount: data.features.length,
          geometryTypes: [...new Set(data.features.map(f => f.geometry?.type))]
        });

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
        switch (geometryType) {
          case 'Point':
          case 'MultiPoint':
            map.addLayer({
              id: layerId,
              source: sourceId,
              type: 'circle',
              paint: {
                'circle-color': '#088',
                'circle-radius': 6
              }
            });
            break;
          case 'LineString':
          case 'MultiLineString':
            map.addLayer({
              id: layerId,
              source: sourceId,
              type: 'line',
              paint: {
                'line-color': '#088',
                'line-width': 2
              }
            });
            break;
          case 'Polygon':
          case 'MultiPolygon':
            map.addLayer({
              id: layerId,
              source: sourceId,
              type: 'fill',
              paint: {
                'fill-color': '#088',
                'fill-opacity': 0.4,
                'fill-outline-color': '#066'
              }
            });
            break;
          default:
            throw new Error(`Unsupported geometry type: ${geometryType}`);
        }

        logger.info('Layer setup complete', { 
          layerId,
          name: data.name,
          featureCount: data.features.length,
          geometryType
        });
        
        setupCompleteRef.current = true;

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

          // Add padding for small features
          const [[minLng, minLat], [maxLng, maxLat]] = bounds.toArray();
          const lngDiff = Math.abs(maxLng - minLng);
          const latDiff = Math.abs(maxLat - minLat);
          
          // If the feature is very small, add more padding
          if (lngDiff < 0.001 || latDiff < 0.001) {
            const padding = 0.001; // About 100m at the equator
            bounds.extend([minLng - padding, minLat - padding]);
            bounds.extend([maxLng + padding, maxLat + padding]);
          }

          map.fitBounds(bounds, {
            padding: 50,
            animate: true,
            maxZoom: 18
          });
        }
      } catch (error) {
        logger.error('Layer setup failed', { error });
      }
    };

    // Only set up when map is fully loaded
    if (map.loaded() && map.getStyle()) {
      setupLayer();
    }

    // Listen for style load
    const onStyleLoad = () => {
      if (mounted && !setupCompleteRef.current) {
        setupLayer();
      }
    };
    map.on('style.load', onStyleLoad);

    return () => {
      mounted = false;
      map.off('style.load', onStyleLoad);
      
      try {
        // Only clean up if setup was completed and map is still valid
        if (setupCompleteRef.current && map.getStyle()) {
          if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
          }
          if (map.getSource(sourceId)) {
            map.removeSource(sourceId);
          }
        }
      } catch (error) {
        logger.warn('Cleanup failed', { error });
      }
    };
  }, [map, data, layer.id, layer.type, loading]);

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