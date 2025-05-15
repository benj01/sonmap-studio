/* eslint-disable @typescript-eslint/no-floating-promises */
// ^ Disabling for the entire file due to a linter issue with inline disables
// in the addOrUpdateCesiumLayer function.
// TODO: Re-evaluate after @typescript-eslint updates.

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useViewStateStore } from '@/store/view/viewStateStore';
import { dbLogger } from '@/utils/logging/dbLogger';
import { useLayers } from '@/store/layers/hooks';
import { useLayerStore } from '@/store/layers/layerStore';
import { processFeatureCollectionHeights, needsHeightTransformation } from '../../services/heightTransformService';
import * as GeoJSON from 'geojson';
import debounce from 'lodash/debounce';

const SOURCE = 'CesiumView';

// Define CesiumLayer interface for type safety
interface CesiumLayer {
  id: string;
  visible: boolean;
  metadata?: {
    type?: string;
    properties?: { geojson?: GeoJSON.FeatureCollection; url?: string };
    height?: { sourceType: string; attributeName?: string; interpretationMode?: string };
    style?: { paint?: Record<string, unknown> };
  };
  setupStatus?: string;
  error?: string;
}

/**
 * Applies height data to GeoJSON features based on configuration
 */
function applyHeightToFeatures(
  featureCollection: GeoJSON.FeatureCollection,
  heightConfig: {
    sourceType: 'z_coord' | 'attribute' | 'none';
    attributeName?: string;
    interpretationMode?: 'absolute' | 'relative' | 'extrusion';
  }
): GeoJSON.FeatureCollection {
  if (!featureCollection || !featureCollection.features || !heightConfig) {
    return featureCollection;
  }
  
  const sourceType = heightConfig.sourceType;
  const attributeName = heightConfig.attributeName;
  const interpretationMode = heightConfig.interpretationMode || 'absolute';
  
  // Create a copy of the feature collection to avoid modifying the original
  const result = {
    ...featureCollection,
    features: [...featureCollection.features]
  };
  
  // Fire-and-forget logging: this function is not async
  void dbLogger.debug('Applying height to features', {
    source: SOURCE,
    sourceType,
    attributeName,
    interpretationMode,
    featureCount: result.features.length
  }).catch(() => {}); // ignore logging errors
  
  // Process each feature
  result.features = result.features.map((feature: GeoJSON.Feature) => {
    // For z-coordinate source, we don't need to modify the coordinates
    // as they already have Z values that Cesium will use
    if (sourceType === 'z_coord') {
      return feature;
    }
    
    // For attribute source, we need to extract the height value and apply it
    if (sourceType === 'attribute' && attributeName && feature.properties) {
      const heightValue = feature.properties[attributeName];
      
      // Skip if no valid height value
      if (typeof heightValue !== 'number' || isNaN(heightValue)) {
        return feature;
      }
      
      // Create a copy of the feature to avoid modifying the original
      const featureCopy = { ...feature, geometry: { ...feature.geometry } };
      
      // Apply the height value based on interpretation mode
      if (interpretationMode === 'absolute') {
        // Absolute elevation: directly use the height value
        applyAbsoluteHeight(featureCopy, heightValue);
      } 
      else if (interpretationMode === 'relative') {
        // Relative to ground: will be handled by Cesium extrusion
        // We'll store the relative height in a special property that Cesium will use
        if (!featureCopy.properties) {
          featureCopy.properties = {};
        }
        featureCopy.properties['_relativeHeight'] = heightValue;
        
        // We'll still set the z-coordinate to 0 for proper initial positioning
        applyAbsoluteHeight(featureCopy, 0);
      }
      else if (interpretationMode === 'extrusion') {
        // Building extrusion: will create extruded geometries in Cesium
        // Store the extrusion height in a special property
        if (!featureCopy.properties) {
          featureCopy.properties = {};
        }
        featureCopy.properties['_extrusionHeight'] = heightValue;
        
        // Set the base z-coordinate to 0
        applyAbsoluteHeight(featureCopy, 0);
      }
      
      return featureCopy;
    }
    
    return feature;
  });
  
  return result;
}

