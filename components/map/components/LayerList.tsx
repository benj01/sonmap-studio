'use client';

import { LogManager } from '@/core/logging/log-manager';
import { useEffect, useState } from 'react';
import createClient from '@/utils/supabase/client';
import { Database } from '@/types/supabase';
import { LayerItem } from './LayerItem';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';

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
  projectId: string;
}

export function LayerList({ projectId }: LayerListProps) {
  const [layers, setLayers] = useState<any[]>([]);
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
        
        setLayers(data || []);
      } catch (err) {
        const error = err as Error;
        logger.error('Failed to fetch layers', { error });
        setError(error);
      } finally {
        setLoading(false);
      }
    }

    fetchLayers();
  }, [projectId]);

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

  if (layers.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        No layers available
      </div>
    );
  }

  return (
    <div className="space-y-1 p-4">
      {layers.map((layer) => (
        <LayerItem
          key={layer.id}
          layer={layer}
        />
      ))}
    </div>
  );
} 