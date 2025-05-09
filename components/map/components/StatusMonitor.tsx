'use client';

import { useEffect, useState, useCallback } from 'react';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useLayers } from '@/store/layers/hooks';
import { dbLogger } from '@/utils/logging/dbLogger';

const SOURCE = 'StatusMonitor';

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
  const cesiumInstance = useMapInstanceStore((state) => state.mapInstances.cesium.instance);
  const cesiumStatus = useMapInstanceStore((state) => state.mapInstances.cesium.status);
  const [isExpanded, setIsExpanded] = useState(false);
  const [status, setStatus] = useState<Status>({
    layerStatuses: {},
    ready2DCount: 0,
    ready3DCount: 0
  });

  const cesiumReady = cesiumStatus === 'ready';

  useEffect(() => {
    (async () => {
      await dbLogger.debug(SOURCE, 'Map status check', {
        cesiumStatus,
        hasCesium: !!cesiumInstance
      });
    })();
  }, [cesiumStatus, cesiumInstance]);

  const checkLayerStatus = useCallback(async () => {
    let hasChanges = false;
    let ready2D = 0;
    let ready3D = 0;
    const newStatuses: Record<string, LayerStatus> = {};

    for (const layer of layers) {
      const ready2DStatus = layer.setupStatus === 'complete';
      let ready3DStatus = false;

      // For vector layers, check if they have both complete status and GeoJSON data
      if (layer.metadata?.type === 'vector') {
        ready3DStatus = layer.setupStatus === 'complete' && !!layer.metadata?.properties?.geojson;
      } else if (layer.metadata?.type === '3d-tiles') {
        // For 3D tiles, just check setup status
        ready3DStatus = layer.setupStatus === 'complete';
      } else if (layer.metadata?.type === 'imagery') {
        // For imagery, just check setup status
        ready3DStatus = layer.setupStatus === 'complete';
      }

      await dbLogger.debug(SOURCE, 'Layer status check', {
        layerId: layer.id,
        name: layer.metadata?.name,
        type: layer.metadata?.type,
        setupStatus: layer.setupStatus,
        hasGeoJson: !!layer.metadata?.properties?.geojson,
        ready2D: ready2DStatus,
        ready3D: ready3DStatus
      });

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
      await dbLogger.info(SOURCE, 'Status update', {
        ready2DCount: ready2D,
        ready3DCount: ready3D,
        layerStatuses: Object.entries(newStatuses).map(([id, status]) => ({
          id,
          ready2D: status.ready2D,
          ready3D: status.ready3D
        }))
      });

      setStatus({
        layerStatuses: newStatuses,
        ready2DCount: ready2D,
        ready3DCount: ready3D
      });
    }
  }, [layers, status.layerStatuses, status.ready2DCount, status.ready3DCount]);

  useEffect(() => {
    (async () => { await checkLayerStatus(); })();
  }, [layers, checkLayerStatus]);

  const getStatusColor = (isReady: boolean) => 
    isReady ? 'text-green-500' : 'text-yellow-500';

  const getStatusIcon = (isReady: boolean) =>
    isReady ? '✓' : '⋯';

  const getStatusText = (status: 'ready' | 'initializing' | 'error' | 'destroyed') => {
    switch (status) {
      case 'ready':
        return 'Ready';
      case 'initializing':
        return 'Initializing';
      case 'error':
        return 'Error';
      case 'destroyed':
        return 'Destroyed';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="bg-gray-100 dark:bg-gray-800 rounded-md text-sm">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 flex justify-between items-center hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
      >
        <div className="font-semibold flex items-center gap-2">
          <span>System Status</span>
          <span className={`${getStatusColor(cesiumReady)}`}>
            {getStatusIcon(cesiumReady)}
          </span>
        </div>
        <span className="text-gray-500">
          {isExpanded ? '▼' : '▶'}
        </span>
      </button>
      
      {isExpanded && (
        <div className="p-3 space-y-2 border-t dark:border-gray-700">
          <div className="space-y-1">
            <div className="flex justify-between">
              <span>3D Map (Cesium)</span>
              <span className={getStatusColor(cesiumReady)}>
                {getStatusIcon(cesiumReady)} {getStatusText(cesiumStatus)}
              </span>
            </div>

            <div className="font-medium mb-1 mt-3">
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

          <div className="text-xs text-gray-500 mt-2">
            Status updates every second
          </div>
        </div>
      )}
    </div>
  );
} 