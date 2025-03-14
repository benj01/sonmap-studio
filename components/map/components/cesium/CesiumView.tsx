'use client';

import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { useCesium } from '../../context/CesiumContext';
import { configureCesiumForPerformance } from '@/lib/cesium/init';
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

interface CesiumViewProps {
  className?: string;
  initialViewState?: {
    latitude: number;
    longitude: number;
    height: number;
  };
}

export function CesiumView({
  className = '',
  initialViewState = {
    latitude: 0,
    longitude: 0,
    height: 10000000
  }
}: CesiumViewProps) {
  const cesiumContainer = useRef<HTMLDivElement>(null);
  const { setViewer, viewer, isInitialized } = useCesium();

  // Initialize Cesium viewer
  useEffect(() => {
    // Skip if we already have a viewer or if Cesium is not initialized
    if (viewer || !isInitialized) {
      return;
    }

    // Skip if no container
    if (!cesiumContainer.current) {
      logger.debug('No Cesium container available');
      return;
    }

    try {
      logger.info('Initializing Cesium viewer', {
        container: !!cesiumContainer.current,
        initialPosition: initialViewState
      });

      // Create the Cesium viewer
      const cesiumViewer = new Cesium.Viewer(cesiumContainer.current, {
        // Use a local terrain provider instead of Cesium Ion
        terrainProvider: undefined, // We'll set this later with local data
        baseLayerPicker: false, // Disable the base layer picker
        geocoder: false, // Disable the geocoder
        homeButton: false, // Disable the home button
        sceneModePicker: false, // Disable the scene mode picker
        navigationHelpButton: false, // Disable the navigation help button
        animation: false, // Disable the animation widget
        timeline: false, // Disable the timeline widget
        fullscreenButton: false, // Disable the fullscreen button
        infoBox: false, // Disable the info box
        selectionIndicator: false, // Disable the selection indicator
        shadows: false, // Disable shadows for better performance
        shouldAnimate: true // Enable animation
      });

      // Configure for performance
      configureCesiumForPerformance(cesiumViewer);

      // Set initial camera position
      cesiumViewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
          initialViewState.longitude,
          initialViewState.latitude,
          initialViewState.height
        )
      });

      // Set the viewer in context
      setViewer(cesiumViewer);

      logger.info('Cesium viewer initialized successfully');

      return () => {
        // Cleanup is handled by the context
      };
    } catch (error) {
      logger.error('Failed to initialize Cesium viewer', error);
    }
  }, [isInitialized, setViewer, viewer, initialViewState]);

  return (
    <div 
      ref={cesiumContainer} 
      className={`w-full h-full ${className}`}
    />
  );
} 