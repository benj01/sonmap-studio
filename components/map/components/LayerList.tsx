'use client';

import { dbLogger } from '@/utils/logging/dbLogger';
import { useLayers } from '@/store/layers/hooks';
import { LayerItem } from './LayerItem';
import { Skeleton } from '@/components/ui/skeleton';
import type { Layer as StoreLayer } from '@/store/layers/types';
import { useEffect } from 'react';
import { summarizeFeaturesForLogging } from '../utils/logging';

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
          visible: l.visible,
          setupStatus: l.setupStatus,
          metadataSummary: (() => {
            const geojson = l.metadata?.properties?.geojson;
            if (
              geojson &&
              typeof geojson === 'object' &&
              'features' in geojson &&
              Array.isArray((geojson as any).features)
            ) {
              return summarizeFeaturesForLogging((geojson as any).features, 'info');
            }
            return undefined;
          })(),
        })),
      }, { source: 'LayerList' });
    }
    logHookData().catch(() => {});
  }, [layers]);

  useEffect(() => {
    async function logRender() {
      await dbLogger.info('LayerList render', {
        layerCount: layers.length,
        isLoading,
        hasLayers: layers.length > 0,
        layersWithMetadata: layers.filter((l: StoreLayer) => l.metadata).length,
      }, { source: 'LayerList' });
    }
    logRender().catch(() => {});
  }, [layers, isLoading]);

  useEffect(() => {
    async function logLoading() {
      if (isLoading) {
        await dbLogger.debug('LayerList is loading, rendering skeletons', { }, { source: 'LayerList' });
      }
    }
    logLoading().catch(() => {});
  }, [isLoading]);

  useEffect(() => {
    async function logNoLayers() {
      if (!isLoading && layers.length === 0) {
        await dbLogger.debug('LayerList: No layers available', { }, { source: 'LayerList' });
      }
    }
    logNoLayers().catch(() => {});
  }, [isLoading, layers]);

  useEffect(() => {
    async function logRenderError() {
      if (renderError !== null) {
        await dbLogger.error('LayerList: Error rendering layers', { error: renderError }, { source: 'LayerList' });
      }
    }
    logRenderError().catch(() => {});
  }, [renderError]);

  useEffect(() => {
    async function logRenderEnd() {
      await dbLogger.debug('LayerList render end', {
        renderedCount,
        renderError,
      }, { source: 'LayerList' });
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