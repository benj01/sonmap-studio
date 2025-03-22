'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { MapView } from './MapView';
import { CesiumView } from './cesium/CesiumView';
import { LayerPanel } from './LayerPanel';
import { LayerList } from './LayerList';
import { LogManager } from '@/core/logging/log-manager';
import { useMapStore, ViewState, CesiumViewState } from '@/store/mapStore';
import type { MapState } from '@/store/mapStore';
import { SyncTo3DButton } from './SyncTo3DButton';
import { ResetButton } from './ResetButton';

const SOURCE = 'MapContainer';
const logManager = LogManager.getInstance();

const logger = {
  info: (message: string, data?: any) => {
    logManager.info(SOURCE, message, data);
    console.log(`[${SOURCE}] ${message}`, data);
  },
  warn: (message: string, error?: any) => {
    logManager.warn(SOURCE, message, error);
    console.warn(`[${SOURCE}] ${message}`, error);
  },
  error: (message: string, error?: any) => {
    logManager.error(SOURCE, message, error);
    console.error(`[${SOURCE}] ${message}`, error);
  },
  debug: (message: string, data?: any) => {
    logManager.debug(SOURCE, message, data);
    console.debug(`[${SOURCE}] ${message}`, data);
  }
};

interface MapContainerProps {
  className?: string;
  initialViewState2D?: ViewState;
  initialViewState3D?: CesiumViewState;
  projectId?: string;
}

export function MapContainer({
  className = '',
  initialViewState2D = {
    center: [0, 0],
    zoom: 1,
    pitch: 0,
    bearing: 0
  },
  initialViewState3D = {
    latitude: 0,
    longitude: 0,
    height: 10000000
  },
  projectId
}: MapContainerProps) {
  const [mapboxLoaded, setMapboxLoaded] = useState(false);
  const [cesiumLoaded, setCesiumLoaded] = useState(false);
  const [remountTrigger, setRemountTrigger] = useState(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const unmountingRef = useRef(false);
  const intentionalCleanupRef = useRef(false);

  const {
    viewState2D,
    viewState3D,
    setMapboxInstance,
    setCesiumInstance,
    cleanup
  } = useMapStore();

  // Subscribe to reset events
  useEffect(() => {
    const unsubscribe = useMapStore.subscribe((state: MapState) => {
      // Only trigger remount if it's not an intentional cleanup or unmounting
      // AND if both instances are null (complete reset)
      if (!unmountingRef.current && 
          !intentionalCleanupRef.current && 
          !state.mapboxInstance && 
          !state.cesiumInstance &&
          remountTrigger === 0) { // Only remount if we haven't already triggered a remount
        setRemountTrigger(prev => prev + 1);
        setMapboxLoaded(false);
        setCesiumLoaded(false);
      }
    });

    return () => unsubscribe();
  }, [remountTrigger]);

  const handleMapboxLoad = useCallback(() => {
    if (!unmountingRef.current) {
      setMapboxLoaded(true);
      logger.info('Mapbox map loaded successfully');
    }
  }, []);

  const handleCesiumLoad = useCallback(() => {
    if (!unmountingRef.current) {
      setCesiumLoaded(true);
      logger.info('Cesium viewer loaded successfully');
    }
  }, []);

  // Handle map resize when container becomes visible
  useEffect(() => {
    const container = document.querySelector('.map-container');
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      // Ensure maps are properly sized even when container visibility changes
      if (!unmountingRef.current) {
        requestAnimationFrame(() => {
          const mapboxInstance = useMapStore.getState().mapboxInstance;
          const cesiumInstance = useMapStore.getState().cesiumInstance;
          
          if (mapboxInstance && !mapboxInstance._removed) {
            try {
              mapboxInstance.resize();
            } catch (error) {
              logger.warn('Error resizing Mapbox instance', error);
            }
          }
          if (cesiumInstance) {
            try {
              if (!cesiumInstance.isDestroyed()) {
                cesiumInstance.resize();
              }
            } catch (error) {
              logger.warn('Error resizing Cesium instance', error);
            }
          }
        });
      }
    });

    resizeObserver.observe(container);
    resizeObserverRef.current = resizeObserver;

    // Also handle visibility changes
    const handleVisibilityChange = () => {
      if (!unmountingRef.current && document.visibilityState === 'visible') {
        const mapboxInstance = useMapStore.getState().mapboxInstance;
        const cesiumInstance = useMapStore.getState().cesiumInstance;
        
        if (mapboxInstance && !mapboxInstance._removed) {
          try {
            mapboxInstance.resize();
          } catch (error) {
            logger.warn('Error resizing Mapbox instance', error);
          }
        }
        if (cesiumInstance) {
          try {
            if (!cesiumInstance.isDestroyed()) {
              cesiumInstance.resize();
            }
          } catch (error) {
            logger.warn('Error resizing Cesium instance', error);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Cleanup function
  useEffect(() => {
    return () => {
      unmountingRef.current = true;
      intentionalCleanupRef.current = true;
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      cleanup();
    };
  }, [cleanup]);

  // Reset intentionalCleanupRef when remounting
  useEffect(() => {
    intentionalCleanupRef.current = false;
  }, [remountTrigger]);

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden map-container">
      {/* Map Views Container */}
      <div className="flex-1 flex flex-col gap-4 p-4 bg-background h-full">
        {/* Top row: Layer Panel + 2D Map */}
        <div className="flex gap-4" style={{ height: '45%' }}>
          {/* Layer Panel - Always visible */}
          <div className="w-[300px] border border-border rounded-lg shadow-md overflow-auto bg-background">
            {projectId ? (
              <LayerPanel defaultCollapsed={false}>
                {mapboxLoaded && cesiumLoaded && (
                  <div className="p-4 border-b border-border flex items-center gap-2">
                    <SyncTo3DButton />
                    <ResetButton />
                  </div>
                )}
                <LayerList projectId={projectId} defaultVisibility={true} />
              </LayerPanel>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No project selected
              </div>
            )}
          </div>

          {/* 2D Map View */}
          <div className="flex-1 border border-border rounded-lg shadow-md overflow-hidden">
            <MapView 
              key={`mapbox-${remountTrigger}`}
              initialViewState={viewState2D} 
              onLoad={handleMapboxLoad}
              onMapRef={(map) => {
                if (!unmountingRef.current) {
                  setMapboxInstance(map);
                  // Ensure map is properly sized after ref is set
                  if (map && !map._removed) {
                    requestAnimationFrame(() => {
                      try {
                        map.resize();
                        // Force a style reload to ensure layers are properly displayed
                        if (map.isStyleLoaded()) {
                          const currentStyle = map.getStyle();
                          if (currentStyle) {
                            map.setStyle(currentStyle);
                          }
                        }
                      } catch (error) {
                        logger.warn('Error resizing map or reloading style', error);
                      }
                    });
                  }
                }
              }}
            />
          </div>
        </div>
        
        {/* Bottom row: 3D Map View */}
        <div className="relative border border-border rounded-lg shadow-md overflow-hidden" style={{ height: '55%' }}>
          <CesiumView 
            key={`cesium-${remountTrigger}`}
            initialViewState={viewState3D}
            onLoad={handleCesiumLoad}
            onViewerRef={(viewer) => {
              if (!unmountingRef.current) {
                setCesiumInstance(viewer);
                // Ensure viewer is properly sized after ref is set
                setTimeout(() => {
                  try {
                    if (viewer && !viewer.isDestroyed()) {
                      viewer.resize();
                    }
                  } catch (error) {
                    logger.warn('Error resizing Cesium viewer', error);
                  }
                }, 100);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}