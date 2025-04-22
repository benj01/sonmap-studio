'use client';

import { useEffect, useState } from 'react';
import { useLayers } from '@/store/layers/hooks';
import { LogManager, LogLevel } from '@/core/logging/log-manager';
import { LayerItem } from './LayerItem';
import { Skeleton } from '@/components/ui/skeleton';
import type { Layer as StoreLayer } from '@/store/layers/types';

const SOURCE = 'LayerList';
const logManager = LogManager.getInstance();
logManager.setComponentLogLevel(SOURCE, LogLevel.DEBUG);

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
  const { layers } = useLayers();

  logger.debug('LayerList render start', {
    layerCount: layers.length,
    layers: layers.map(l => ({
      id: l.id,
      visible: l.visible,
      setupStatus: l.setupStatus,
      metadata: l.metadata
    })),
    className
  });

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

  // Derived loading state
  const hasLayers = layers.length > 0;
  const allLayersLoaded = layers.every(l => l.setupStatus === 'complete' || l.setupStatus === 'error');
  const isLoading = !(hasLayers && allLayersLoaded);

  logger.info('LayerList render', {
    layerCount: layers.length,
    isLoading,
    hasLayers: layers.length > 0,
    layersWithMetadata: layers.filter(l => l.metadata).length
  });

  if (isLoading) {
    logger.debug('LayerList is loading, rendering skeletons');
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (layers.length === 0) {
    logger.debug('LayerList: No layers available');
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        No layers available
      </div>
    );
  }

  let renderedCount = 0;
  let renderError = null;
  let children = null;
  try {
    children = layers.map((layer: StoreLayer) => {
      if (!layer.metadata) return null;
      renderedCount++;
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
    });
  } catch (err) {
    renderError = err;
    logger.error('LayerList: Error rendering layers', { error: err });
  }

  logger.debug('LayerList render end', {
    renderedCount,
    renderError
  });

  return (
    <div className="space-y-2">
      {children}
    </div>
  );
} 