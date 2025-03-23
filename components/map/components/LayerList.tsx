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

  useEffect(() => {
    // Simulate loading state
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

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
            onVisibilityChange={(visible) => {
              logger.debug(`Layer ${layer.id} visibility changed to ${visible}`);
            }}
          />
        );
      })}
    </div>
  );
} 