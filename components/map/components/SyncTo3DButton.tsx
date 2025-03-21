'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useMapContext } from '../hooks/useMapContext';
import { useCesium } from '../context/CesiumContext';
import { useSyncTo3D } from '../hooks/useSyncTo3D';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'SyncTo3DButton';
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

export function SyncTo3DButton() {
  const [isSyncing, setIsSyncing] = useState(false);
  const { map } = useMapContext();
  const { viewer } = useCesium();
  const { syncTo3D } = useSyncTo3D();

  const handleSync = async () => {
    if (!map || !viewer || isSyncing) return;

    try {
      setIsSyncing(true);
      logger.info('Starting 2D to 3D synchronization');

      // Sync both view state and layers
      await syncTo3D({
        includeView: true,
        includeLayers: true
      });

      logger.info('View synchronization complete');
    } catch (error) {
      logger.error('Error during view synchronization', error);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Button
      variant="default"
      size="default"
      onClick={handleSync}
      disabled={!map || !viewer || isSyncing}
      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
      title="Synchronize selected layers and view to 3D map"
    >
      <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
      <span>Synchronize to 3D</span>
    </Button>
  );
} 