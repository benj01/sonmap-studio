'use client';

import { LogManager } from '@/core/logging/log-manager';
import { useEffect, useState } from 'react';
import createClient from '@/utils/supabase/client';
import { Database } from '@/types/supabase';
import { LayerItem } from './LayerItem';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';
import { useMapStore } from '@/store/mapStore';

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

interface LayerListProps {
  projectId?: string;
  defaultVisibility?: boolean;
}

export function LayerList({ projectId, defaultVisibility = true }: LayerListProps) {
  const { layers, addLayer, setLayerVisibility } = useMapStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const supabase = createClient();

  useEffect(() => {
    logger.debug('Initializing layer list');

    async function fetchLayers() {
      try {
        logger.debug('Fetching project layers', { projectId });
        const { data, error: layersError } = await supabase
          .from('layers')
          .select(`
            id,
            name,
            type,
            properties,
            collection_id,
            feature_collections!inner (
              id,
              name,
              project_file_id,
              project_files!inner (
                id,
                project_id
              )
            )
          `)
          .eq('feature_collections.project_files.project_id', projectId);

        if (layersError) {
          logger.error('Failed to fetch layers', { error: layersError });
          throw layersError;
        }

        logger.info('Layers loaded', { count: data?.length || 0 });
        
        // Add fetched layers to the store with default visibility
        data?.forEach(layer => {
          addLayer(layer.id, defaultVisibility, layer.properties?.sourceId, {
            name: layer.name || `Layer ${layer.id.slice(0, 8)}`,
            type: layer.type || 'default',
            properties: layer.properties || {}
          });
        });
      } catch (err) {
        const error = err as Error;
        logger.error('Failed to fetch layers', { error });
        setError(error);
      } finally {
        setLoading(false);
      }
    }

    if (projectId) {
      fetchLayers();
    } else {
      setLoading(false);
    }
  }, [projectId, addLayer]);

  // Convert Map to array for rendering
  const layerArray = Array.from(layers.entries()).map(([id, state]) => ({
    id,
    name: state.metadata?.name || `Layer ${id.slice(0, 8)}`,
    type: state.metadata?.type || 'default',
    properties: state.metadata?.properties || {}
  }));

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-destructive space-y-2">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span className="font-medium">Error loading layers</span>
        </div>
        <p className="text-sm">{error.message}</p>
      </div>
    );
  }

  if (!layerArray.length) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No layers available
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground mb-2">
        {layerArray.length} layer{layerArray.length !== 1 ? 's' : ''} available
      </div>
      {layerArray.map(layer => (
        <LayerItem
          key={layer.id}
          layer={layer}
          onVisibilityChange={(visible) => setLayerVisibility(layer.id, visible)}
        />
      ))}
    </div>
  );
} 