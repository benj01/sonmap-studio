'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { GeoFeature } from '@/types/geo-import';
import { LogManager } from '@/core/logging/log-manager';

interface MapPreviewProps {
  features: GeoFeature[];
  bounds?: [number, number, number, number];
  onFeaturesSelected?: (featureIds: number[]) => void;
}

const SOURCE = 'MapPreview';
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

export function MapPreview({ features, bounds, onFeaturesSelected }: MapPreviewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const mapInitialized = useRef(false);
  const [selectedFeatures, setSelectedFeatures] = useState<Set<number>>(
    // Initialize with all features selected
    new Set(features.map(f => f.id))
  );

  const handleFeatureClick = useCallback((e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
    if (!e.features?.length) return;

    const feature = e.features[0];
    const featureId = feature.properties?.id as number;
    
    // Toggle selection
    const newSelection = new Set(selectedFeatures);
    if (newSelection.has(featureId)) {
      newSelection.delete(featureId);
      logger.info('Feature deselected', { featureId });
    } else {
      newSelection.add(featureId);
      logger.info('Feature selected', { featureId });
    }
    
    setSelectedFeatures(newSelection);
    onFeaturesSelected?.(Array.from(newSelection));

    // Update feature state
    if (map.current) {
      map.current.setFeatureState(
        { source: 'preview', id: featureId },
        { selected: newSelection.has(featureId) }
      );
    }
  }, [selectedFeatures, onFeaturesSelected]);

  // Initialize map only once
  useEffect(() => {
    if (!mapContainer.current || mapInitialized.current) return;

    try {
      logger.debug('Initializing map');
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [0, 0],
        zoom: 1,
        accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      });

      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
      mapInitialized.current = true;

      // Add click handlers
      ['preview-fill', 'preview-line', 'preview-point'].forEach(layerId => {
        map.current?.on('click', layerId, handleFeatureClick);
        map.current?.on('mouseenter', layerId, () => {
          if (map.current) map.current.getCanvas().style.cursor = 'pointer';
        });
        map.current?.on('mouseleave', layerId, () => {
          if (map.current) map.current.getCanvas().style.cursor = '';
        });
      });

      return () => {
        logger.debug('Cleaning up map');
        map.current?.remove();
        mapInitialized.current = false;
      };
    } catch (error) {
      logger.error('Failed to initialize map');
      mapInitialized.current = false;
    }
  }, []);

  // Update source data and feature states
  useEffect(() => {
    if (!map.current || !features.length || !mapInitialized.current) return;

    const updateMapData = () => {
      const mapInstance = map.current;
      if (!mapInstance) return;

      try {
        const source = mapInstance.getSource('preview') as mapboxgl.GeoJSONSource;
        if (source) {
          // Update existing source data
          logger.debug('Updating source data');
          source.setData({
            type: 'FeatureCollection',
            features: features.map(f => ({
              type: 'Feature',
              id: f.id,
              geometry: f.geometry,
              properties: { ...f.properties, id: f.id }
            }))
          });

          // Update feature states
          features.forEach(feature => {
            mapInstance.setFeatureState(
              { source: 'preview', id: feature.id },
              { selected: selectedFeatures.has(feature.id) }
            );
          });

          // Update bounds if provided
          if (bounds) {
            logger.debug('Fitting to bounds', bounds);
            mapInstance.fitBounds(
              [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
              { padding: 50, animate: false }
            );
          } else {
            // If no bounds provided, fit to the data extent
            const coordinates: number[][] = [];
            features.forEach(feature => {
              if (feature.geometry.type === 'Point') {
                coordinates.push(feature.geometry.coordinates as number[]);
              } else if (feature.geometry.type === 'LineString') {
                coordinates.push(...(feature.geometry.coordinates as number[][]));
              } else if (feature.geometry.type === 'Polygon') {
                coordinates.push(...(feature.geometry.coordinates[0] as number[][]));
              }
            });

            if (coordinates.length > 0) {
              const bbox = coordinates.reduce(
                (bounds, coord) => {
                  bounds.xMin = Math.min(bounds.xMin, coord[0]);
                  bounds.yMin = Math.min(bounds.yMin, coord[1]);
                  bounds.xMax = Math.max(bounds.xMax, coord[0]);
                  bounds.yMax = Math.max(bounds.yMax, coord[1]);
                  return bounds;
                },
                { xMin: Infinity, yMin: Infinity, xMax: -Infinity, yMax: -Infinity }
              );

              logger.debug('Fitting to calculated bounds', bbox);
              mapInstance.fitBounds(
                [[bbox.xMin, bbox.yMin], [bbox.xMax, bbox.yMax]],
                { padding: 50, animate: false }
              );
            }
          }
        } else {
          // Initial setup of source and layers
          logger.info('Setting up initial map layers');
          mapInstance.addSource('preview', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: features.map(f => ({
                type: 'Feature',
                id: f.id,
                geometry: f.geometry,
                properties: { ...f.properties, id: f.id }
              }))
            }
          });

          // Add layers
          const layers = [
            {
              id: 'preview-fill',
              type: 'fill' as const,
              filter: ['==', ['geometry-type'], 'Polygon'],
              paint: {
                'fill-color': ['case', ['boolean', ['feature-state', 'selected'], true], '#4CAF50', '#088'],
                'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], true], 0.8, 0.4]
              }
            },
            {
              id: 'preview-line',
              type: 'line' as const,
              filter: ['==', ['geometry-type'], 'LineString'],
              paint: {
                'line-color': ['case', ['boolean', ['feature-state', 'selected'], true], '#4CAF50', '#088'],
                'line-width': ['case', ['boolean', ['feature-state', 'selected'], true], 3, 2]
              }
            },
            {
              id: 'preview-point',
              type: 'circle' as const,
              filter: ['==', ['geometry-type'], 'Point'],
              paint: {
                'circle-color': ['case', ['boolean', ['feature-state', 'selected'], true], '#4CAF50', '#088'],
                'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], true], 7, 5]
              }
            }
          ];

          layers.forEach(layer => {
            if (!mapInstance.getLayer(layer.id)) {
              mapInstance.addLayer({
                ...layer,
                source: 'preview'
              });
            }
          });

          // Fit to bounds after layers are added
          if (bounds) {
            logger.debug('Fitting to initial bounds', bounds);
            mapInstance.fitBounds(
              [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
              { padding: 50, animate: false }
            );
          }
        }
      } catch (error) {
        logger.error('Failed to update map data');
      }
    };

    // Wait for map to be ready
    if (map.current.loaded()) {
      updateMapData();
    } else {
      map.current.once('load', updateMapData);
    }
  }, [features, bounds, selectedFeatures]);

  return (
    <div className="space-y-2">
      <div 
        ref={mapContainer} 
        className="h-[300px] w-full rounded-md overflow-hidden"
      />
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{features.length} features available</span>
        <span>{selectedFeatures.size} features selected</span>
      </div>
    </div>
  );
} 