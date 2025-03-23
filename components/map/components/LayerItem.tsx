'use client';

import { LogManager } from '@/core/logging/log-manager';
import { useEffect, useRef } from 'react';
import { Eye, EyeOff, Settings, AlertCircle, Maximize } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLayer } from '@/store/layers/hooks';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
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

export function LayerItem({ layer, className, onVisibilityChange }: LayerItemProps) {
  const { id, name, type, properties } = layer;
  const { isVisible, setVisibility, setupStatus, error } = useLayer(id);
  const mapboxInstance = useMapInstanceStore(state => state.mapInstances.mapbox.instance);
  const { data, loading } = useLayerData(id);
  const layerRef = useRef<mapboxgl.FillLayerSpecification | null>(null);

  useEffect(() => {
    if (!mapboxInstance || !data) return;

    try {
      // Add source if it doesn't exist
      if (!mapboxInstance.getSource(id)) {
        mapboxInstance.addSource(id, {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: data.features
          }
        });
      }

      // Add layer if it doesn't exist
      if (!mapboxInstance.getLayer(id)) {
        const layerConfig: mapboxgl.FillLayerSpecification = {
          id,
          type: 'fill',
          source: id,
          paint: {
            'fill-color': properties.color || '#000000',
            'fill-opacity': 0.5
          }
        };
        mapboxInstance.addLayer(layerConfig);
        layerRef.current = layerConfig;
        logger.info(`Layer ${id} added to map`, layerConfig);
      }

      // Update layer visibility
      mapboxInstance.setLayoutProperty(id, 'visibility', isVisible ? 'visible' : 'none');
      onVisibilityChange?.(isVisible);

    } catch (error) {
      logger.error(`Error setting up layer ${id}`, error);
    }

    // Cleanup on unmount
    return () => {
      if (mapboxInstance && !mapboxInstance._removed) {
        try {
          if (mapboxInstance.getLayer(id)) {
            mapboxInstance.removeLayer(id);
          }
          if (mapboxInstance.getSource(id)) {
            mapboxInstance.removeSource(id);
          }
          logger.info(`Layer ${id} removed from map`);
        } catch (error) {
          logger.warn(`Error cleaning up layer ${id}`, error);
        }
      }
    };
  }, [id, data, isVisible, mapboxInstance]);

  if (loading) {
    return <Skeleton className="h-12 w-full" />;
  }

  return (
    <div className={cn('flex items-center justify-between p-2 border rounded-md', className)}>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setVisibility(!isVisible)}
          title={isVisible ? 'Hide layer' : 'Show layer'}
        >
          {isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </Button>
        <div className="flex flex-col">
          <span className="text-sm font-medium">{name}</span>
          <span className="text-xs text-muted-foreground">{type}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {setupStatus === 'error' && (
          <AlertCircle className="h-4 w-4 text-destructive" aria-label={error} />
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (!mapboxInstance || !layerRef.current) return;
            
            try {
              const bounds = mapboxInstance.getBounds();
              if (bounds) {
                mapboxInstance.fitBounds(bounds, {
                  padding: 50,
                  animate: true
                });
                logger.info(`Zoomed to layer ${id} bounds`);
              }
            } catch (error) {
              logger.warn(`Error zooming to layer ${id} bounds`, error);
            }
          }}
          aria-label="Zoom to layer"
        >
          <Maximize className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            // TODO: Open layer settings dialog
          }}
          aria-label="Layer settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}