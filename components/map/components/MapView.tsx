'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useViewStateStore } from '@/store/view/viewStateStore';
import { dbLogger } from '@/utils/logging/dbLogger';
import { useAutoZoom } from '../hooks/useAutoZoom';

const SOURCE = 'MapView';

interface MapViewProps {
  accessToken: string;
  style: string;
}

export function MapView({ accessToken, style }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const { viewState2D, setViewState2D } = useViewStateStore();
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null);
  const mountCount = useRef(0);
  const [isMapReady, setIsMapReady] = useState(false);

  useAutoZoom();

  useEffect(() => {
    // Copy the ref to a local variable for use in effect and cleanup
    const localMapContainer = mapContainer.current;
    if (localMapContainer) {
      const rect = localMapContainer.getBoundingClientRect();
      (async () => {
        await dbLogger.debug(SOURCE, 'Map container dimensions', {
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left,
          bottom: rect.bottom,
          right: rect.right
        });
      })();
    }

    mountCount.current += 1;

    (async () => {
      await dbLogger.debug(SOURCE, 'MapView effect starting', {
        hasExistingMap: !!mapInstanceRef.current,
        hasContainer: !!localMapContainer,
        containerInDOM: localMapContainer ? document.body.contains(localMapContainer) : false,
        mountCount: mountCount.current,
        isMapReady
      });

      if (process.env.NODE_ENV === 'development' && mountCount.current === 1) {
        await dbLogger.debug(SOURCE, 'Skipping first mount in development');
        return;
      }

      if (!localMapContainer || !accessToken || !style) {
        await dbLogger.debug(SOURCE, 'MapView initialization skipped - missing requirements', {
          hasContainer: !!localMapContainer,
          hasAccessToken: !!accessToken,
          hasStyle: !!style
        });
        return;
      }

      // Clean up any previous map instance
      if (mapInstanceRef.current) {
        await dbLogger.debug(SOURCE, 'Cleaning up previous map instance');
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        setIsMapReady(false);
      }

      await dbLogger.debug(SOURCE, 'MapView initialization starting', {
        hasAccessToken: !!accessToken,
        accessTokenLength: accessToken?.length,
        accessTokenStart: accessToken?.substring(0, 5),
        style,
        mountCount: mountCount.current
      });

      mapboxgl.accessToken = accessToken;
      setIsMapReady(false);

      try {
        const map = new mapboxgl.Map({
          container: localMapContainer,
          style,
          center: [viewState2D?.longitude ?? 0, viewState2D?.latitude ?? 0],
          zoom: viewState2D?.zoom ?? 1,
          bearing: viewState2D?.bearing ?? 0,
          pitch: viewState2D?.pitch ?? 0,
          attributionControl: false,
          preserveDrawingBuffer: true
        });

        mapInstanceRef.current = map;

        map.on('load', async () => {
          await dbLogger.info(SOURCE, 'Mapbox map loaded', {
            isRemoved: map._removed,
            containerInDOM: localMapContainer ? document.body.contains(localMapContainer) : false,
            mountCount: mountCount.current,
            isStyleLoaded: map.isStyleLoaded()
          });
          // Wait for base style to be loaded
          const checkBaseStyle = async () => {
            if (!map.isStyleLoaded()) {
              await dbLogger.debug(SOURCE, 'Waiting for base style to load');
              map.once('styledata', checkBaseStyle);
              return;
            }
            requestAnimationFrame(async () => {
              await dbLogger.info(SOURCE, 'Base map style loaded and stable');
              setIsMapReady(true);
              map.off('styledata', checkBaseStyle);
            });
          };
          await checkBaseStyle();
        });

        map.on('error', async (error) => {
          const errorMessage = error.error ? error.error.message : 'Unknown error';
          await dbLogger.error(SOURCE, 'Mapbox map error', { error: errorMessage, details: error });
          setIsMapReady(false);
        });

        map.on('moveend', async () => {
          if (!map._removed) {
            const center = map.getCenter();
            const zoom = map.getZoom();
            const bearing = map.getBearing();
            const pitch = map.getPitch();
            setViewState2D({
              longitude: center.lng,
              latitude: center.lat,
              zoom,
              bearing,
              pitch
            });
            await dbLogger.debug(SOURCE, 'Map view state updated', {
              center: [center.lng, center.lat],
              zoom,
              bearing,
              pitch
            });
          }
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during map initialization';
        await dbLogger.error(SOURCE, 'Error initializing Mapbox map', {
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined
        });
        setIsMapReady(false);
      }
    })();

    // Cleanup function
    return () => {
      (async () => {
        await dbLogger.debug(SOURCE, 'Cleanup called', {
          mountCount: mountCount.current,
          hasMap: !!mapInstanceRef.current,
          mapRemoved: mapInstanceRef.current?._removed,
          containerInDOM: localMapContainer ? document.body.contains(localMapContainer) : false,
          isMapReady
        });
        setIsMapReady(false);
        if (process.env.NODE_ENV === 'development' && mountCount.current <= 2) {
          await dbLogger.debug(SOURCE, 'Cleanup skipped - not final unmount');
          return;
        }
        if (mapInstanceRef.current && !mapInstanceRef.current._removed) {
          await dbLogger.info(SOURCE, 'MapView cleanup starting - removing map instance');
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
          await dbLogger.info(SOURCE, 'Mapbox map removed');
        }
      })();
    };
  }, [accessToken, style, viewState2D, setViewState2D, isMapReady]);

  return (
    <div className="relative w-full h-full min-h-[400px]">
      <div 
        ref={mapContainer} 
        className="absolute inset-0 w-full h-full"
        style={{ minHeight: '400px' }}
      />
    </div>
  );
} 