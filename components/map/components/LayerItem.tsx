'use client';

import { LogManager } from '@/core/logging/log-manager';
import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Settings, AlertCircle, Maximize2, ArrowUpNarrowWide } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLayer } from '@/store/layers/hooks';
import { useLayerData } from '../hooks/useLayerData';
import { Skeleton } from '@/components/ui/skeleton';
import { LayerSettingsDialog } from './LayerSettingsDialog';
import bbox from '@turf/bbox';
import * as Cesium from 'cesium';
import { useCesiumInstance } from '@/store/map/hooks';
import { LogLevel } from '@/core/logging/log-manager';

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
  console.log('LAYER_ITEM_RENDERED_DEBUG');
  const { layer: storeLayer, setVisibility, error: storeError } = useLayer(layer.id);
  const { data, loading, error: dataError } = useLayerData(layer.id);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [heightSettingsOpen, setHeightSettingsOpen] = useState(false);
  const cesiumInstance = useCesiumInstance();

  useEffect(() => {
    logger.info('LayerItem state', {
      layerId: layer.id,
      storeLayer,
      data,
      loading,
      error: storeError || dataError
    });
  }, [layer.id, storeLayer, data, loading, storeError, dataError]);

  useEffect(() => {
    logManager.setComponentLogLevel(SOURCE, LogLevel.DEBUG);
    return () => {
      logManager.setComponentLogLevel(SOURCE, LogLevel.WARN); // Reset after unmount
    };
  }, []);

  const handleVisibilityToggle = () => {
    const newVisibility = !storeLayer?.visible;
    setVisibility(newVisibility);
  };

  const handleZoomToFeature = async () => {
    logger.info('Zoom to feature clicked', { layerId: layer.id });
    if (!cesiumInstance?.instance) {
      logger.error('Cesium instance not available');
      return;
    }
    if (!data?.features?.length) {
      logger.warn('No features available to zoom to', { layerId: layer.id });
      return;
    }
    try {
      // Compute bbox for all features in the layer
      const featureCollection: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: data.features
      };
      const bounds = bbox(featureCollection) as [number, number, number, number];
      logger.debug('Computed bbox for layer', { layerId: layer.id, bounds });
      // Convert bbox to Cesium rectangle
      const rectangle = Cesium.Rectangle.fromDegrees(bounds[0], bounds[1], bounds[2], bounds[3]);
      logger.debug('Converted bbox to Cesium rectangle', { rectangle });
      // Fly to the rectangle
      await cesiumInstance.instance.camera.flyTo({
        destination: rectangle,
        duration: 2,
        complete: () => logger.info('Camera flyTo complete', { layerId: layer.id }),
        cancel: () => logger.warn('Camera flyTo cancelled', { layerId: layer.id })
      });
    } catch (error) {
      logger.error('Failed to zoom to feature', { layerId: layer.id, error });
    }
  };

  // Determine if the layer has untransformed heights
  const hasUntransformedHeights = !!data?.features?.some(
    (f) => f.properties?.height_mode === 'lv95_stored'
  );

  // Tooltip text for the height icon
  const heightTooltip = hasUntransformedHeights
    ? 'Warning: This layer contains height values that are not ellipsoidal. 3D display may be incorrect. Please run the Swiss Height Transformation.'
    : 'All height values are ellipsoidal. 3D display is correct.';

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
        <h4
          className="layer-name text-xs font-medium truncate"
          style={{
            maxWidth: '120px', // Adjust as needed for your icon width
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: 'inline-block',
            verticalAlign: 'middle',
          }}
          title={layer.name}
        >
          {layer.name}
        </h4>
        <p className="text-[10px] text-muted-foreground truncate">
          {data?.features?.length || 0} features
        </p>
      </div>

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
        <>
          <Button
            variant="ghost"
            size="icon"
            title="Zoom to feature"
            onClick={handleZoomToFeature}
            className="h-6 w-6 shrink-0"
          >
            <Maximize2 className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Layer settings"
            onClick={() => setSettingsOpen(true)}
            className="h-6 w-6 shrink-0"
          >
            <Settings className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={heightTooltip}
            onClick={() => setHeightSettingsOpen(true)}
            className="h-6 w-6 shrink-0"
            style={{ color: hasUntransformedHeights ? '#e53935' : '#888' }}
            aria-label="Height settings"
          >
            <ArrowUpNarrowWide className="h-3 w-3" />
          </Button>
        </>
      )}

      <LayerSettingsDialog
        layerId={layer.id}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
      <LayerSettingsDialog
        layerId={layer.id}
        open={heightSettingsOpen}
        onOpenChange={setHeightSettingsOpen}
        initialTab="3d"
      />
    </div>
  );
}