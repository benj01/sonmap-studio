import { useCallback, useEffect } from 'react';
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

      // Convert zoom level to height
      const tileSize = 512;
      const earthCircumference = 40075016.686;
      const height = earthCircumference / (tileSize * Math.pow(2, state.zoom));

      // Clamp height to reasonable values
      const clampedHeight = Math.max(100, Math.min(height, 10000000));

      logger.debug('Converting 2D to 3D view state', {
        from: state,
        height: clampedHeight
      });

      return {
        longitude,
        latitude,
        height: clampedHeight,
        heading: state.bearing ? -state.bearing : 0,
        pitch: state.pitch || 0
      };
    } catch (error) {
      logger.error('Error converting 2D to 3D view state', error);
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
      if (from === '2d' && cesiumViewer) {
        // Convert 2D state to 3D
        const cesiumState = convert2DTo3D(state as ViewState);
        
        // Apply to Cesium with smooth transition
        await new Promise<void>((resolve) => {
          // Set initial view orientation looking straight down
          const heading = cesiumState.heading || 0;
          const pitch = cesiumState.pitch || -90; // Look straight down by default

          cesiumViewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(
              cesiumState.longitude,
              cesiumState.latitude,
              cesiumState.height
            ),
            orientation: {
              heading: Cesium.Math.toRadians(heading),
              pitch: Cesium.Math.toRadians(pitch),
              roll: 0
            },
            complete: () => resolve(),
            duration: 1.5,
            easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT
          });
        });

      } else if (from === '3d' && mapboxMap && cesiumViewer) {
        // When switching from 3D to 2D, we need to:
        // 1. Wait for any ongoing camera movement to complete
        // 2. Ensure we have valid camera state
        // 3. Convert the position with fallbacks

        await new Promise<void>((resolve) => {
          // First, try to use the current camera state
          const tryConversion = () => {
            try {
              // Use our robust convert3DTo2D function
              const mapboxState = convert3DTo2D(cesiumViewer.camera);
              
              // Apply the converted state
              mapboxMap.easeTo({
                center: mapboxState.center,
                zoom: mapboxState.zoom,
                bearing: mapboxState.bearing,
                pitch: mapboxState.pitch,
                duration: 1500,
                easing: (t) => t * (2 - t)
              });
              resolve();
              return true;
            } catch (error) {
              logger.warn('Error during camera conversion, will retry', error);
              return false;
            }
          };

          // If immediate conversion fails, wait a bit and retry
          if (!tryConversion()) {
            let attempts = 0;
            const maxAttempts = 5;
            const retryInterval = setInterval(() => {
              attempts++;
              if (tryConversion() || attempts >= maxAttempts) {
                clearInterval(retryInterval);
                if (attempts >= maxAttempts) {
                  // If all attempts fail, use a default view
                  logger.warn('Failed to convert camera state after max attempts, using default view');
                  mapboxMap.easeTo({
                    center: [0, 0],
                    zoom: 1,
                    bearing: 0,
                    pitch: 0,
                    duration: 1500
                  });
                  resolve();
                }
              }
            }, 100);
          }
        });
      }

      logger.info('View synchronization complete', { from });
    } catch (error) {
      logger.error('Error during view synchronization', error);
    }
  }, [convert2DTo3D, convert3DTo2D]);

  // Hook to handle camera movement events
  const useCameraSync = useCallback((
    currentView: '2d' | '3d',
    mapboxMap?: mapboxgl.Map,
    cesiumViewer?: Cesium.Viewer
  ) => {
    useEffect(() => {
      if (!mapboxMap || !cesiumViewer) return;

      let isMoving = false;
      let moveTimeout: NodeJS.Timeout;
      let isInitialized = false;

      // Initialize camera sync after a short delay to ensure camera is ready
      const initTimeout = setTimeout(() => {
        isInitialized = true;
        // Sync initial view if needed
        if (currentView === '3d') {
          const center = mapboxMap.getCenter();
          const state = {
            center: [center.lng, center.lat] as [number, number],
            zoom: mapboxMap.getZoom(),
            pitch: -90, // Start looking straight down
            bearing: mapboxMap.getBearing()
          };
          syncViews('2d', state, mapboxMap, cesiumViewer);
        }
      }, 500); // Wait for camera to be fully initialized

      // Handle Mapbox camera movement
      const handleMapboxMove = () => {
        if (currentView !== '2d' || !isInitialized) return;
        
        isMoving = true;
        clearTimeout(moveTimeout);
        
        moveTimeout = setTimeout(() => {
          if (!isMoving) return;
          
          const center = mapboxMap.getCenter();
          const state = {
            center: [center.lng, center.lat] as [number, number],
            zoom: mapboxMap.getZoom(),
            pitch: mapboxMap.getPitch(),
            bearing: mapboxMap.getBearing()
          };
          
          syncViews('2d', state, mapboxMap, cesiumViewer);
          isMoving = false;
        }, 150);
      };

      // Handle Cesium camera movement
      const handleCesiumMove = () => {
        if (currentView !== '3d' || !isInitialized) return;
        
        isMoving = true;
        clearTimeout(moveTimeout);
        
        moveTimeout = setTimeout(() => {
          if (!isMoving) return;
          
          syncViews('3d', cesiumViewer.camera, mapboxMap, cesiumViewer);
          isMoving = false;
        }, 150);
      };

      // Add event listeners
      mapboxMap.on('moveend', handleMapboxMove);
      if (cesiumViewer.camera) {
        cesiumViewer.camera.changed.addEventListener(handleCesiumMove);
      }

      // Cleanup
      return () => {
        clearTimeout(initTimeout);
        clearTimeout(moveTimeout);
        mapboxMap.off('moveend', handleMapboxMove);
        if (cesiumViewer.camera) {
          cesiumViewer.camera.changed.removeEventListener(handleCesiumMove);
        }
      };
    }, [currentView, mapboxMap, cesiumViewer, syncViews]);
  }, [syncViews]);

  return {
    convert2DTo3D,
    convert3DTo2D,
    syncViews,
    useCameraSync
  };
} 