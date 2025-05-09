'use client';

import { dbLogger } from '@/utils/logging/dbLogger';
import { useLayers } from '@/store/layers/hooks';
import { LayerItem } from './LayerItem';
import { Skeleton } from '@/components/ui/skeleton';
import type { Layer as StoreLayer } from '@/store/layers/types';
import { useEffect } from 'react';

interface LayerItemLayer {
  id: string;
  name: string;
  type: string;
  properties: Record<string, unknown>;
}

interface LayerListProps {
  className?: string;
}

export function LayerList({ className }: LayerListProps) {
  const { layers } = useLayers();

  // Derived loading state
  const hasLayers = layers.length > 0;
  const allLayersLoaded = layers.every((l: StoreLayer) => l.setupStatus === 'complete' || l.setupStatus === 'error');
  const isLoading = !(hasLayers && allLayersLoaded);

  let renderedCount = 0;
  let renderError: unknown = null;
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
  }

  // Logging hooks (must be at top level)
  useEffect(() => {
    async function logHookData() {
      await dbLogger.info('LayerList hook data', {
        layerCount: layers.length,
        layers: layers.map((l: StoreLayer) => ({
          id: l.id,
          hasMetadata: !!l.metadata,
          metadata: l.metadata,
          visible: l.visible,
          setupStatus: l.setupStatus
        }))
      });
    }
    logHookData().catch(() => {});
  }, [layers]);

  useEffect(() => {
    async function logRender() {
      await dbLogger.info('LayerList render', {
        layerCount: layers.length,
        isLoading,
        hasLayers: layers.length > 0,
        layersWithMetadata: layers.filter((l: StoreLayer) => l.metadata).length
      });
    }
    logRender().catch(() => {});
  }, [layers, isLoading]);

  useEffect(() => {
    async function logLoading() {
      if (isLoading) {
        await dbLogger.debug('LayerList is loading, rendering skeletons');
      }
    }
    logLoading().catch(() => {});
  }, [isLoading]);

  useEffect(() => {
    async function logNoLayers() {
      if (!isLoading && layers.length === 0) {
        await dbLogger.debug('LayerList: No layers available');
      }
    }
    logNoLayers().catch(() => {});
  }, [isLoading, layers]);

  useEffect(() => {
    async function logRenderError() {
      if (renderError !== null) {
        await dbLogger.error('LayerList: Error rendering layers', { error: renderError });
      }
    }
    logRenderError().catch(() => {});
  }, [renderError]);

  useEffect(() => {
    async function logRenderEnd() {
      await dbLogger.debug('LayerList render end', {
        renderedCount,
        renderError
      });
    }
    logRenderEnd().catch(() => {});
  }, [renderedCount, renderError]);

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
      {children}
    </div>
  );
} 