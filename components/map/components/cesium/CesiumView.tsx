'use client';

import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useViewStateStore } from '@/store/view/viewStateStore';
import { useCesium } from '../../context/CesiumContext';
import { LogManager, LogLevel } from '@/core/logging/log-manager';
import { useLayers } from '@/store/layers/hooks';
import { useLayerStore } from '@/store/layers/layerStore';
import { processFeatureCollectionHeights, needsHeightTransformation } from '../../services/heightTransformService';

const SOURCE = 'CesiumView';
const logManager = LogManager.getInstance();

// Configure logging for CesiumView
logManager.setComponentLogLevel(SOURCE, LogLevel.DEBUG);
// Reduce verbosity for non-essential components/hooks during this investigation
logManager.setComponentLogLevel('LayerList', LogLevel.WARN);
logManager.setComponentLogLevel('useLayers', LogLevel.WARN);
logManager.setComponentLogLevel('MapContainer', LogLevel.WARN);
logManager.setComponentLogLevel('useLayer', LogLevel.WARN);
logManager.setComponentLogLevel('LayerItem', LogLevel.WARN);
logManager.setComponentLogLevel('MapView', LogLevel.WARN);

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
  const dataSourceMap = useRef(new Map<string, Cesium.DataSource>());
  const tilesetMap = useRef(new Map<string, Cesium.Cesium3DTileset>());
  const imageryLayerMap = useRef(new Map<string, Cesium.ImageryLayer>());
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
  // First-run guard for dev mode (must be at top level)
  const isFirstRun = useRef(true);
  const loadingLayersRef = useRef(new Set<string>());
  const [mapType, setMapType] = useState<'satellite' | 'osm'>('satellite');
  const [expanded, setExpanded] = useState(false);

  // Effect for Viewer Initialization
  useEffect(() => {
    mountCount.current++;
    const container = cesiumContainer.current;
    
    // Log the Cesium container size for debugging
    if (container) {
      logger.debug('Cesium container size', {
        width: container.offsetWidth,
        height: container.offsetHeight
      });
    }

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
        // Expose Cesium viewer for debugging
        // (window as any).cesiumViewer = viewer;
        // logger.info('CesiumView: Viewer exposed to window.cesiumViewer for debugging');

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
    // Log dependencies for debugging
    logger.debug('Cesium layer management effect dependencies', {
      cesiumInstanceExists: !!cesiumInstance,
      cesiumInstanceDestroyed: cesiumInstance ? cesiumInstance.isDestroyed() : undefined,
      layersLength: layers.length,
      layerIds: layers.map(l => l.id),
      isInitialLoadComplete
    });

    // First-run guard for dev mode
    if (isFirstRun.current) {
      isFirstRun.current = false;
      if (process.env.NODE_ENV === 'development') {
        logger.debug('Skipping first cleanup in dev mode (first-run guard)');
        return;
      }
    }

    logger.debug('Cesium layer management effect RUNNING', { layerCount: layers.length });
    if (!cesiumInstance || cesiumInstance.isDestroyed()) return;

    // Helper: Remove Cesium object by type
    const removeCesiumLayer = (layerId: string) => {
      logger.debug('removeCesiumLayer called', { layerId });
      // Ensure cesiumInstance is valid before proceeding
      if (!cesiumInstance || cesiumInstance.isDestroyed()) {
        logger.warn('Attempted to remove Cesium layer but instance is not available', { layerId });
        return;
      }
      let found = false;
      // Remove DataSource
      const ds = dataSourceMap.current.get(layerId);
      if (ds) {
        logger.info('Removing Cesium DataSource from view', { layerId });
        cesiumInstance.dataSources.remove(ds, true);
        dataSourceMap.current.delete(layerId);
        found = true;
      }
      // Remove Tileset
      const ts = tilesetMap.current.get(layerId);
      if (ts) {
        logger.info('Removing Cesium 3D Tileset from view', { layerId });
        cesiumInstance.scene.primitives.remove(ts);
        tilesetMap.current.delete(layerId);
        found = true;
      }
      // Remove ImageryLayer
      const il = imageryLayerMap.current.get(layerId);
      if (il) {
        logger.info('Removing Cesium ImageryLayer from view', { layerId });
        cesiumInstance.imageryLayers.remove(il, true);
        imageryLayerMap.current.delete(layerId);
        found = true;
      }
      if (!found) {
        logger.warn('No Cesium object found to remove for layer', { layerId });
      }
      logger.debug('Cesium layer representation removed, store status NOT changed', { layerId });
    };

    // Helper: Add or update Cesium object for a layer
    const addOrUpdateCesiumLayer = async (layer: any) => {
      logger.debug('addOrUpdateCesiumLayer called', {
        id: layer.id,
        visible: layer.visible,
        type: layer.metadata?.type,
        hasGeojson: !!layer.metadata?.properties?.geojson
      });
      if (!cesiumInstance || cesiumInstance.isDestroyed()) {
        logger.error('Cesium instance is not ready when trying to add/update layer', { layerId: layer.id });
        if (layer.setupStatus !== 'error' || layer.error !== 'Cesium instance not ready') {
          updateLayerStatus(layer.id, 'error', 'Cesium instance not ready');
        }
        return;
      }
      try {
        if (!layer.visible) {
          logger.debug('Layer not visible, will remove if present', { layerId: layer.id });
          removeCesiumLayer(layer.id);
          return;
        }
        // Vector (GeoJSON)
        if (layer.metadata?.type === 'vector' && layer.metadata?.properties?.geojson) {
          // Check internal map AND loading state
          if (!dataSourceMap.current.has(layer.id) && !loadingLayersRef.current.has(layer.id)) {
            try {
              logger.info('>>> Preparing to ADD Cesium GeoJSON DataSource', { layerId: layer.id });
              loadingLayersRef.current.add(layer.id); // Mark as loading SYNCHRONOUSLY

              // Process the GeoJSON data to transform heights if needed
              let geojsonData = layer.metadata.properties.geojson;
              
              // Check if any features need height transformation
              if (needsHeightTransformation(geojsonData)) {
                logger.info('Layer contains features with LV95 stored coordinates, transforming heights', { layerId: layer.id });
                
                // Transform feature heights using our service
                geojsonData = await processFeatureCollectionHeights(geojsonData);
                
                logger.info('Height transformation complete', { layerId: layer.id });
              }

              const ds = await Cesium.GeoJsonDataSource.load(geojsonData, {
                clampToGround: true
                // TODO: Style mapping
              });
              ds.name = layer.id;

              // Double-check viewer hasn't been destroyed during await
              if (!cesiumInstance || cesiumInstance.isDestroyed()) {
                logger.warn('Cesium instance destroyed during async load, aborting add.', { layerId: layer.id });
                return; // Abort if viewer is gone
              }

              // Important: Check AGAIN if it was added by another concurrent run *after* await
              if (dataSourceMap.current.has(layer.id)) {
                logger.warn('DataSource was added concurrently, skipping duplicate add.', { layerId: layer.id });
                // Optional: Destroy the newly loaded ds if not needed? ds.entities.removeAll();
                return;
              }

              logger.info('>>> Adding loaded DataSource to Cesium collection', { layerId: layer.id });
              await cesiumInstance.dataSources.add(ds);
              logger.info('>>> SUCCESSFULLY Added DataSource to Cesium collection', { layerId: layer.id });
              dataSourceMap.current.set(layer.id, ds);
              logger.info('>>> Set DataSource in internal map', { layerId: layer.id });
              if (layer.setupStatus !== 'complete' || layer.error !== undefined) {
                updateLayerStatus(layer.id, 'complete');
              }
            } catch (loadError) {
              logger.error('Error loading/adding GeoJSON', { layerId: layer.id, loadError });
              if (layer.setupStatus !== 'error' || layer.error !== 'Failed to load GeoJSON') {
                updateLayerStatus(layer.id, 'error', 'Failed to load GeoJSON');
              }
            } finally {
              loadingLayersRef.current.delete(layer.id); // Unmark as loading
            }
          } else if (loadingLayersRef.current.has(layer.id)) {
            logger.debug('GeoJSON DataSource is already loading, skipping duplicate add attempt', { layerId: layer.id });
          } else {
            logger.debug('GeoJSON DataSource already present in internal map, skipping add', { layerId: layer.id });
            if (layer.setupStatus !== 'complete' || layer.error !== undefined) {
              updateLayerStatus(layer.id, 'complete');
            }
          }
        }
        // 3D Tiles
        else if (layer.metadata?.type === '3d-tiles' && layer.metadata?.properties?.url) {
          if (!tilesetMap.current.has(layer.id)) {
            logger.info('Adding Cesium 3D Tileset', { layerId: layer.id });
            // TODO: Review Cesium3DTileset options type if linter error persists
            const ts = new Cesium.Cesium3DTileset({ url: layer.metadata.properties.url } as any);
            (ts as any)._layerId = layer.id;
            cesiumInstance.scene.primitives.add(ts);
            tilesetMap.current.set(layer.id, ts);
          } else {
            // TODO: Update tileset if needed
            logger.debug('3D Tileset already present', { layerId: layer.id });
          }
        }
        // Imagery
        else if (layer.metadata?.type === 'imagery' && layer.metadata?.properties?.url) {
          if (!imageryLayerMap.current.has(layer.id)) {
            logger.info('Adding Cesium ImageryLayer', { layerId: layer.id });
            const provider = new Cesium.UrlTemplateImageryProvider({ url: layer.metadata.properties.url });
            const il = cesiumInstance.imageryLayers.addImageryProvider(provider);
            (il as any)._layerId = layer.id;
            imageryLayerMap.current.set(layer.id, il);
          } else {
            // TODO: Update imagery if needed
            logger.debug('ImageryLayer already present', { layerId: layer.id });
          }
        } else {
          logger.warn('Layer type not supported or missing data for Cesium', { layerId: layer.id, type: layer.metadata?.type });
          if (layer.setupStatus !== 'error' || layer.error !== 'Unsupported type or missing data') {
            updateLayerStatus(layer.id, 'error', 'Unsupported type or missing data');
          }
        }
      } catch (error) {
        logger.error('Error processing Cesium layer', { layerId: layer.id, error });
        if (layer.setupStatus !== 'error' || layer.error !== 'Processing error') {
          updateLayerStatus(layer.id, 'error', 'Processing error');
        }
      }
    };

    // --- Phase 1: Remove ---
    const visibleLayerIds = new Set(layers.filter(l => l.visible).map(l => l.id));
    logger.debug('Visible layer IDs after visibility filter', { visibleLayerIds: Array.from(visibleLayerIds) });
    // Remove DataSources no longer needed or invisible
    for (const id of dataSourceMap.current.keys()) {
      if (!visibleLayerIds.has(id)) {
        logger.debug('Layer is not visible, removing Cesium DataSource', { layerId: id });
        removeCesiumLayer(id);
      }
    }
    // Remove Tilesets no longer needed or invisible
    for (const id of tilesetMap.current.keys()) {
      if (!visibleLayerIds.has(id)) {
        logger.debug('Layer is not visible, removing Cesium Tileset', { layerId: id });
        removeCesiumLayer(id);
      }
    }
    // Remove ImageryLayers no longer needed or invisible
    for (const id of imageryLayerMap.current.keys()) {
      if (!visibleLayerIds.has(id)) {
        logger.debug('Layer is not visible, removing Cesium ImageryLayer', { layerId: id });
        removeCesiumLayer(id);
      }
    }

    // --- Phase 2: Add/Update ---
    (async () => {
      for (const layer of layers) {
        logger.debug('Layer visibility state', { id: layer.id, visible: layer.visible, type: layer.metadata?.type });
        if (layer.visible) {
          logger.debug('Processing visible Cesium layer', {
            id: layer.id,
            type: layer.metadata?.type,
            dataSourceExists: dataSourceMap.current.has(layer.id),
            tilesetExists: tilesetMap.current.has(layer.id),
            imageryLayerExists: imageryLayerMap.current.has(layer.id)
          });
          await addOrUpdateCesiumLayer(layer);
        }
      }
      logger.debug('Cesium layer management effect FINISHED processing adds/updates', {
        dataSourceMapKeys: Array.from(dataSourceMap.current.keys()),
        tilesetMapKeys: Array.from(tilesetMap.current.keys()),
        imageryLayerMapKeys: Array.from(imageryLayerMap.current.keys()),
        layers: layers.map(l => ({ id: l.id, visible: l.visible, type: l.metadata?.type }))
      });
    })();

    // Cleanup: minimal for Strict Mode compatibility
    return () => {
      logger.debug('Cesium layer management effect CLEANUP running (minimal)');
      // No removal of layers or clearing of maps here. Main viewer cleanup handles full destruction.
    };
  }, [cesiumInstance, layers]);

  // Effect: Switch imagery provider when mapType changes
  useEffect(() => {
    const switchImagery = async () => {
      if (!viewerRef.current) return;
      try {
        const viewer = viewerRef.current;
        viewer.imageryLayers.removeAll();
        if (mapType === 'osm') {
          logger.info('Switching to OpenStreetMap imagery');
          const osmProvider = new Cesium.OpenStreetMapImageryProvider({
            url: 'https://tile.openstreetmap.org/',
            credit: new Cesium.Credit('© OpenStreetMap contributors'),
            maximumLevel: 19
          });
          viewer.imageryLayers.addImageryProvider(osmProvider);
        } else {
          logger.info('Switching to Satellite (Cesium World Imagery/Ion)');
          const worldImagery = await Cesium.createWorldImageryAsync();
          viewer.imageryLayers.addImageryProvider(worldImagery);
        }
      } catch (error) {
        logger.error('Error switching imagery provider', error);
      }
    };
    switchImagery();
  }, [mapType]);

  // TODO: Directly manage Cesium layers based on Zustand layer state.
  //       When layers or their visibility change, update Cesium data sources/primitives/imagery.
  //       Remove any "sync to 3D" or Mapbox state logic.

  return (
    <div className="relative w-full h-full">
      {/* Collapsible Map Type Switcher */}
      <div
        className="absolute bottom-4 right-4 z-20 flex flex-col items-end"
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        onFocus={() => setExpanded(true)}
        onBlur={() => setExpanded(false)}
        tabIndex={0}
        aria-label="Map type switcher"
      >
        {expanded ? (
          <div className="flex bg-white bg-opacity-70 rounded-lg shadow p-1 gap-1 border border-gray-200 transition-all duration-200">
            <button
              type="button"
              aria-label="Satellite Map"
              className={`flex flex-col items-center px-2 py-1 rounded-md transition border ${mapType === 'satellite' ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-transparent hover:bg-gray-100'} focus:outline-none`}
              style={{ minWidth: 48 }}
              onClick={() => { setMapType('satellite'); setExpanded(false); }}
              tabIndex={0}
            >
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="32" height="32" rx="8" fill="#e0e7ef"/>
                <image href="https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Earth_Eastern_Hemisphere.jpg/64px-Earth_Eastern_Hemisphere.jpg" x="4" y="4" height="24" width="24"/>
              </svg>
              <span className="text-[10px] mt-0.5 font-medium text-gray-700">Satellite</span>
            </button>
            <button
              type="button"
              aria-label="OpenStreetMap"
              className={`flex flex-col items-center px-2 py-1 rounded-md transition border ${mapType === 'osm' ? 'border-green-500 bg-green-50 shadow-sm' : 'border-transparent hover:bg-gray-100'} focus:outline-none`}
              style={{ minWidth: 48 }}
              onClick={() => { setMapType('osm'); setExpanded(false); }}
              tabIndex={0}
            >
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="32" height="32" rx="8" fill="#e0f7e9"/>
                <path d="M8 24L24 8M8 8L24 24" stroke="#34a853" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="16" cy="16" r="6" fill="#34a853" fillOpacity="0.2"/>
              </svg>
              <span className="text-[10px] mt-0.5 font-medium text-gray-700">OpenStreetMap</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label={mapType === 'satellite' ? 'Satellite Map' : 'OpenStreetMap'}
            className="rounded-full bg-white bg-opacity-80 shadow border border-gray-200 p-1 flex items-center justify-center transition-all duration-200 focus:outline-none"
            style={{ width: 40, height: 40 }}
            onClick={() => setExpanded(true)}
            tabIndex={0}
          >
            {mapType === 'satellite' ? (
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="32" height="32" rx="8" fill="#e0e7ef"/>
                <image href="https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Earth_Eastern_Hemisphere.jpg/64px-Earth_Eastern_Hemisphere.jpg" x="4" y="4" height="24" width="24"/>
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="32" height="32" rx="8" fill="#e0f7e9"/>
                <path d="M8 24L24 8M8 8L24 24" stroke="#34a853" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="16" cy="16" r="6" fill="#34a853" fillOpacity="0.2"/>
              </svg>
            )}
          </button>
        )}
      </div>
      <div
        ref={cesiumContainer}
        className="w-full h-full"
      />
    </div>
  );
} 