'use client';

import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useViewStateStore } from '@/store/view/viewStateStore';
import { useCesium } from '../../context/CesiumContext';
import { LogManager, LogLevel } from '@/core/logging/log-manager';
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
  const { viewState3D, setViewState3D } = useViewStateStore();
  const { getCesiumDefaults, getTerrainProvider } = useCesium();
  const { layers } = useLayers();
  const isInitialLoadComplete = useLayerStore(state => state.isInitialLoadComplete);
  const initializationAttempted = useRef(false);
  const mountCount = useRef(0);
  const updateLayerStatus = useLayerStore(state => state.updateLayerStatus);

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
      viewerInstanceId.current = null;
      
      logger.info('CesiumView: Cleanup complete');
    };
  }, []);

  // Effect: Directly manage Cesium layers based on Zustand layer state
  useEffect(() => {
    if (!cesiumInstance || cesiumInstance.isDestroyed()) return;

    // Track Cesium objects by layerId
    const dataSourceMap = new Map<string, Cesium.DataSource>();
    const tilesetMap = new Map<string, Cesium.Cesium3DTileset>();
    const imageryLayerMap = new Map<string, Cesium.ImageryLayer>();

    // Helper: Remove Cesium object by type
    const removeCesiumLayer = (layerId: string) => {
      // Remove DataSource
      const ds = dataSourceMap.get(layerId);
      if (ds) {
        logger.info('Removing Cesium DataSource', { layerId });
        cesiumInstance.dataSources.remove(ds, true);
        dataSourceMap.delete(layerId);
      }
      // Remove Tileset
      const ts = tilesetMap.get(layerId);
      if (ts) {
        logger.info('Removing Cesium 3D Tileset', { layerId });
        cesiumInstance.scene.primitives.remove(ts);
        tilesetMap.delete(layerId);
      }
      // Remove ImageryLayer
      const il = imageryLayerMap.get(layerId);
      if (il) {
        logger.info('Removing Cesium ImageryLayer', { layerId });
        cesiumInstance.imageryLayers.remove(il, true);
        imageryLayerMap.delete(layerId);
      }
      // Set ready3D to false when removed
      updateLayerStatus(layerId, 'pending');
    };

    // Helper: Add or update Cesium object for a layer
    const addOrUpdateCesiumLayer = async (layer: any) => {
      if (!cesiumInstance || cesiumInstance.isDestroyed()) {
        logger.error('Cesium instance is not ready when trying to add/update layer', { layerId: layer.id });
        updateLayerStatus(layer.id, 'error', 'Cesium instance not ready');
        return;
      }
      try {
        if (!layer.visible) {
          removeCesiumLayer(layer.id);
          updateLayerStatus(layer.id, 'pending');
          return;
        }
        // Vector (GeoJSON)
        if (layer.metadata?.type === 'vector' && layer.metadata?.properties?.geojson) {
          if (!dataSourceMap.has(layer.id)) {
            logger.info('Adding Cesium GeoJSON DataSource', { layerId: layer.id });
            try {
              const ds = await Cesium.GeoJsonDataSource.load(layer.metadata.properties.geojson, {
                clampToGround: true
                // TODO: Style mapping
              });
              ds.name = layer.id;
              cesiumInstance.dataSources.add(ds);
              dataSourceMap.set(layer.id, ds);
              logger.info('Successfully loaded and added GeoJSON DataSource', { layerId: layer.id });
              updateLayerStatus(layer.id, 'complete');
            } catch (loadError) {
              logger.error('Error loading GeoJSON DataSource into Cesium', { layerId: layer.id, error: loadError });
              updateLayerStatus(layer.id, 'error', 'Failed to load GeoJSON');
            }
          } else {
            // TODO: Update data or style if changed
            logger.debug('GeoJSON DataSource already present', { layerId: layer.id });
            updateLayerStatus(layer.id, 'complete');
          }
        }
        // 3D Tiles
        else if (layer.metadata?.type === '3d-tiles' && layer.metadata?.properties?.url) {
          if (!tilesetMap.has(layer.id)) {
            logger.info('Adding Cesium 3D Tileset', { layerId: layer.id });
            // TODO: Review Cesium3DTileset options type if linter error persists
            const ts = new Cesium.Cesium3DTileset({ url: layer.metadata.properties.url } as any);
            (ts as any)._layerId = layer.id;
            cesiumInstance.scene.primitives.add(ts);
            tilesetMap.set(layer.id, ts);
          } else {
            // TODO: Update tileset if needed
            logger.debug('3D Tileset already present', { layerId: layer.id });
          }
        }
        // Imagery
        else if (layer.metadata?.type === 'imagery' && layer.metadata?.properties?.url) {
          if (!imageryLayerMap.has(layer.id)) {
            logger.info('Adding Cesium ImageryLayer', { layerId: layer.id });
            const provider = new Cesium.UrlTemplateImageryProvider({ url: layer.metadata.properties.url });
            const il = cesiumInstance.imageryLayers.addImageryProvider(provider);
            (il as any)._layerId = layer.id;
            imageryLayerMap.set(layer.id, il);
          } else {
            // TODO: Update imagery if needed
            logger.debug('ImageryLayer already present', { layerId: layer.id });
          }
        } else {
          logger.warn('Layer type not supported or missing data for Cesium', { layerId: layer.id, type: layer.metadata?.type });
          updateLayerStatus(layer.id, 'error', 'Unsupported type or missing data');
        }
      } catch (error) {
        logger.error('Error processing Cesium layer', { layerId: layer.id, error });
        updateLayerStatus(layer.id, 'error', 'Processing error');
      }
    };

    // Sync Cesium with Zustand layers
    (async () => {
      // Remove Cesium objects for layers that are no longer present or not visible
      const layerIds = new Set(layers.map(l => l.id));
      for (const id of [...dataSourceMap.keys(), ...tilesetMap.keys(), ...imageryLayerMap.keys()]) {
        const layer = layers.find(l => l.id === id);
        if (!layer || !layer.visible) {
          removeCesiumLayer(id);
        }
      }
      // Add or update Cesium objects for all layers
      for (const layer of layers) {
        // Debug log: print the layer object and geojson presence
        console.log('Processing layer for Cesium:', JSON.stringify(layer, null, 2));
        console.log(`Layer ${layer.id} has geojson?`, !!layer.metadata?.properties?.geojson);
        await addOrUpdateCesiumLayer(layer);
      }
    })();

    // Cleanup: remove all Cesium objects on unmount
    return () => {
      for (const id of dataSourceMap.keys()) removeCesiumLayer(id);
      for (const id of tilesetMap.keys()) removeCesiumLayer(id);
      for (const id of imageryLayerMap.keys()) removeCesiumLayer(id);
    };
  }, [cesiumInstance, layers]);

  // TODO: Directly manage Cesium layers based on Zustand layer state.
  //       When layers or their visibility change, update Cesium data sources/primitives/imagery.
  //       Remove any "sync to 3D" or Mapbox state logic.

  return (
    <div className="relative w-full h-full">
      <div ref={cesiumContainer} className="absolute inset-0" />
    </div>
  );
} 