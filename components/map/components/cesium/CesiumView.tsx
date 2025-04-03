'use client';

import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useViewStateStore } from '@/store/view/viewStateStore';
import { useCesium } from '../../context/CesiumContext';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'CesiumView';
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

export function CesiumView() {
  const cesiumContainer = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const { setCesiumInstance } = useMapInstanceStore();
  const { viewState3D, setViewState3D } = useViewStateStore();
  const { setViewer, setInitialized } = useCesium();
  const initializationAttempted = useRef(false);

  useEffect(() => {
    const container = cesiumContainer.current;
    if (!container) {
      logger.warn('Container ref not available');
      return;
    }

    // Skip if already attempted initialization
    if (initializationAttempted.current) {
      logger.debug('Initialization already attempted, skipping');
      return;
    }

    initializationAttempted.current = true;
    let cleanup: (() => void) | undefined;

    const initializeViewer = async () => {
      try {
        logger.debug('Starting Cesium viewer initialization');
        
        // First set initialized to false to show we're starting
        setInitialized(false);
        
        const terrainProvider = await Cesium.createWorldTerrainAsync();
        logger.debug('Terrain provider created');
        
        // Create viewer
        const viewer = new Cesium.Viewer(container, {
          terrainProvider,
          animation: false,
          baseLayerPicker: false,
          fullscreenButton: false,
          geocoder: false,
          homeButton: false,
          navigationHelpButton: false,
          sceneModePicker: false,
          timeline: false
        });

        // Wait for the scene to load
        await new Promise<void>((resolve) => {
          if (viewer.scene.globe.tilesLoaded) {
            logger.debug('Scene already loaded');
            resolve();
          } else {
            const loadHandler = () => {
              if (viewer.scene.globe.tilesLoaded) {
                logger.debug('Scene loaded');
                viewer.scene.globe.tileLoadProgressEvent.removeEventListener(loadHandler);
                resolve();
              }
            };
            viewer.scene.globe.tileLoadProgressEvent.addEventListener(loadHandler);
          }
        });

        logger.debug('First frame rendered');

        // Store viewer reference
        viewerRef.current = viewer;

        // Set initial camera position
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(
            viewState3D.longitude,
            viewState3D.latitude,
            viewState3D.height
          )
        });

        // Update camera position when view state changes
        viewer.camera.changed.addEventListener(() => {
          const cartographic = Cesium.Cartographic.fromCartesian(viewer.camera.position);
          const longitude = Cesium.Math.toDegrees(cartographic.longitude);
          const latitude = Cesium.Math.toDegrees(cartographic.latitude);
          const height = cartographic.height;

          setViewState3D({
            longitude,
            latitude,
            height
          });

          logger.debug('Cesium view state updated', {
            longitude,
            latitude,
            height
          });
        });

        // Update global state
        setCesiumInstance(viewer);
        setViewer(viewer);
        
        // Wait for the scene to be completely stable
        await new Promise<void>((resolve) => {
          let frameCount = 0;
          const checkStability = () => {
            if (viewer.scene.globe.tilesLoaded && !viewer.scene.primitives.isDestroyed()) {
              frameCount++;
              if (frameCount >= 10) { // Wait for 10 stable frames
                logger.debug('Scene stable for 10 frames');
                resolve();
                return;
              }
            } else {
              frameCount = 0;
            }
            requestAnimationFrame(checkStability);
          };
          checkStability();
        });

        // Now we can mark as initialized
        setInitialized(true);
        logger.info('Cesium viewer fully initialized and stable');

        // Define cleanup function
        cleanup = () => {
          logger.debug('Running cleanup for Cesium viewer');
          if (viewer && !viewer.isDestroyed()) {
            viewer.destroy();
            viewerRef.current = null;
            setCesiumInstance(null);
            setViewer(null);
            setInitialized(false);
            initializationAttempted.current = false;
            logger.info('Cesium viewer destroyed');
          }
        };
      } catch (error) {
        logger.error('Error initializing Cesium viewer', error);
        setInitialized(false);
        initializationAttempted.current = false;
      }
    };

    initializeViewer();

    // Return cleanup function
    return () => {
      if (cleanup) {
        cleanup();
      }
    };
  }, []); // Empty dependency array since we only want to initialize once

  return (
    <div className="relative w-full h-full">
      <div ref={cesiumContainer} className="absolute inset-0" />
    </div>
  );
} 