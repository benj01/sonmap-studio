'use client';

import { useEffect, useState } from 'react';
import { useLayers } from '@/store/layers/hooks';
import { LogManager } from '@/core/logging/log-manager';
import { LayerItem } from './LayerItem';
import { Skeleton } from '@/components/ui/skeleton';
import type { Layer as StoreLayer } from '@/store/layers/types';

const SOURCE = 'LayerList';
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

interface LayerItemLayer {
  id: string;
  name: string;
  type: string;
  properties: Record<string, any>;
}

interface LayerListProps {
  className?: string;
}

export function LayerList({ className }: LayerListProps) {
  const { layers, visibleLayers } = useLayers();
  const [isLoading, setIsLoading] = useState(true);

  logger.info('LayerList hook data', {
    layerCount: layers.length,
    layers: layers.map(l => ({
      id: l.id,
      hasMetadata: !!l.metadata,
      metadata: l.metadata,
      visible: l.visible,
      setupStatus: l.setupStatus
    }))
  });

  useEffect(() => {
    logger.info('LayerList state', {
      layerCount: layers.length,
      layers: layers.map(l => ({
        id: l.id,
        name: l.metadata?.name,
        visible: l.visible,
        setupStatus: l.setupStatus,
        metadata: l.metadata
      }))
    });

    // Update loading state based on layer status
    const hasLayers = layers.length > 0;
    const allLayersLoaded = layers.every(l => l.setupStatus === 'complete' || l.setupStatus === 'error');
    
    logger.info('LayerList loading state', {
      hasLayers,
      allLayersLoaded,
      isLoading,
      layerStatuses: layers.map(l => ({
        id: l.id,
        status: l.setupStatus
      }))
    });

    // Only update loading state if it would actually change
    if (hasLayers && allLayersLoaded && isLoading) {
      setIsLoading(false);
    } else if ((!hasLayers || !allLayersLoaded) && !isLoading) {
      setIsLoading(true);
    }
  }, [layers]); // Remove isLoading from dependencies since we check it inside

  logger.info('LayerList render', {
    layerCount: layers.length,
    isLoading,
    hasLayers: layers.length > 0,
    layersWithMetadata: layers.filter(l => l.metadata).length
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (layers.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        No layers available
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {layers.map((layer: StoreLayer) => {
        if (!layer.metadata) return null;

        const layerItemLayer: LayerItemLayer = {
          id: layer.id,
          name: layer.metadata.name,
          type: layer.metadata.type,
          properties: layer.metadata.properties
        };

        return (
          <LayerItem
            key={layer.id}
            layer={layerItemLayer}
            className={className}
          />
        );
      })}
    </div>
  );
} 