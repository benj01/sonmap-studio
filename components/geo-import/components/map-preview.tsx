'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { GeoFeature } from '@/types/geo-import';

interface MapPreviewProps {
  features: GeoFeature[];
  bounds?: [number, number, number, number];
  onFeaturesSelected?: (featureIds: number[]) => void;
}

export function MapPreview({ features, bounds, onFeaturesSelected }: MapPreviewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [selectedFeatures, setSelectedFeatures] = useState<Set<number>>(new Set());

  const handleFeatureClick = useCallback((e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
    if (!e.features?.length) return;

    const feature = e.features[0];
    const featureId = feature.properties?.id as number;
    
    // Toggle selection
    const newSelection = new Set(selectedFeatures);
    if (newSelection.has(featureId)) {
      newSelection.delete(featureId);
    } else {
      newSelection.add(featureId);
    }
    
    setSelectedFeatures(newSelection);
    onFeaturesSelected?.(Array.from(newSelection));

    // Update feature state
    if (map.current) {
      map.current.setFeatureState(
        { source: 'preview', id: featureId },
        { selected: !selectedFeatures.has(featureId) }
      );
    }
  }, [selectedFeatures, onFeaturesSelected]);

  useEffect(() => {
    if (!mapContainer.current) return;

    // Initialize map
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [0, 0],
      zoom: 1,
      accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Clean up on unmount
    return () => {
      map.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (!map.current || !features.length) return;

    // Wait for map to load
    map.current.on('load', () => {
      const mapInstance = map.current;
      if (!mapInstance) return;

      // Add source
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

      // Add layers with selection states
      mapInstance.addLayer({
        id: 'preview-fill',
        type: 'fill',
        source: 'preview',
        paint: {
          'fill-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            '#4CAF50',
            '#088'
          ],
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            0.8,
            0.4
          ]
        },
        filter: ['==', ['geometry-type'], 'Polygon']
      });

      mapInstance.addLayer({
        id: 'preview-line',
        type: 'line',
        source: 'preview',
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            '#4CAF50',
            '#088'
          ],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            3,
            2
          ]
        },
        filter: ['==', ['geometry-type'], 'LineString']
      });

      mapInstance.addLayer({
        id: 'preview-point',
        type: 'circle',
        source: 'preview',
        paint: {
          'circle-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            '#4CAF50',
            '#088'
          ],
          'circle-radius': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            7,
            5
          ]
        },
        filter: ['==', ['geometry-type'], 'Point']
      });

      // Add click handlers
      mapInstance.on('click', 'preview-fill', handleFeatureClick);
      mapInstance.on('click', 'preview-line', handleFeatureClick);
      mapInstance.on('click', 'preview-point', handleFeatureClick);

      // Change cursor on hover
      mapInstance.on('mouseenter', 'preview-fill', () => {
        mapInstance.getCanvas().style.cursor = 'pointer';
      });
      mapInstance.on('mouseleave', 'preview-fill', () => {
        mapInstance.getCanvas().style.cursor = '';
      });
      mapInstance.on('mouseenter', 'preview-line', () => {
        mapInstance.getCanvas().style.cursor = 'pointer';
      });
      mapInstance.on('mouseleave', 'preview-line', () => {
        mapInstance.getCanvas().style.cursor = '';
      });
      mapInstance.on('mouseenter', 'preview-point', () => {
        mapInstance.getCanvas().style.cursor = 'pointer';
      });
      mapInstance.on('mouseleave', 'preview-point', () => {
        mapInstance.getCanvas().style.cursor = '';
      });

      // Fit bounds if available
      if (bounds) {
        mapInstance.fitBounds(
          [
            [bounds[0], bounds[1]],
            [bounds[2], bounds[3]]
          ],
          { padding: 50 }
        );
      }
    });
  }, [features, bounds, handleFeatureClick]);

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