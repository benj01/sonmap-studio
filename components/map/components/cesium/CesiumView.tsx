'use client';

import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useViewStateStore } from '@/store/view/viewStateStore';
import { useCesium } from '../../context/CesiumContext';
import { LogManager, LogLevel } from '@/core/logging/log-manager';
import { useSyncTo3D } from '../../hooks/useSyncTo3D';
import { useLayers } from '@/store/layers/hooks';
import { useLayerStore } from '@/store/layers/layerStore';

const SOURCE = 'CesiumView';
const logManager = LogManager.getInstance();

// Configure logging for CesiumView
logManager.setComponentLogLevel(SOURCE, LogLevel.INFO);

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

export function CesiumView() {
  const cesiumContainer = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const viewerInstanceId = useRef<string | null>(null);
  const { setCesiumInstance, setCesiumStatus } = useMapInstanceStore();
  const cesiumInstance = useMapInstanceStore(state => state.mapInstances.cesium.instance);
  const cesiumStatus = useMapInstanceStore(state => state.mapInstances.cesium.status);
  const mapboxStatus = useMapInstanceStore(state => state.mapInstances.mapbox.status);
  const { viewState3D, setViewState3D } = useViewStateStore();
  const { getCesiumDefaults, getTerrainProvider } = useCesium();
  const { syncTo3D, isLoading } = useSyncTo3D();
  const { layers } = useLayers();
  const isInitialLoadComplete = useLayerStore(state => state.isInitialLoadComplete);
  const initializationAttempted = useRef(false);
  const initialSyncPerformed = useRef(false);
  const mountCount = useRef(0);

  // Effect for Viewer Initialization
  useEffect(() => {
    mountCount.current++;
    const container = cesiumContainer.current;
    
    // In development, skip first mount due to StrictMode
    if (process.env.NODE_ENV === 'development' && mountCount.current === 1) {
      logger.debug('Skipping first mount in development mode');
      return;
    }

    if (!container || initializationAttempted.current) {
      return;
    }

    initializationAttempted.current = true;
    let viewer: Cesium.Viewer | null = null;

    const initializeViewer = async () => {
      try {
        // Check if we already have a valid instance
        if (cesiumInstance && !cesiumInstance.isDestroyed()) {
          logger.debug('Valid Cesium instance already exists, skipping initialization');
          return;
        }
        
        logger.info('CesiumView: Starting initialization process');
        setCesiumStatus('initializing');
        initialSyncPerformed.current = false;

        // Generate new instance ID
        viewerInstanceId.current = `cesium-viewer-${Date.now()}`;
        logger.debug('CesiumView: Generated new viewer instance ID', { 
          instanceId: viewerInstanceId.current 
        });

        // Create terrain provider
        logger.debug('CesiumView: Creating terrain provider');
        const terrainProvider = await getTerrainProvider();
        logger.debug('CesiumView: Terrain provider created successfully');
        
        // Create viewer
        logger.info('CesiumView: Creating Cesium viewer', { 
          instanceId: viewerInstanceId.current 
        });
        viewer = new Cesium.Viewer(container, {
          terrainProvider,
          ...getCesiumDefaults()
        });
        logger.info('CesiumView: Viewer created successfully');
        viewerRef.current = viewer;

        // Set initial camera position
        logger.debug('CesiumView: Setting initial camera position', { viewState3D });
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(
            viewState3D.longitude,
            viewState3D.latitude,
            viewState3D.height
          )
        });

        // Update camera position when view state changes
        viewer.camera.changed.addEventListener(() => {
          if (!viewer) return;
          const cartographic = Cesium.Cartographic.fromCartesian(viewer.camera.position);
          const longitude = Cesium.Math.toDegrees(cartographic.longitude);
          const latitude = Cesium.Math.toDegrees(cartographic.latitude);
          const height = cartographic.height;

          setViewState3D({
            longitude,
            latitude,
            height
          });
        });

        // Wait for scene stability
        logger.info('CesiumView: Waiting for scene stability');
        await viewer.scene.requestRender();

        logger.info('CesiumView: Setting instance and status', {
          instanceId: viewerInstanceId.current
        });
        setCesiumInstance(viewer, viewerInstanceId.current);
        setCesiumStatus('ready');
        logger.info('CesiumView: Cesium viewer initialized and state updated');

      } catch (error) {
        logger.error('CesiumView: Error initializing Cesium viewer', {
          instanceId: viewerInstanceId.current,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        });
        setCesiumStatus('error', error instanceof Error ? error.message : 'Unknown error');
        initializationAttempted.current = false;
        viewerInstanceId.current = null;
      }
    };

    initializeViewer();

    return () => {
      logger.info('CesiumView: Running cleanup for Cesium viewer', {
        instanceId: viewerInstanceId.current
      });
      
      // First set status to destroyed to prevent any operations during cleanup
      setCesiumStatus('destroyed');
      
      if (viewer && !viewer.isDestroyed()) {
        try {
          viewer.destroy();
          logger.info('CesiumView: Viewer destroyed successfully', {
            instanceId: viewerInstanceId.current
          });
        } catch (error) {
          logger.error('CesiumView: Error destroying viewer', {
            instanceId: viewerInstanceId.current,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      viewerRef.current = null;
      setCesiumInstance(null);
      initializationAttempted.current = false;
      initialSyncPerformed.current = false;
      viewerInstanceId.current = null;
      
      logger.info('CesiumView: Cleanup complete');
    };
  }, []);

  // Effect for Triggering Sync based on State Changes AND Layer Data Readiness
  useEffect(() => {
    // Don't attempt sync if viewer is destroyed or destroying
    if (cesiumStatus === 'destroyed') {
      return;
    }

    const visibleLayers = layers.filter(l => l.visible);
    const vectorLayersToSync = visibleLayers.filter(l => (l.metadata?.type || 'vector') === 'vector');
    
    const layerReadinessDetails = vectorLayersToSync.map(l => ({
      id: l.id,
      setupStatus: l.setupStatus,
      hasGeoJson: !!l.metadata?.properties?.geojson,
      isReady: l.setupStatus === 'complete' && !!l.metadata?.properties?.geojson
    }));

    const areVectorLayersReadyForSync = vectorLayersToSync.every(
      l => l.setupStatus === 'complete' && l.metadata?.properties?.geojson
    );

    const canSync =
      cesiumInstance &&
      !cesiumInstance.isDestroyed() &&
      cesiumStatus === 'ready' &&
      mapboxStatus === 'ready' &&
      isInitialLoadComplete &&
      areVectorLayersReadyForSync &&
      !isLoading &&
      !initialSyncPerformed.current;

    if (canSync) {
      logger.info('CesiumView: All conditions met for initial layer sync to 3D view', {
        instanceId: viewerInstanceId.current,
        layerCount: vectorLayersToSync.length,
        layerDetails: layerReadinessDetails,
        cesiumStatus,
        mapboxStatus,
        isInitialLoadComplete
      });
      
      initialSyncPerformed.current = true;
      syncTo3D({ 
        syncView: true, 
        syncLayers: true,
        viewerInstanceId: viewerInstanceId.current 
      })
        .then(() => {
          logger.info('CesiumView: Initial layer sync complete', {
            instanceId: viewerInstanceId.current,
            layerCount: vectorLayersToSync.length,
            layerDetails: layerReadinessDetails
          });
        })
        .catch((error) => {
          logger.error('CesiumView: Initial layer sync failed', {
            instanceId: viewerInstanceId.current,
            error: error instanceof Error ? error.message : error,
            layerCount: vectorLayersToSync.length,
            layerDetails: layerReadinessDetails
          });
          initialSyncPerformed.current = false;
        });
    } else {
      logger.warn('CesiumView: Sync conditions not met', {
        conditions: {
          hasCesiumInstance: !!cesiumInstance,
          isDestroyed: cesiumInstance?.isDestroyed(),
          instanceId: viewerInstanceId.current,
          cesiumStatus,
          mapboxStatus,
          isInitialLoadComplete,
          areVectorLayersReadyForSync,
          isLoading,
          initialSyncPerformed: initialSyncPerformed.current
        },
        layers: {
          total: layers.length,
          visible: visibleLayers.length,
          vectorsToSync: vectorLayersToSync.length,
          readinessDetails: layerReadinessDetails
        }
      });
    }
  }, [cesiumInstance, cesiumStatus, mapboxStatus, syncTo3D, isLoading, layers, isInitialLoadComplete]);

  return (
    <div className="relative w-full h-full">
      <div ref={cesiumContainer} className="absolute inset-0" />
    </div>
  );
} 