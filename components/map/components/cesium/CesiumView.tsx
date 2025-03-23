'use client';

import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useViewStateStore } from '@/store/view/viewStateStore';
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
  const { setCesiumInstance } = useMapInstanceStore();
  const { viewState3D, setViewState3D } = useViewStateStore();

  useEffect(() => {
    const container = cesiumContainer.current;
    if (!container) return;

    const initializeViewer = async () => {
      try {
        const terrainProvider = await Cesium.createWorldTerrainAsync();
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

        setCesiumInstance(viewer);

        return () => {
          if (!viewer.isDestroyed()) {
            viewer.destroy();
            setCesiumInstance(null);
            logger.info('Cesium viewer destroyed');
          }
        };
      } catch (error) {
        logger.error('Error initializing Cesium viewer', error);
      }
    };

    initializeViewer();
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={cesiumContainer} className="absolute inset-0" />
    </div>
  );
} 