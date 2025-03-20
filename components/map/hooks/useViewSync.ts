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
      // Validate coordinates
      if (!state.center || state.center.length !== 2) {
        throw new Error('Invalid center coordinates');
      }

      const [longitude, latitude] = state.center;
      if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
        throw new Error('Coordinates out of valid range');
      }

      // Convert zoom level to height using a more accurate formula
      // At zoom level 0, one tile covers 360 degrees
      // At zoom level z, one tile covers 360/2^z degrees
      const zoomScale = Math.pow(2, state.zoom);
      const degPerTile = 360 / zoomScale;
      
      // Convert degrees to meters at the given latitude
      const metersPerDegree = 111319.9; // approximately at equator
      const metersPerDegreeAtLat = metersPerDegree * Math.cos(Cesium.Math.toRadians(latitude));
      
      // Calculate height based on field of view and visible extent
      const fovRadians = Cesium.Math.toRadians(60); // Typical FOV
      const visibleExtentMeters = degPerTile * metersPerDegreeAtLat;
      const height = (visibleExtentMeters / 2) / Math.tan(fovRadians / 2);

      // Clamp height to reasonable values (in meters)
      const clampedHeight = Math.max(100, Math.min(height, 20000000));

      logger.debug('Converting 2D to 3D view state', {
        from: state,
        calculatedHeight: height,
        clampedHeight,
        zoom: state.zoom,
        degPerTile,
        visibleExtentMeters
      });

      return {
        longitude,
        latitude,
        height: clampedHeight,
        heading: state.bearing ? -state.bearing : 0,
        pitch: -90 // Always look straight down
      };
    } catch (error) {
      logger.error('Error converting 2D to 3D view state', error);
      return {
        longitude: 0,
        latitude: 0,
        height: 10000000,
        pitch: -90
      };
    }
  }, []);

  // Convert Cesium camera position to Mapbox coordinates
  const convert3DTo2D = useCallback((camera: Cesium.Camera): ViewState => {
    try {
      if (!camera) {
        throw new Error('Camera is null or undefined');
      }

      // Wait for camera to be ready
      if (!camera.position || !camera.direction || !camera.up) {
        throw new Error('Camera is not fully initialized');
      }

      // Get cartesian position
      const cartesian = camera.position;
      if (!Cesium.defined(cartesian)) {
        throw new Error('Camera position is not defined');
      }

      // Convert to cartographic (radians)
      const cartographic = Cesium.Ellipsoid.WGS84.cartesianToCartographic(cartesian);
      if (!cartographic) {
        throw new Error('Failed to convert camera position to cartographic');
      }

      // Convert to degrees and handle wraparound
      let longitude = Cesium.Math.toDegrees(cartographic.longitude);
      let latitude = Cesium.Math.toDegrees(cartographic.latitude);

      // Normalize longitude to [-180, 180]
      longitude = ((longitude + 180) % 360) - 180;

      // Clamp latitude to [-90, 90]
      latitude = Math.max(-90, Math.min(90, latitude));

      // Validate coordinates
      if (!isFinite(longitude) || !isFinite(latitude)) {
        throw new Error(`Invalid coordinates: lon=${longitude}, lat=${latitude}`);
      }

      // Get camera height, ensure it's valid
      const height = cartographic.height;
      if (!isFinite(height) || height <= 0) {
        throw new Error(`Invalid height: ${height}`);
      }

      // Convert height to zoom level (accounting for Web Mercator projection)
      const tileSize = 512;
      const earthCircumference = 40075016.686;
      // Adjust height based on latitude to account for Web Mercator distortion
      const adjustedHeight = height * Math.cos(Cesium.Math.toRadians(latitude));
      const rawZoom = Math.log2(earthCircumference / (tileSize * adjustedHeight));
      const zoom = Math.max(0, Math.min(22, rawZoom)); // Clamp zoom between 0 and 22

      // Get camera heading and pitch
      const heading = Cesium.Math.toDegrees(camera.heading);
      const pitch = Cesium.Math.toDegrees(camera.pitch);

      if (!isFinite(heading) || !isFinite(pitch)) {
        throw new Error(`Invalid heading or pitch: heading=${heading}, pitch=${pitch}`);
      }

      const result = {
        center: [longitude, latitude] as [number, number],
        zoom,
        bearing: -heading,
        pitch: Math.min(85, Math.max(-85, pitch)) // Clamp pitch to Mapbox limits
      };

      logger.debug('Converting 3D to 2D view state', {
        from: {
          cartesian: cartesian.toString(),
          cartographic: cartographic.toString(),
          longitude,
          latitude,
          height,
          adjustedHeight,
          heading,
          pitch
        },
        to: result
      });

      return result;

    } catch (error) {
      // Log the full error details
      logger.error('Error converting 3D to 2D view state', {
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : error,
        cameraState: {
          ready: !!(camera?.position && camera?.direction && camera?.up),
          position: camera?.position?.toString(),
          direction: camera?.direction?.toString(),
          up: camera?.up?.toString(),
          heading: camera?.heading,
          pitch: camera?.pitch
        }
      });

      // Return a safe default state
      return {
        center: [0, 0],
        zoom: 1,
        bearing: 0,
        pitch: 0
      };
    }
  }, []);

  // Synchronize views with smooth transitions
  const syncViews = useCallback(async (
    from: '2d' | '3d',
    state: ViewState | CesiumViewState | Cesium.Camera,
    mapboxMap?: mapboxgl.Map,
    cesiumViewer?: Cesium.Viewer
  ) => {
    try {
      // Validate viewer state before proceeding
      if (!cesiumViewer?.scene?.globe || !cesiumViewer?.camera?.position) {
        logger.warn('Cesium viewer or required components not ready', {
          hasViewer: !!cesiumViewer,
          hasScene: !!cesiumViewer?.scene,
          hasGlobe: !!cesiumViewer?.scene?.globe,
          hasCamera: !!cesiumViewer?.camera,
          hasCameraPosition: !!cesiumViewer?.camera?.position
        });
        return;
      }

      // Add a small delay to ensure viewer is ready
      await new Promise(resolve => setTimeout(resolve, 50));

      if (from === '2d' && cesiumViewer?.scene?.globe && cesiumViewer?.camera) {
        // Convert 2D state to 3D
        const cesiumState = convert2DTo3D(state as ViewState);
        
        // Apply to Cesium with smooth transition
        await new Promise<void>((resolve, reject) => {
          // Validate viewer state again before starting transition
          if (!cesiumViewer?.scene?.globe || !cesiumViewer?.camera?.position) {
            reject(new Error('Cesium viewer components not available during transition'));
            return;
          }

          try {
            logger.debug('Starting camera transition', {
              destination: cesiumState
            });

            cesiumViewer.camera.flyTo({
              destination: Cesium.Cartesian3.fromDegrees(
                cesiumState.longitude,
                cesiumState.latitude,
                cesiumState.height
              ),
              orientation: {
                heading: Cesium.Math.toRadians(cesiumState.heading || 0),
                pitch: Cesium.Math.toRadians(-90), // Always look straight down
                roll: 0
              },
              complete: () => resolve(),
              duration: 2,
              easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT
            });
          } catch (error) {
            reject(new Error(`Failed to execute camera flyTo: ${error instanceof Error ? error.message : 'Unknown error'}`));
          }
        });
      }

      logger.info('View synchronization complete', { from });
    } catch (error) {
      logger.error('Error during view synchronization', error);
      throw error;
    }
  }, [convert2DTo3D]);

  return {
    convert2DTo3D,
    convert3DTo2D,
    syncViews
  };
} 