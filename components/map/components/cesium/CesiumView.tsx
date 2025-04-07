'use client';

import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useViewStateStore } from '@/store/view/viewStateStore';
import { useCesium } from '../../context/CesiumContext';
import { LogManager, LogLevel } from '@/core/logging/log-manager';

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
  const { viewState3D, setViewState3D } = useViewStateStore();
  const { getCesiumDefaults, getTerrainProvider } = useCesium();
  const initializationAttempted = useRef(false);

  useEffect(() => {
    const container = cesiumContainer.current;
    if (!container) {
      logger.debug('Container ref not available');
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
        logger.info('CesiumView: Starting initialization process');
        setCesiumStatus('initializing');
        
        // Log container state
        logger.debug('CesiumView: Container state check', {
          hasContainer: !!container,
          containerDimensions: container ? {
            width: container.clientWidth,
            height: container.clientHeight
          } : null
        });

        // Create terrain provider
        logger.debug('CesiumView: Creating terrain provider');
        const terrainProvider = await getTerrainProvider();
        logger.debug('CesiumView: Terrain provider created successfully');
        
        // Create viewer
        logger.info('CesiumView: Creating Cesium viewer');
        const viewer = new Cesium.Viewer(container, {
          terrainProvider,
          ...getCesiumDefaults()
        });
        logger.info('CesiumView: Viewer created successfully');

        // Log viewer state
        logger.debug('CesiumView: Viewer state check', {
          hasScene: !!viewer.scene,
          hasGlobe: !!viewer.scene?.globe,
          hasCamera: !!viewer.camera,
          terrainProvider: !!viewer.terrainProvider
        });

        // Wait for the scene to load
        logger.debug('CesiumView: Waiting for scene to load');
        await new Promise<void>((resolve) => {
          if (viewer.scene.globe.tilesLoaded) {
            logger.debug('CesiumView: Scene already loaded');
            resolve();
          } else {
            const loadHandler = () => {
              if (viewer.scene.globe.tilesLoaded) {
                logger.debug('CesiumView: Scene loaded via event');
                viewer.scene.globe.tileLoadProgressEvent.removeEventListener(loadHandler);
                resolve();
              }
            };
            viewer.scene.globe.tileLoadProgressEvent.addEventListener(loadHandler);
          }
        });

        logger.debug('CesiumView: First frame rendered');

        // Store viewer reference
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
        logger.debug('CesiumView: Updating global state');
        setCesiumInstance(viewer);
        
        // Wait for the scene to be completely stable
        logger.info('CesiumView: Waiting for scene stability');
        await new Promise<void>((resolve) => {
          let frameCount = 0;
          const checkStability = () => {
            if (viewer.scene.globe.tilesLoaded && !viewer.scene.primitives.isDestroyed()) {
              frameCount++;
              if (frameCount === 1) {
                logger.info('CesiumView: Scene stable for 10 frames');
              }
              if (frameCount >= 10) {
                resolve();
                return;
              }
            } else {
              if (frameCount > 0) {
                logger.debug('CesiumView: Scene not stable, resetting frame count');
              }
              frameCount = 0;
            }
            requestAnimationFrame(checkStability);
          };
          checkStability();
        });

        // Now we can mark as ready
        logger.info('CesiumView: Setting status to ready');
        setCesiumStatus('ready');
        logger.info('CesiumView: Cesium viewer fully initialized and stable');

        // Define cleanup function
        cleanup = () => {
          logger.info('CesiumView: Running cleanup for Cesium viewer');
          if (viewer && !viewer.isDestroyed()) {
            viewer.destroy();
            viewerRef.current = null;
            setCesiumInstance(null);
            setCesiumStatus('initializing');
            initializationAttempted.current = false;
            logger.info('CesiumView: Cesium viewer destroyed');
          }
        };
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