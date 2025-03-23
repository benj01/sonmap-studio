'use client';

import { Button } from '@/components/ui/button';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useViewStateStore } from '@/store/view/viewStateStore';
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
  const mapboxInstance = useMapInstanceStore(state => state.mapInstances.mapbox.instance);
  const { setViewState3D } = useViewStateStore();

  const handleSync = () => {
    if (!mapboxInstance) {
      logger.warn('Cannot sync to 3D view: Mapbox instance not available');
      return;
    }

    try {
      const center = mapboxInstance.getCenter();
      const zoom = mapboxInstance.getZoom();

      // Convert zoom level to height (rough approximation)
      const height = Math.pow(2, 20 - zoom) * 1000;

      setViewState3D({
        latitude: center.lat,
        longitude: center.lng,
        height
      });

      logger.info('Synced 2D view to 3D', {
        latitude: center.lat,
        longitude: center.lng,
        height
      });
    } catch (error) {
      logger.error('Error syncing to 3D view', error);
    }
  };

  return (
    <Button
      variant="outline"
      onClick={handleSync}
      disabled={!mapboxInstance}
    >
      Sync to 3D
    </Button>
  );
} 