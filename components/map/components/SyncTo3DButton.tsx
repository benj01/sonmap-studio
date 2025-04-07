'use client';

import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useSyncTo3D } from '../hooks/useSyncTo3D';
import { useCesium } from '../context/CesiumContext';
import { useLayers } from '@/store/layers/hooks';
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
  const cesiumInstance = useMapInstanceStore(state => state.mapInstances.cesium.instance);
  const cesiumStatus = useMapInstanceStore(state => state.mapInstances.cesium.status);
  const { layers } = useLayers();
  const { syncTo3D, isLoading } = useSyncTo3D();

  // Check if all layers are ready
  const areLayersReady = useCallback(() => {
    if (!layers.length) {
      logger.debug('No layers available');
      return false;
    }

    // Check if all layers have their required data
    const allReady = layers.every(layer => {
      // For vector layers, check both setup status and GeoJSON data
      if (layer.metadata?.type === 'vector') {
        const isReady = layer.setupStatus === 'complete' && !!layer.metadata?.properties?.geojson;
        
        if (!isReady) {
          logger.debug('Vector layer not ready', { 
            layerId: layer.id, 
            name: layer.metadata?.name,
            setupStatus: layer.setupStatus,
            hasGeoJson: !!layer.metadata?.properties?.geojson
          });
        }
        return isReady;
      }

      // For other layer types, just check setup status
      const isReady = layer.setupStatus === 'complete';
      
      if (!isReady) {
        logger.debug('Layer not ready', { 
          layerId: layer.id, 
          name: layer.metadata?.name,
          type: layer.metadata?.type,
          setupStatus: layer.setupStatus
        });
      }
      return isReady;
    });

    logger.debug('Layer readiness check', {
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
  }, [layers]);

  // Check if all map instances are ready
  const isMapReady = useCallback(() => {
    const isReady = !!mapboxInstance && !!cesiumInstance && cesiumStatus === 'ready';
    
    logger.debug('Map readiness check', {
      hasMapbox: !!mapboxInstance,
      hasCesium: !!cesiumInstance,
      cesiumStatus,
      isReady
    });
    
    return isReady;
  }, [mapboxInstance, cesiumInstance, cesiumStatus]);

  const handleSync = useCallback(async () => {
    if (!isMapReady() || !areLayersReady()) {
      logger.warn('Cannot sync: Not all prerequisites are ready', {
        isMapReady: isMapReady(),
        areLayersReady: areLayersReady()
      });
      return;
    }

    try {
      logger.info('Starting sync to 3D');
      await syncTo3D({ syncView: true, syncLayers: true });
      logger.info('Successfully synced to 3D view');
    } catch (error) {
      logger.error('Failed to sync to 3D view', error);
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