/**
 * Helper function to apply absolute height to a feature's geometry
 */
function applyAbsoluteHeight(feature: GeoJSON.Feature, heightValue: number): void {
  if (!feature.geometry) return;
  
  switch (feature.geometry.type) {
    case 'Point':
      if (Array.isArray(feature.geometry.coordinates) && feature.geometry.coordinates.length >= 2) {
        (feature.geometry.coordinates as number[])[2] = heightValue;
      }
      break;
      
    case 'LineString':
      if (Array.isArray(feature.geometry.coordinates)) {
        feature.geometry.coordinates = feature.geometry.coordinates.map((coord: number[]) => {
          if (coord.length >= 2) {
            return [...coord.slice(0, 2), heightValue];
          }
          return coord;
        });
      }
      break;
      
    case 'Polygon':
      if (Array.isArray(feature.geometry.coordinates)) {
        feature.geometry.coordinates = feature.geometry.coordinates.map((ring: number[][]) => {
          return ring.map((coord: number[]) => {
            if (coord.length >= 2) {
              return [...coord.slice(0, 2), heightValue];
            }
            return coord;
          });
        });
      }
      break;
      
    case 'MultiPoint':
      if (Array.isArray(feature.geometry.coordinates)) {
        feature.geometry.coordinates = feature.geometry.coordinates.map((coord: number[]) => {
          if (coord.length >= 2) {
            return [...coord.slice(0, 2), heightValue];
          }
          return coord;
        });
      }
      break;
      
    case 'MultiLineString':
      if (Array.isArray(feature.geometry.coordinates)) {
        feature.geometry.coordinates = feature.geometry.coordinates.map((line: number[][]) => {
          return line.map((coord: number[]) => {
            if (coord.length >= 2) {
              return [...coord.slice(0, 2), heightValue];
            }
            return coord;
          });
        });
      }
      break;
      
    case 'MultiPolygon':
      if (Array.isArray(feature.geometry.coordinates)) {
        feature.geometry.coordinates = feature.geometry.coordinates.map((polygon: number[][][]) => {
          return polygon.map((ring: number[][]) => {
            return ring.map((coord: number[]) => {
              if (coord.length >= 2) {
                return [...coord.slice(0, 2), heightValue];
              }
              return coord;
            });
          });
        });
      }
      break;
  }
}

// Utility to fetch or sample terrain heights for a feature
async function getTerrainHeights(featureId: string, geometry: GeoJSON.Geometry, terrainSource: string = 'CesiumWorldTerrain'): Promise<number[]> {
  // 1. Try cache
  const cacheRes = await fetch(`/api/feature-terrain-cache?feature_id=${featureId}&terrain_source=${terrainSource}`);
  if (cacheRes.ok) {
    const cache = await cacheRes.json();
    return cache.heights;
  }
  // 2. Sample and cache
  const sampleRes = await fetch('/api/sample-terrain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feature_id: featureId, geometry, terrain_source: terrainSource }),
  });
  if (!sampleRes.ok) throw new Error('Failed to sample terrain');
  const { heights } = await sampleRes.json();
  return heights;
}

