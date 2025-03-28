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
}

export function LayerItem({ layer, className }: LayerItemProps) {
  const { layer: storeLayer, setVisibility, error: storeError } = useLayer(layer.id);
  const { data, loading, error: dataError } = useLayerData(layer.id);
  const mapboxInstance = useMapInstanceStore(state => state.mapInstances.mapbox.instance);

  useEffect(() => {
    logger.info('LayerItem state', {
      layerId: layer.id,
      storeLayer,
      data,
      loading,
      error: storeError || dataError
    });
  }, [layer.id, storeLayer, data, loading, storeError, dataError]);

  const handleVisibilityToggle = () => {
    if (!mapboxInstance) return;

    const newVisibility = !storeLayer?.visible;
    setVisibility(newVisibility);

    try {
      if (mapboxInstance.getLayer(layer.id)) {
        mapboxInstance.setLayoutProperty(
          layer.id,
          'visibility',
          newVisibility ? 'visible' : 'none'
        );
      }
    } catch (err) {
      logger.error('Error toggling layer visibility', { error: err });
    }
  };

  if (loading) {
    return (
      <div className={cn('p-4 border rounded-lg bg-background', className)}>
        <Skeleton className="h-6 w-full" />
      </div>
    );
  }

  const error = storeError || dataError;

  return (
    <div className={cn('p-4 border rounded-lg bg-background flex items-center gap-4', className)}>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleVisibilityToggle}
        disabled={!!error}
        title={storeLayer?.visible ? 'Hide layer' : 'Show layer'}
      >
        {storeLayer?.visible ? (
          <Eye className="h-4 w-4" />
        ) : (
          <EyeOff className="h-4 w-4" />
        )}
      </Button>

      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium truncate">{layer.name}</h4>
        <p className="text-xs text-muted-foreground truncate">
          {data?.features?.length || 0} features
        </p>
      </div>

      {error ? (
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive"
          title={error instanceof Error ? error.message : 'Layer error'}
        >
          <AlertCircle className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          title="Layer settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}