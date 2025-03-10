import mapboxgl from 'mapbox-gl';
import { logger } from '@/utils/logger';
import { MapConfig } from '@/types/map';

interface MapInitializationProps {
  container: HTMLElement;
  accessToken: string;
  initialCenter: [number, number];
  initialZoom: number;
  defaultStyle: string;
}

const initializeMap = ({
  container,
  accessToken,
  initialCenter,
  initialZoom,
  defaultStyle
}: MapInitializationProps) => {
  logger.debug('Initializing map', {
    container: !!container,
    accessToken: !!accessToken,
    initialCenter,
    initialZoom
  });

  if (!container || !accessToken) {
    logger.error('Cannot initialize map - missing required parameters', {
      hasContainer: !!container,
      hasToken: !!accessToken
    });
    return;
  }

  const map = new mapboxgl.Map({
    container,
    style: defaultStyle,
    center: initialCenter,
    zoom: initialZoom
  });

  map.on('style.load', () => {
    logger.debug('Map style loaded', {
      style: map.getStyle().name,
      center: map.getCenter(),
      zoom: map.getZoom()
    });
  });

  map.on('load', () => {
    logger.debug('Map fully loaded', {
      loaded: map.loaded(),
      styleLoaded: map.isStyleLoaded(),
      center: map.getCenter(),
      zoom: map.getZoom()
    });
  });

  return map;
};

const cleanup = (mapInstance?: mapboxgl.Map) => {
  if (mapInstance) {
    logger.debug('Cleaning up map');
    mapInstance.remove();
  }
};

export { initializeMap, cleanup }; 