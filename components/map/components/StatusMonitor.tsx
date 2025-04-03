'use client';

import { useEffect, useState } from 'react';
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

export function StatusMonitor() {
  const mapboxInstance = useMapInstanceStore(state => state.mapInstances.mapbox.instance);
  const { viewer, isInitialized: isCesiumInitialized } = useCesium();
  const { layers } = useLayers();
  const [layerStatus, setLayerStatus] = useState<Record<string, LayerStatus>>({});

  // Check layer readiness
  useEffect(() => {
    const checkLayerStatus = () => {
      const status: Record<string, LayerStatus> = {};
      
      layers.forEach(layer => {
        // Check 2D readiness - a layer is ready in 2D if it's been added to the map
        const ready2D = layer.setupStatus === 'complete';

        // Check 3D readiness - for now, we'll consider it ready if it's ready in 2D
        // This will need to be updated when we implement proper 3D layer handling
        const ready3D = layer.setupStatus === 'complete';

        status[layer.id] = { ready2D, ready3D };

        logger.debug('Layer status check', {
          layerId: layer.id,
          layerName: layer.metadata?.name,
          setupStatus: layer.setupStatus,
          ready2D,
          ready3D
        });
      });

      setLayerStatus(status);
    };

    checkLayerStatus();
    // Check status every second
    const interval = setInterval(checkLayerStatus, 1000);
    return () => clearInterval(interval);
  }, [layers]);

  const getStatusColor = (isReady: boolean) => 
    isReady ? 'text-green-500' : 'text-yellow-500';

  const getStatusIcon = (isReady: boolean) =>
    isReady ? '✓' : '⋯';

  // Count ready layers
  const readyCount2D = Object.values(layerStatus).filter(status => status.ready2D).length;
  const readyCount3D = Object.values(layerStatus).filter(status => status.ready3D).length;

  return (
    <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md text-sm space-y-2 max-w-md">
      <h3 className="font-semibold mb-2">System Status</h3>
      
      <div className="space-y-1">
        <div className="flex justify-between">
          <span>2D Map (Mapbox)</span>
          <span className={getStatusColor(!!mapboxInstance)}>
            {getStatusIcon(!!mapboxInstance)} {!!mapboxInstance ? 'Ready' : 'Initializing'}
          </span>
        </div>

        <div className="flex justify-between">
          <span>3D Map (Cesium)</span>
          <span className={getStatusColor(!!viewer && isCesiumInitialized)}>
            {getStatusIcon(!!viewer && isCesiumInitialized)} {
              !viewer ? 'Not initialized' :
              !isCesiumInitialized ? 'Initializing' :
              'Ready'
            }
          </span>
        </div>

        <div className="mt-2">
          <div className="font-medium mb-1">
            Layers ({layers.length}) - Ready: {readyCount2D} in 2D, {readyCount3D} in 3D
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {layers.map(layer => {
              const status = layerStatus[layer.id] || { ready2D: false, ready3D: false };
              return (
                <div key={layer.id} className="flex justify-between text-xs">
                  <span className="truncate" title={layer.metadata?.name}>
                    {layer.metadata?.name} ({layer.setupStatus})
                  </span>
                  <div className="flex gap-2">
                    <span className={getStatusColor(status.ready2D)} title="2D Status">
                      2D: {getStatusIcon(status.ready2D)}
                    </span>
                    <span className={getStatusColor(status.ready3D)} title="3D Status">
                      3D: {getStatusIcon(status.ready3D)}
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