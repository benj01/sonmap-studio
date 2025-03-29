import { useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import type { GeoJSON } from 'geojson';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'useLayerZoom';
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

type Coordinate = [number, number];
type LineCoordinates = Coordinate[];
type PolygonCoordinates = LineCoordinates[];
type MultiPolygonCoordinates = PolygonCoordinates[];

export function useLayerZoom() {
  const mapboxInstance = useMapInstanceStore(state => state.mapInstances.mapbox.instance);

  const zoomToLayer = useCallback((layerId: string) => {
    if (!mapboxInstance) {
      logger.warn('Map instance not available for zooming');
      return;
    }

    try {
      // Get the source from the layer
      const source = mapboxInstance.getSource(layerId);
      if (!source) {
        logger.warn('Source not found for layer', { layerId });
        return;
      }

      let bounds: mapboxgl.LngLatBounds | undefined;

      // Handle different source types
      if (source.type === 'vector') {
        const vectorSource = source as mapboxgl.VectorTileSource;
        if (vectorSource.bounds) {
          bounds = new mapboxgl.LngLatBounds(
            [vectorSource.bounds[0], vectorSource.bounds[1]],
            [vectorSource.bounds[2], vectorSource.bounds[3]]
          );
        }
      } else if (source.type === 'geojson') {
        const geoJSONSource = source as any;
        const features = geoJSONSource._data?.features;

        if (features?.length) {
          bounds = new mapboxgl.LngLatBounds();
          features.forEach((feature: any) => {
            try {
              let geometry = feature.geometry;
              if (!geometry && feature.geojson) {
                try {
                  geometry = JSON.parse(feature.geojson);
                } catch (parseError) {
                  logger.warn('Failed to parse geojson field', {
                    layerId,
                    featureId: feature.id,
                    error: parseError
                  });
                  return;
                }
              }

              if (!geometry) return;

              const addCoordinate = (coord: Coordinate) => {
                bounds?.extend(coord as mapboxgl.LngLatLike);
              };

              if (geometry.type === 'Point') {
                addCoordinate(geometry.coordinates);
              } else if (geometry.type === 'LineString') {
                geometry.coordinates.forEach(addCoordinate);
              } else if (geometry.type === 'MultiLineString') {
                geometry.coordinates.forEach((line: LineCoordinates) => line.forEach(addCoordinate));
              } else if (geometry.type === 'Polygon') {
                geometry.coordinates.forEach((ring: LineCoordinates) => ring.forEach(addCoordinate));
              } else if (geometry.type === 'MultiPolygon') {
                geometry.coordinates.forEach((polygon: PolygonCoordinates) => 
                  polygon.forEach((ring: LineCoordinates) => ring.forEach(addCoordinate))
                );
              }
            } catch (featureError) {
              logger.warn('Error processing feature geometry', {
                layerId,
                featureId: feature.id,
                error: featureError
              });
            }
          });
        }
      }

      if (bounds && bounds.getNorthEast() && bounds.getSouthWest()) {
        logger.info('Zooming to layer bounds', {
          layerId,
          bounds: {
            ne: bounds.getNorthEast(),
            sw: bounds.getSouthWest()
          }
        });

        mapboxInstance.fitBounds(bounds, {
          padding: 50,
          animate: true,
          duration: 1000,
          maxZoom: 18
        });
      } else {
        logger.warn('No valid bounds found for layer', { layerId });
      }
    } catch (error) {
      logger.error('Error zooming to layer', {
        layerId,
        error: error instanceof Error ? error.message : error
      });
    }
  }, [mapboxInstance]);

  return { zoomToLayer };
} 