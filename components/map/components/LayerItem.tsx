'use client';

import { LogManager } from '@/core/logging/log-manager';
import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Settings, AlertCircle, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLayer } from '@/store/layers/hooks';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useLayerData } from '../hooks/useLayerData';
import { useLayerZoom } from '../hooks/useLayerZoom';
import { Skeleton } from '@/components/ui/skeleton';
import * as mapboxgl from 'mapbox-gl';
import { LayerSettingsDialog } from './LayerSettingsDialog';

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

export interface LayerItemLayer {
  id: string;
  name: string;
  type: string;
  properties: Record<string, any>;
}

export interface LayerItemProps {
  layer: LayerItemLayer;
  className?: string;
}

export function LayerItem({ layer, className }: LayerItemProps) {
  const { layer: storeLayer, setVisibility, error: storeError } = useLayer(layer.id);
  const { data, loading, error: dataError } = useLayerData(layer.id);
  const mapboxInstance = useMapInstanceStore(state => state.mapInstances.mapbox.instance);
  const { zoomToLayer } = useLayerZoom();
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  const handleZoomToLayer = () => {
    zoomToLayer(layer.id);
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
    <div className={cn('p-2 border rounded-lg bg-background flex items-center gap-2 w-full', className)}>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleVisibilityToggle}
        disabled={!!error}
        title={storeLayer?.visible ? 'Hide layer' : 'Show layer'}
        className="h-6 w-6 shrink-0"
      >
        {storeLayer?.visible ? (
          <Eye className="h-3 w-3" />
        ) : (
          <EyeOff className="h-3 w-3" />
        )}
      </Button>

      <div className="flex-1 min-w-0">
        <h4 className="text-xs font-medium truncate">{layer.name}</h4>
        <p className="text-[10px] text-muted-foreground truncate">
          {data?.features?.length || 0} features
        </p>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={handleZoomToLayer}
        disabled={!!error || !storeLayer?.visible}
        title="Zoom to layer"
        className="h-6 w-6 shrink-0"
      >
        <Maximize2 className="h-3 w-3" />
      </Button>

      {error ? (
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive h-6 w-6 shrink-0"
          title={error instanceof Error ? error.message : 'Layer error'}
        >
          <AlertCircle className="h-3 w-3" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          title="Layer settings"
          onClick={() => setSettingsOpen(true)}
          className="h-6 w-6 shrink-0"
        >
          <Settings className="h-3 w-3" />
        </Button>
      )}

      <LayerSettingsDialog
        layerId={layer.id}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  );
}