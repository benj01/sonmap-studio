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

  // Effect for Viewer Initialization
  useEffect(() => {
    const container = cesiumContainer.current;
    if (!container || initializationAttempted.current) {
      return;
    }
    initializationAttempted.current = true;
    let viewer: Cesium.Viewer | null = null;

    const initializeViewer = async () => {
      try {
        logger.info('CesiumView: Starting initialization process');
        setCesiumStatus('initializing');
        initialSyncPerformed.current = false;

        // Create terrain provider
        logger.debug('CesiumView: Creating terrain provider');
        const terrainProvider = await getTerrainProvider();
        logger.debug('CesiumView: Terrain provider created successfully');
        
        // Create viewer
        logger.info('CesiumView: Creating Cesium viewer');
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

        logger.info('CesiumView: Setting instance and status');
        setCesiumInstance(viewer);
        setCesiumStatus('ready');
        logger.info('CesiumView: Cesium viewer initialized and state updated');

      } catch (error) {
        logger.error('CesiumView: Error initializing Cesium viewer', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        });
        setCesiumStatus('error', error instanceof Error ? error.message : 'Unknown error');
        initializationAttempted.current = false;
      }
    };

    initializeViewer();

    return () => {
      logger.info('CesiumView: Running cleanup for Cesium viewer');
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy();
      }
      viewerRef.current = null;
      setCesiumInstance(null);
      setCesiumStatus('initializing');
      initializationAttempted.current = false;
      initialSyncPerformed.current = false;
      logger.info('CesiumView: Cesium viewer destroyed and state reset');
    };
  }, []);

  // Effect for Triggering Sync based on State Changes AND Layer Data Readiness
  useEffect(() => {
    // Check if layers that need syncing are actually ready
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
      cesiumStatus === 'ready' &&
      mapboxStatus === 'ready' &&
      isInitialLoadComplete &&
      areVectorLayersReadyForSync &&
      !isLoading &&
      !initialSyncPerformed.current;

    if (canSync) {
      logger.info('CesiumView: All conditions met for initial layer sync to 3D view', {
        layerCount: vectorLayersToSync.length,
        layerDetails: layerReadinessDetails,
        cesiumStatus,
        mapboxStatus,
        isInitialLoadComplete
      });
      
      initialSyncPerformed.current = true;
      syncTo3D({ syncView: true, syncLayers: true })
        .then(() => {
          logger.info('CesiumView: Initial layer sync complete', {
            layerCount: vectorLayersToSync.length,
            layerDetails: layerReadinessDetails
          });
        })
        .catch((error) => {
          logger.error('CesiumView: Initial layer sync failed', {
            error: error instanceof Error ? error.message : error,
            layerCount: vectorLayersToSync.length,
            layerDetails: layerReadinessDetails
          });
          initialSyncPerformed.current = false;
        });
    } else {
      // Use warn level to ensure visibility
      logger.warn('CesiumView: Sync conditions not met', {
        conditions: {
          hasCesiumInstance: !!cesiumInstance,
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