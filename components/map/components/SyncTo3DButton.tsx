'use client';

import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useSyncTo3D } from '../hooks/useSyncTo3D';
import { useLayers } from '@/store/layers/hooks';
import { dbLogger } from '@/utils/logging/dbLogger';

const SOURCE = 'SyncTo3DButton';

export function SyncTo3DButton() {
  const cesiumInstance = useMapInstanceStore(state => state.mapInstances.cesium.instance);
  const cesiumStatus = useMapInstanceStore(state => state.mapInstances.cesium.status);
  const { layers } = useLayers();
  const { syncTo3D, isLoading } = useSyncTo3D();

  // Check if all layers are ready
  const areLayersReady = useCallback(() => {
    (async () => {
      if (!layers.length) {
        await dbLogger.debug(SOURCE, 'No layers available', {});
        return false;
      }

      // Check if all layers have their required data
      const allReady = layers.every(layer => {
        // For vector layers, check both setup status and GeoJSON data
        if (layer.metadata?.type === 'vector') {
          const isReady = layer.setupStatus === 'complete' && !!layer.metadata?.properties?.geojson;
          
          if (!isReady) {
            (async () => {
              await dbLogger.debug(SOURCE, 'Vector layer not ready', {
                layerId: layer.id,
                name: layer.metadata?.name,
                setupStatus: layer.setupStatus,
                hasGeoJson: !!layer.metadata?.properties?.geojson
              });
            })();
          }
          return isReady;
        }

        // For other layer types, just check setup status
        const isReady = layer.setupStatus === 'complete';
        
        if (!isReady) {
          (async () => {
            await dbLogger.debug(SOURCE, 'Layer not ready', {
              layerId: layer.id,
              name: layer.metadata?.name,
              type: layer.metadata?.type,
              setupStatus: layer.setupStatus
            });
          })();
        }
        return isReady;
      });
      await dbLogger.debug(SOURCE, 'Layer readiness check', {
        totalLayers: layers.length,
        allReady,
        layerDetails: layers.map(layer => ({
          id: layer.id,
          name: layer.metadata?.name,
          type: layer.metadata?.type,
          setupStatus: layer.setupStatus,
          hasGeoJson: layer.metadata?.type === 'vector' ? !!layer.metadata?.properties?.geojson : 'N/A'
        }))
      });
      return allReady;
    })();
    // Synchronous return for button state
    return layers.length > 0 && layers.every(layer => {
      if (layer.metadata?.type === 'vector') {
        return layer.setupStatus === 'complete' && !!layer.metadata?.properties?.geojson;
      }
      return layer.setupStatus === 'complete';
    });
  }, [layers]);

  // Check if all map instances are ready
  const isMapReady = useCallback(() => {
    (async () => {
      const isReady = !!cesiumInstance && cesiumStatus === 'ready';
      await dbLogger.debug(SOURCE, 'Map readiness check', {
        hasCesium: !!cesiumInstance,
        cesiumStatus,
        isReady
      });
    })();
    // Synchronous return for button state
    return !!cesiumInstance && cesiumStatus === 'ready';
  }, [cesiumInstance, cesiumStatus]);

  const handleSync = useCallback(async () => {
    if (!isMapReady() || !areLayersReady()) {
      await dbLogger.warn(SOURCE, 'Cannot sync: Not all prerequisites are ready', {
        isMapReady: isMapReady(),
        areLayersReady: areLayersReady()
      });
      return;
    }

    try {
      await dbLogger.info(SOURCE, 'Starting sync to 3D', {});
      await syncTo3D({ syncView: true, syncLayers: true });
      await dbLogger.info(SOURCE, 'Successfully synced to 3D view', {});
    } catch (error) {
      await dbLogger.error(SOURCE, 'Failed to sync to 3D view', { error });
    }
  }, [syncTo3D, isMapReady, areLayersReady]);

  const isButtonDisabled = isLoading || !isMapReady() || !areLayersReady();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSync}
      disabled={isButtonDisabled}
      className="flex items-center gap-2"
    >
      {isLoading ? (
        <>
          <span className="animate-spin">⟳</span>
          <span>Syncing...</span>
        </>
      ) : (
        <>
          <span>Sync to 3D</span>
          {isButtonDisabled && !isLoading && (
            <span className="text-xs text-muted-foreground">
              (Waiting for map and layers to be ready)
            </span>
          )}
        </>
      )}
    </Button>
  );
} 