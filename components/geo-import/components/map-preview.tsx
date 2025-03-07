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
  onProgress?: (progress: number) => void;
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

export function MapPreview({ features, bounds, onFeaturesSelected, onProgress }: MapPreviewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const mapInitialized = useRef(false);
  const [loadedFeatures, setLoadedFeatures] = useState<GeoFeature[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

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
        accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
        preserveDrawingBuffer: true // Improve performance for frequent updates
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

  // Progressive loading of features
  useEffect(() => {
    if (!map.current || !features.length || !mapInitialized.current) return;

    const CHUNK_SIZE = 50;
    let currentChunk = 0;

    const loadNextChunk = () => {
      const start = currentChunk * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, features.length);
      const chunk = features.slice(start, end);

      setLoadedFeatures(prev => [...prev, ...chunk]);
      
      const progress = Math.min(100, (end / features.length) * 100);
      onProgress?.(progress);

      if (end < features.length) {
        currentChunk++;
        requestAnimationFrame(loadNextChunk);
      } else {
        setIsLoading(false);
      }
    };

    setLoadedFeatures([]);
    setIsLoading(true);
    loadNextChunk();
  }, [features]);

  // Update source data and feature states
  useEffect(() => {
    if (!map.current || !loadedFeatures.length || !mapInitialized.current) return;

    const updateMapData = () => {
      const mapInstance = map.current;
      if (!mapInstance) return;

      try {
        const source = mapInstance.getSource('preview') as mapboxgl.GeoJSONSource;
        
        // Create or update source
        const sourceData: GeoJSON.FeatureCollection<GeoJSON.Geometry> = {
          type: 'FeatureCollection',
          features: loadedFeatures.map(f => ({
            type: 'Feature',
            id: f.id,
            geometry: f.geometry,
            properties: { ...f.properties, id: f.id }
          }))
        };

        if (source) {
          source.setData(sourceData);
        } else {
          mapInstance.addSource('preview', {
            type: 'geojson',
            data: sourceData,
            generateId: true // Let Mapbox handle IDs for better performance
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
        }

        // Update feature states
        loadedFeatures.forEach(feature => {
          mapInstance.setFeatureState(
            { source: 'preview', id: feature.id },
            { selected: selectedFeatures.has(feature.id) }
          );
        });

        // Update bounds only when all features are loaded
        if (!isLoading && bounds) {
          mapInstance.fitBounds(
            [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
            { padding: 50, animate: false }
          );
        }
      } catch (error) {
        logger.error('Failed to update map data', error);
      }
    };

    // Wait for map to be ready
    if (map.current.loaded()) {
      updateMapData();
    } else {
      map.current.once('load', updateMapData);
    }
  }, [loadedFeatures, selectedFeatures, bounds, isLoading]);

  return (
    <div className="space-y-2">
      <div 
        ref={mapContainer} 
        className="h-[300px] w-full rounded-md overflow-hidden"
      />
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{isLoading ? `Loading... (${loadedFeatures.length}/${features.length})` : `${features.length} features available`}</span>
        <span>{selectedFeatures.size} features selected</span>
      </div>
    </div>
  );
} 