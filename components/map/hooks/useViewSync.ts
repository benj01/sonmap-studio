import { useCallback } from 'react';
import * as Cesium from 'cesium';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'useViewSync';
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

export interface ViewState {
  center: [number, number];
  zoom: number;
  pitch?: number;
  bearing?: number;
}

export interface CesiumViewState {
  latitude: number;
  longitude: number;
  height: number;
  heading?: number;
  pitch?: number;
}

export function useViewSync() {
  // Convert Mapbox coordinates to Cesium camera position
  const convert2DTo3D = useCallback((state: ViewState): CesiumViewState => {
    try {
      // Convert zoom level to height
      // Mapbox zoom is logarithmic, roughly following the formula:
      // zoom = log2(earthCircumference / (tileSize * scaleFactor))
      const tileSize = 512; // Mapbox's default tile size
      const earthCircumference = 40075016.686; // Earth's circumference in meters
      const height = earthCircumference / (tileSize * Math.pow(2, state.zoom));

      logger.debug('Converting 2D to 3D view state', {
        from: state,
        height
      });

      return {
        longitude: state.center[0],
        latitude: state.center[1],
        height: height,
        heading: state.bearing ? -state.bearing : 0,
        pitch: state.pitch || 0
      };
    } catch (error) {
      logger.error('Error converting 2D to 3D view state', error);
      // Return a default view state
      return {
        longitude: 0,
        latitude: 0,
        height: 10000000
      };
    }
  }, []);

  // Convert Cesium camera position to Mapbox coordinates
  const convert3DTo2D = useCallback((camera: Cesium.Camera): ViewState => {
    try {
      // Get camera position in cartographic coordinates
      const cartographic = Cesium.Cartographic.fromCartesian(camera.position);
      const longitude = Cesium.Math.toDegrees(cartographic.longitude);
      const latitude = Cesium.Math.toDegrees(cartographic.latitude);

      // Convert height to zoom level
      // Reverse of the formula used in convert2DTo3D
      const tileSize = 512;
      const earthCircumference = 40075016.686;
      const zoom = Math.log2(earthCircumference / (tileSize * cartographic.height));

      // Get camera heading and pitch
      const heading = Cesium.Math.toDegrees(camera.heading);
      const pitch = Cesium.Math.toDegrees(camera.pitch);

      logger.debug('Converting 3D to 2D view state', {
        from: {
          longitude,
          latitude,
          height: cartographic.height,
          heading,
          pitch
        }
      });

      return {
        center: [longitude, latitude],
        zoom: Math.max(0, Math.min(22, zoom)), // Clamp zoom between 0 and 22 (Mapbox limits)
        bearing: -heading,
        pitch: pitch
      };
    } catch (error) {
      logger.error('Error converting 3D to 2D view state', error);
      // Return a default view state
      return {
        center: [0, 0],
        zoom: 1
      };
    }
  }, []);

  // Synchronize views
  const syncViews = useCallback(async (
    from: '2d' | '3d',
    state: ViewState | CesiumViewState,
    mapboxMap?: mapboxgl.Map,
    cesiumViewer?: Cesium.Viewer
  ) => {
    try {
      if (from === '2d' && cesiumViewer) {
        // Convert 2D state to 3D
        const cesiumState = convert2DTo3D(state as ViewState);
        
        // Apply to Cesium
        await new Promise<void>((resolve) => {
          cesiumViewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(
              cesiumState.longitude,
              cesiumState.latitude,
              cesiumState.height
            ),
            orientation: {
              heading: Cesium.Math.toRadians(cesiumState.heading || 0),
              pitch: Cesium.Math.toRadians(cesiumState.pitch || 0),
              roll: 0
            },
            complete: () => resolve(),
            duration: 1 // 1 second transition
          });
        });

      } else if (from === '3d' && mapboxMap) {
        // Convert 3D state to 2D
        const mapboxState = convert3DTo2D(cesiumViewer!.camera);

        // Apply to Mapbox
        await mapboxMap.easeTo({
          center: mapboxState.center,
          zoom: mapboxState.zoom,
          bearing: mapboxState.bearing,
          pitch: mapboxState.pitch,
          duration: 1000 // 1 second transition
        });
      }

      logger.info('View synchronization complete', { from });
    } catch (error) {
      logger.error('Error during view synchronization', error);
    }
  }, [convert2DTo3D, convert3DTo2D]);

  return {
    convert2DTo3D,
    convert3DTo2D,
    syncViews
  };
} 