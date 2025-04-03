'use client';

import { useEffect, useState, useCallback } from 'react';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useCesium } from '../context/CesiumContext';
import { useLayers } from '@/store/layers/hooks';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'StatusMonitor';
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

interface LayerStatus {
  ready2D: boolean;
  ready3D: boolean;
}

interface Status {
  layerStatuses: Record<string, LayerStatus>;
  ready2DCount: number;
  ready3DCount: number;
}

export function StatusMonitor() {
  const { layers } = useLayers();
  const { viewer, isInitialized } = useCesium();
  const mapboxInstance = useMapInstanceStore(state => state.mapInstances.mapbox.instance);
  const [status, setStatus] = useState<Status>({
    layerStatuses: {},
    ready2DCount: 0,
    ready3DCount: 0
  });

  const checkMapStatus = useCallback(() => {
    const mapboxReady = !!mapboxInstance;
    const cesiumReady = !!viewer && isInitialized;

    logger.debug('Map status check', {
      hasMapbox: !!mapboxInstance,
      hasCesium: !!viewer,
      cesiumInitialized: isInitialized
    });

    return { mapboxReady, cesiumReady };
  }, [mapboxInstance, viewer, isInitialized]);

  const checkLayerStatus = useCallback(() => {
    let hasChanges = false;
    const newStatuses: Record<string, LayerStatus> = {};
    let ready2D = 0;
    let ready3D = 0;

    for (const layer of layers) {
      const ready2DStatus = layer.setupStatus === 'complete';
      let ready3DStatus = false;

      if (layer.setupStatus === 'complete' && viewer) {
        // Check each collection using proper Cesium methods
        const type = layer.metadata?.type;
        if (type === 'vector') {
          // Check dataSources
          for (let i = 0; i < viewer.dataSources.length; i++) {
            const ds = viewer.dataSources.get(i);
            if (ds.name === layer.id) {
              ready3DStatus = true;
              break;
            }
          }
        } else if (type === '3d-tiles') {
          // Check primitives
          for (let i = 0; i < viewer.scene.primitives.length; i++) {
            const primitive = viewer.scene.primitives.get(i);
            if (primitive.name === layer.id) {
              ready3DStatus = true;
              break;
            }
          }
        } else if (type === 'imagery') {
          // For imagery layers, check if any exist
          ready3DStatus = viewer.imageryLayers.length > 0;
        }
      }

      if (ready2DStatus) ready2D++;
      if (ready3DStatus) ready3D++;

      newStatuses[layer.id] = {
        ready2D: ready2DStatus,
        ready3D: ready3DStatus
      };

      const currentStatus = status.layerStatuses[layer.id];
      if (!currentStatus || 
          currentStatus.ready2D !== ready2DStatus || 
          currentStatus.ready3D !== ready3DStatus) {
        hasChanges = true;
      }
    }

    if (hasChanges || ready2D !== status.ready2DCount || ready3D !== status.ready3DCount) {
      setStatus({
        layerStatuses: newStatuses,
        ready2DCount: ready2D,
        ready3DCount: ready3D
      });
    }
  }, [layers, viewer, status]);

  useEffect(() => {
    const interval = setInterval(() => {
      checkLayerStatus();
    }, 1000);

    return () => clearInterval(interval);
  }, [checkLayerStatus]);

  const { mapboxReady, cesiumReady } = checkMapStatus();

  const getStatusColor = (isReady: boolean) => 
    isReady ? 'text-green-500' : 'text-yellow-500';

  const getStatusIcon = (isReady: boolean) =>
    isReady ? '✓' : '⋯';

  return (
    <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md text-sm space-y-2 max-w-md">
      <h3 className="font-semibold mb-2">System Status</h3>
      
      <div className="space-y-1">
        <div className="flex justify-between">
          <span>2D Map (Mapbox)</span>
          <span className={getStatusColor(mapboxReady)}>
            {getStatusIcon(mapboxReady)} {mapboxReady ? 'Ready' : 'Initializing'}
          </span>
        </div>

        <div className="flex justify-between">
          <span>3D Map (Cesium)</span>
          <span className={getStatusColor(cesiumReady)}>
            {getStatusIcon(cesiumReady)} {
              !viewer ? 'Not initialized' :
              !isInitialized ? 'Initializing' :
              'Ready'
            }
          </span>
        </div>

        <div className="mt-2">
          <div className="font-medium mb-1">
            Layers ({layers.length}) - Ready: {status.ready2DCount} in 2D, {status.ready3DCount} in 3D
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {layers.map(layer => {
              const layerStatus = status.layerStatuses[layer.id] || { ready2D: false, ready3D: false };
              return (
                <div key={layer.id} className="flex justify-between text-xs">
                  <span className="truncate" title={layer.metadata?.name}>
                    {layer.metadata?.name} ({layer.setupStatus})
                  </span>
                  <div className="flex gap-2">
                    <span className={getStatusColor(layerStatus.ready2D)} title="2D Status">
                      2D: {getStatusIcon(layerStatus.ready2D)}
                    </span>
                    <span className={getStatusColor(layerStatus.ready3D)} title="3D Status">
                      3D: {getStatusIcon(layerStatus.ready3D)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="text-xs text-gray-500 mt-2">
        Status updates every second
      </div>
    </div>
  );
} 