import mapboxgl from 'mapbox-gl';
import { dbLogger } from '@/utils/logging/dbLogger';

interface MapInitializationProps {
  container: HTMLElement;
  accessToken: string;
  initialCenter: [number, number];
  initialZoom: number;
  defaultStyle: string;
}

const initializeMap = async ({
  container,
  accessToken,
  initialCenter,
  initialZoom,
  defaultStyle
}: MapInitializationProps): Promise<mapboxgl.Map | undefined> => {
  await dbLogger.debug('Initializing map', {
    container: !!container,
    accessToken: !!accessToken,
    initialCenter,
    initialZoom
  }, { source: 'useMapbox' });

  if (!container || !accessToken) {
    await dbLogger.error('Cannot initialize map - missing required parameters', {
      hasContainer: !!container,
      hasToken: !!accessToken
    }, { source: 'useMapbox' });
    return undefined;
  }

  const map = new mapboxgl.Map({
    container,
    style: defaultStyle,
    center: initialCenter,
    zoom: initialZoom
  });

  map.on('style.load', async () => {
    await dbLogger.debug('Map style loaded', {
      style: map.getStyle().name,
      center: map.getCenter(),
      zoom: map.getZoom()
    }, { source: 'useMapbox' });
  });

  map.on('load', async () => {
    await dbLogger.debug('Map fully loaded', {
      loaded: map.loaded(),
      styleLoaded: map.isStyleLoaded(),
      center: map.getCenter(),
      zoom: map.getZoom()
    }, { source: 'useMapbox' });
  });

  return map;
};

const cleanup = async (mapInstance?: mapboxgl.Map): Promise<void> => {
  if (mapInstance) {
    await dbLogger.debug('Cleaning up map', { mapId: mapInstance.getCanvasContainer().id }, { source: 'useMapbox' });
    mapInstance.remove();
  }
};

export { initializeMap, cleanup }; 