export function CesiumView() {
  const cesiumContainer = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const viewerInstanceId = useRef<string | null>(null);
  const dataSourceMap = useRef(new Map<string, Cesium.DataSource>());
  const tilesetMap = useRef(new Map<string, Cesium.Cesium3DTileset>());
  const imageryLayerMap = useRef(new Map<string, Cesium.ImageryLayer>());
  const [mousePosition, setMousePosition] = useState<{longitude: number; latitude: number; height: number} | null>(null);
  const lastViewState = useRef<{longitude: number; latitude: number; height: number} | null>(null);
  const [mapType, setMapType] = useState<'satellite' | 'osm'>('satellite');
  const [expanded, setExpanded] = useState(false);
  
  const { setCesiumInstance, setCesiumStatus } = useMapInstanceStore();
  const { viewState3D, setViewState3D } = useViewStateStore();
  const { layers } = useLayers();
  const isInitialLoadComplete = useLayerStore(state => state.isInitialLoadComplete);
  const updateLayerStatus = useLayerStore(state => state.updateLayerStatus);
  
  const getCesiumDefaults = useCallback(() => {
    return {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      navigationHelpButton: false,
      navigationInstructionsInitiallyVisible: false,
      shouldAnimate: true
    };
  }, []);

  const getTerrainProvider = useCallback(async () => {
    try {
      return await Cesium.createWorldTerrainAsync({
        requestVertexNormals: true,
        requestWaterMask: true
      });
    } catch (error) {
      await dbLogger.error('Error creating terrain provider', { error });
      return new Cesium.EllipsoidTerrainProvider({});
    }
  }, []);

  // Track initialization status
  const initializationAttempted = useRef(false);

  // Viewer initialization effect
  useEffect(() => {
    // Prevent multiple initialization attempts
    if (initializationAttempted.current || !cesiumContainer.current || viewerRef.current) {
      return;
    }

    initializationAttempted.current = true;

    const initViewer = async () => {
      try {
        await dbLogger.info('CesiumView: Starting initialization process');
        setCesiumStatus('initializing');

        viewerInstanceId.current = `cesium-viewer-${Date.now()}`;
        
        const terrainProvider = await getTerrainProvider();
        
        // Check if component is still mounted
        if (!cesiumContainer.current) {
          throw new Error('Container element no longer exists');
        }
        
        const viewer = new Cesium.Viewer(cesiumContainer.current, {
          terrainProvider,
          ...getCesiumDefaults()
        });

        viewerRef.current = viewer;

        // Set initial camera position if viewState3D is available
        if (viewState3D) {
          viewer.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(
              viewState3D.longitude,
              viewState3D.latitude,
              viewState3D.height
            )
          });
        }

        await viewer.scene.requestRender();
        
        // Check if we're still the current instance
        if (viewerInstanceId.current) {
          setCesiumInstance(viewer, viewerInstanceId.current);
          setCesiumStatus('ready');
          await dbLogger.info('CesiumView: Viewer initialized successfully');
        }
      } catch (error) {
        await dbLogger.error('CesiumView: Error initializing viewer', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        setCesiumStatus('error', error instanceof Error ? error.message : 'Unknown error');
      }
    };

    initViewer().catch(console.error);

    return () => {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;

      setCesiumStatus('destroyed');

      // Clean up DOM first
      if (viewer.container?.parentNode) {
        viewer.container.parentNode.removeChild(viewer.container);
      }

      // Then destroy the viewer
      viewer.destroy();
      
      // Reset refs and state
      viewerRef.current = null;
      setCesiumInstance(null);
      viewerInstanceId.current = null;
      initializationAttempted.current = false;

      // Clean up any orphaned elements
      document.querySelectorAll('.cesium-viewer, .cesium-widget').forEach(el => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });

      dbLogger.info('CesiumView: Cleanup complete').catch(console.error);
    };
  }, [
    setCesiumInstance,
    setCesiumStatus,
    getTerrainProvider,
    getCesiumDefaults,
    viewState3D
  ]); // Include all dependencies

  // Camera change handler - separate effect
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const debouncedSetViewState = debounce((newState: typeof viewState3D) => {
      const last = lastViewState.current;
      if (
        last &&
        Math.abs(newState.longitude - last.longitude) < 0.000001 &&
        Math.abs(newState.latitude - last.latitude) < 0.000001 &&
        Math.abs(newState.height - last.height) < 0.1
      ) return;

      lastViewState.current = newState;
      setViewState3D(newState);
    }, 100);

    const handleCameraChange = () => {
      const cartographic = Cesium.Cartographic.fromCartesian(viewer.camera.position);
      debouncedSetViewState({
        longitude: Cesium.Math.toDegrees(cartographic.longitude),
        latitude: Cesium.Math.toDegrees(cartographic.latitude),
        height: cartographic.height,
        heading: viewer.camera.heading,
        pitch: viewer.camera.pitch
      });
    };

    viewer.camera.changed.addEventListener(handleCameraChange);
    return () => {
      viewer.camera.changed.removeEventListener(handleCameraChange);
      debouncedSetViewState.cancel();
    };
  }, []); // Empty dependency array - uses ref for viewer access

  // Layer management effect
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !isInitialLoadComplete) return;

    const removeCesiumLayer = async (layerId: string) => {
      await dbLogger.debug('Removing Cesium layer', { layerId });
      
      // Remove DataSource
      const ds = dataSourceMap.current.get(layerId);
      if (ds) {
        viewer.dataSources.remove(ds, true);
        dataSourceMap.current.delete(layerId);
      }

      // Remove Tileset
      const ts = tilesetMap.current.get(layerId);
      if (ts) {
        viewer.scene.primitives.remove(ts);
        tilesetMap.current.delete(layerId);
      }

      // Remove ImageryLayer
      const il = imageryLayerMap.current.get(layerId);
      if (il) {
        viewer.imageryLayers.remove(il, true);
        imageryLayerMap.current.delete(layerId);
      }
    };

    const addOrUpdateCesiumLayer = async (layer: CesiumLayer) => {
      try {
        if (!layer.visible) {
          await removeCesiumLayer(layer.id);
          return;
        }

        // Handle GeoJSON layers
        if (layer.metadata?.type === 'vector' && layer.metadata?.properties?.geojson) {
          // Always remove and re-add the data source if style or data changes
          if (dataSourceMap.current.has(layer.id)) {
            const ds = dataSourceMap.current.get(layer.id);
            if (ds) {
              viewer.dataSources.remove(ds, true);
              dataSourceMap.current.delete(layer.id);
            }
          }

          // Process heights before loading into Cesium
          let processedGeoJson = layer.metadata.properties.geojson;
          
          // Apply height configuration if present
          if (layer.metadata.height) {
            processedGeoJson = applyHeightToFeatures(processedGeoJson, {
              sourceType: layer.metadata.height.sourceType as 'z_coord' | 'attribute' | 'none',
              attributeName: layer.metadata.height.attributeName,
              interpretationMode: layer.metadata.height.interpretationMode as 'absolute' | 'relative' | 'extrusion'
            });
          }

          // Check if Swiss height transformation is needed
          if (needsHeightTransformation(processedGeoJson)) {
            processedGeoJson = await processFeatureCollectionHeights(processedGeoJson);
          }

          // Extract style from layer metadata
          const paint = layer.metadata?.style?.paint || {};
          const strokeColor = typeof paint['line-color'] === 'string' ? paint['line-color'] : '#1E88E5';
          const strokeWidth = typeof paint['line-width'] === 'number' ? paint['line-width'] : (typeof paint['line-width'] === 'string' ? parseFloat(paint['line-width']) : 3);
          const fillColor = typeof paint['fill-color'] === 'string' ? paint['fill-color'] : '#1E88E5';
          const fillOpacity = typeof paint['fill-opacity'] === 'number' ? paint['fill-opacity'] : (typeof paint['fill-opacity'] === 'string' ? parseFloat(paint['fill-opacity']) : 0.5);

          // Ensure Cesium.Color.fromCssColorString only receives a string
          const safeStrokeColor = typeof strokeColor === 'string' ? strokeColor : '#1E88E5';
          const safeFillColor = typeof fillColor === 'string' ? fillColor : '#1E88E5';

          // Load the processed GeoJSON into Cesium with dynamic style
          const ds = await Cesium.GeoJsonDataSource.load(processedGeoJson, {
            clampToGround: !layer.metadata.height, // Only clamp if no height config
            stroke: Cesium.Color.fromCssColorString(safeStrokeColor),
            strokeWidth: strokeWidth,
            fill: Cesium.Color.fromCssColorString(safeFillColor).withAlpha(fillOpacity),
          });
          
          viewer.dataSources.add(ds);
          dataSourceMap.current.set(layer.id, ds);
          updateLayerStatus(layer.id, 'complete');
        }
        
        // Handle 3D Tiles
        else if (layer.metadata?.type === '3d-tiles' && layer.metadata?.properties?.url) {
          if (!tilesetMap.current.has(layer.id)) {
            const ts = await Cesium.Cesium3DTileset.fromUrl(layer.metadata.properties.url);
            viewer.scene.primitives.add(ts);
            tilesetMap.current.set(layer.id, ts);
            updateLayerStatus(layer.id, 'complete');
          }
        }
        
        // Handle Imagery layers
        else if (layer.metadata?.type === 'imagery' && layer.metadata?.properties?.url) {
          if (!imageryLayerMap.current.has(layer.id)) {
            const provider = new Cesium.UrlTemplateImageryProvider({ 
              url: layer.metadata.properties.url 
            });
            const il = viewer.imageryLayers.addImageryProvider(provider);
            imageryLayerMap.current.set(layer.id, il);
            updateLayerStatus(layer.id, 'complete');
          }
        }
      } catch (error) {
        await dbLogger.error('Error processing layer', {
          layerId: layer.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        updateLayerStatus(layer.id, 'error', 'Failed to process layer');
      }
    };

    // Process all layers
    const updateLayers = async () => {
      // First remove any layers that are no longer present
      const currentLayerIds = new Set(layers.map(l => l.id));
      for (const id of dataSourceMap.current.keys()) {
        if (!currentLayerIds.has(id)) {
          await removeCesiumLayer(id);
        }
      }

      // Then add or update current layers
      for (const layer of layers) {
        await addOrUpdateCesiumLayer(layer);
      }
    };

    updateLayers().catch(console.error);

    // Cleanup function
    return () => {
      // Clean up all layers when the effect is cleaned up
      for (const id of dataSourceMap.current.keys()) {
        removeCesiumLayer(id).catch(console.error);
      }
    };
  }, [layers, isInitialLoadComplete]); // Only depend on layers and isInitialLoadComplete

  // Mouse position tracking effect
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    
    const handleMouseMove = (event: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
      const cartesian = viewer.scene.pickPosition(event.endPosition);
      if (cartesian) {
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        setMousePosition({
          longitude: Cesium.Math.toDegrees(cartographic.longitude),
          latitude: Cesium.Math.toDegrees(cartographic.latitude),
          height: cartographic.height
        });
      }
    };

    handler.setInputAction(handleMouseMove, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    return () => {
      handler.destroy();
    };
  }, []); // Empty dependency array since we use refs

  // Map type switcher effect
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const switchImagery = async () => {
      try {
        viewer.imageryLayers.removeAll();
        
        if (mapType === 'osm') {
          await dbLogger.info('Switching to OpenStreetMap imagery');
          const osmProvider = new Cesium.OpenStreetMapImageryProvider({
            url: 'https://tile.openstreetmap.org/',
            credit: new Cesium.Credit('© OpenStreetMap contributors'),
            maximumLevel: 19
          });
          viewer.imageryLayers.addImageryProvider(osmProvider);
        } else {
          await dbLogger.info('Switching to Satellite imagery');
          const worldImagery = await Cesium.createWorldImageryAsync();
          viewer.imageryLayers.addImageryProvider(worldImagery);
        }
      } catch (error) {
        await dbLogger.error('Error switching imagery provider', { error });
      }
    };

    switchImagery().catch(console.error);
  }, [mapType]); // Only depend on mapType

  return (
    <div className="relative w-full h-full">
      <div ref={cesiumContainer} className="w-full h-full" />
      {mousePosition && (
        <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-75 text-white px-2 py-1 rounded text-xs shadow z-30 select-none pointer-events-none" style={{ minWidth: 180, textAlign: 'center', fontSize: '11px', lineHeight: '1.2' }}>
          <span>Lon: <b>{mousePosition.longitude.toFixed(6)}°</b></span> &nbsp;
          <span>Lat: <b>{mousePosition.latitude.toFixed(6)}°</b></span> &nbsp;
          <span>H: <b>{mousePosition.height.toFixed(2)} m</b></span>
        </div>
      )}

      {/* Map Type Switcher */}
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
    </div>
  );
} 