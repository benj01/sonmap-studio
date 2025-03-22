'use client';

import { LogManager } from '@/core/logging/log-manager';
import { useEffect, useState, useCallback, useRef } from 'react';
import createClient from '@/utils/supabase/client';
import { Database } from '@/types/supabase';
import { LayerItem } from './LayerItem';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';
import { useMapStore } from '@/store/mapStore';
import { useFileEventStore } from '@/store/fileEventStore';

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

interface Layer {
  id: string;
  name: string;
  type: string;
  properties: Record<string, any>;
}

interface LayerListProps {
  projectId: string;
  defaultVisibility?: boolean;
}

export function LayerList({ projectId, defaultVisibility = true }: LayerListProps) {
  const { addLayer, setLayerVisibility, removeLayer } = useMapStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [layerItems, setLayerItems] = useState<Layer[]>([]);
  const supabase = createClient();
  const lastFileEvent = useFileEventStore(state => state.lastEvent);
  const isMounted = useRef(true);
  const fetchingRef = useRef(false);
  const currentLayersRef = useRef<Layer[]>([]);

  // Cleanup function
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchLayers = useCallback(async () => {
    if (!isMounted.current || fetchingRef.current) return;
    fetchingRef.current = true;
    
    try {
      setLoading(true);
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
      
      // Process layers in batches to avoid overwhelming the map
      const newLayerItems: Layer[] = [];
      const batchSize = 5;
      
      // First, remove all existing layers
      const existingLayers = currentLayersRef.current.map(item => item.id);
      existingLayers.forEach(layerId => {
        removeLayer(layerId);
      });
      
      // Process new layers in batches
      for (let i = 0; i < (data?.length || 0); i += batchSize) {
        const batch = data?.slice(i, i + batchSize) || [];
        
        for (const layer of batch) {
          const layerId = `layer-${layer.id}`;
          
          const layerItem: Layer = {
            id: layerId,
            name: layer.name || `Layer ${layer.id.slice(0, 8)}`,
            type: layer.type || 'default',
            properties: layer.properties || {}
          };
          newLayerItems.push(layerItem);
          
          addLayer(layerId, defaultVisibility, layer.properties?.sourceId, {
            name: layerItem.name,
            type: layerItem.type,
            properties: layerItem.properties,
            fileId: layer.feature_collections?.[0]?.project_file_id
          });
        }
        
        // Small delay between batches to allow the map to process
        if (i + batchSize < (data?.length || 0)) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Update state and ref if component is still mounted
      if (isMounted.current) {
        currentLayersRef.current = newLayerItems;
        setLayerItems(newLayerItems);
      }
    } catch (err) {
      const error = err as Error;
      logger.error('Failed to fetch layers', { error });
      if (isMounted.current) {
        setError(error);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
      fetchingRef.current = false;
    }
  }, [projectId, addLayer, removeLayer, defaultVisibility]);

  useEffect(() => {
    if (projectId) {
      fetchLayers();
    } else {
      setLoading(false);
    }
  }, [projectId, fetchLayers]);

  // Refresh layers when files are deleted
  useEffect(() => {
    if (lastFileEvent?.type === 'delete' && projectId) {
      logger.debug('File deleted, refreshing layers', { fileId: lastFileEvent.fileId });
      fetchLayers();
    }
  }, [lastFileEvent, projectId, fetchLayers]);

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

  if (!layerItems.length) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No layers available
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground mb-2">
        {layerItems.length} layer{layerItems.length !== 1 ? 's' : ''} available
      </div>
      {layerItems.map(layer => (
        <LayerItem
          key={layer.id}
          layer={layer}
          onVisibilityChange={(visible) => setLayerVisibility(layer.id, visible)}
        />
      ))}
    </div>
  );
} 