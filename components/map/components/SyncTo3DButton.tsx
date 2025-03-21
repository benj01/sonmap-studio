'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useMapStore } from '@/store/mapStore';
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
  const { mapboxInstance, cesiumInstance, viewState2D, setViewState3D } = useMapStore();

  const handleSync = async () => {
    if (!mapboxInstance || !cesiumInstance || isSyncing) return;

    try {
      setIsSyncing(true);
      logger.info('Starting 2D to 3D synchronization');

      // Get current map center and zoom
      const center = mapboxInstance.getCenter();
      const zoom = mapboxInstance.getZoom();

      // Convert to Cesium view state
      // Note: This is a simplified conversion. You might want to add more sophisticated
      // conversion logic based on your specific needs
      setViewState3D({
        latitude: center.lat,
        longitude: center.lng,
        height: Math.pow(2, 20 - zoom) // Simple height calculation based on zoom
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
      disabled={!mapboxInstance || !cesiumInstance || isSyncing}
      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
      title="Synchronize view to 3D map"
    >
      <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
      <span>Synchronize to 3D</span>
    </Button>
  );
} 