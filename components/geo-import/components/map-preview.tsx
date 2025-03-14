'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import type { AnyLayer, LayerSpecification } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { GeoFeature } from '@/types/geo-import';
import { LogManager } from '@/core/logging/log-manager';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

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
  const [validationStats, setValidationStats] = useState<{ total: number; withIssues: number }>({ total: 0, withIssues: 0 });

  const handleFeatureClick = (featureId: number) => {
    if (selectedFeatures.has(featureId)) {
      selectedFeatures.delete(featureId);
      logger.info('Feature deselected', { featureId });
    } else {
      selectedFeatures.add(featureId);
      logger.info('Feature selected', { featureId });
    }
    onFeaturesSelected?.(Array.from(selectedFeatures));
  };

  useEffect(() => {
    if (!mapContainer.current) return;

    logger.debug('Initializing map', {
      featureCount: features.length,
      hasBounds: !!bounds
    });

    try {
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
      ['preview-fill', 'preview-fill-issues', 'preview-line', 'preview-line-issues', 'preview-point', 'preview-point-issues'].forEach(layerId => {
        map.current?.on('click', layerId, (e) => {
          if (e.features?.[0]?.properties?.id) {
            handleFeatureClick(e.features[0].properties.id);
          }
        });
        map.current?.on('mouseenter', layerId, () => {
          if (map.current) map.current.getCanvas().style.cursor = 'pointer';
        });
        map.current?.on('mouseleave', layerId, () => {
          if (map.current) map.current.getCanvas().style.cursor = '';
        });
      });

      return () => {
        logger.debug('Cleaning up map');
        if (map.current) {
          map.current.remove();
          map.current = null;
        }
      };
    } catch (error) {
      logger.error('Failed to initialize map', { error });
    }
  }, [mapContainer]);

  // Progressive loading of features
  useEffect(() => {
    if (!map.current || !features.length || !mapInitialized.current) return;

    const CHUNK_SIZE = 50;
    let currentChunk = 0;
    let totalWithIssues = 0;

    const loadNextChunk = () => {
      const start = currentChunk * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, features.length);
      const chunk = features.slice(start, end);

      // Count features with issues in this chunk
      const chunkWithIssues = chunk.filter(f => f.validation?.hasIssues).length;
      totalWithIssues += chunkWithIssues;

      setLoadedFeatures(prev => [...prev, ...chunk]);
      setValidationStats({
        total: end,
        withIssues: totalWithIssues
      });
      
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
            properties: { 
              ...f.properties,
              id: f.id,
              'geometry-type': f.geometry.type,
              hasIssues: f.validation?.hasIssues || false,
              issues: f.validation?.issues || []
            }
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

          // Add layers for normal features
          const normalLayers: LayerSpecification[] = [
            {
              id: 'preview-fill',
              type: 'fill',
              source: 'preview',
              filter: ['all',
                ['any',
                  ['==', ['get', 'geometry-type'], 'Polygon'],
                  ['==', ['get', 'geometry-type'], 'MultiPolygon']
                ],
                ['==', ['get', 'hasIssues'], false]
              ] as unknown as any[],
              paint: {
                'fill-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#4CAF50', '#088'],
                'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.8, 0.4]
              }
            },
            {
              id: 'preview-line',
              type: 'line',
              source: 'preview',
              filter: ['all',
                ['any',
                  ['==', ['get', 'geometry-type'], 'LineString'],
                  ['==', ['get', 'geometry-type'], 'MultiLineString']
                ],
                ['==', ['get', 'hasIssues'], false]
              ] as unknown as any[],
              paint: {
                'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#4CAF50', '#088'],
                'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 2]
              }
            },
            {
              id: 'preview-point',
              type: 'circle',
              source: 'preview',
              filter: ['all',
                ['any',
                  ['==', ['get', 'geometry-type'], 'Point'],
                  ['==', ['get', 'geometry-type'], 'MultiPoint']
                ],
                ['==', ['get', 'hasIssues'], false]
              ] as unknown as any[],
              paint: {
                'circle-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#4CAF50', '#088'],
                'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 7, 5]
              }
            }
          ];

          // Add layers for features with issues
          const issueLayers: LayerSpecification[] = [
            {
              id: 'preview-fill-issues',
              type: 'fill',
              source: 'preview',
              filter: ['all',
                ['any',
                  ['==', ['get', 'geometry-type'], 'Polygon'],
                  ['==', ['get', 'geometry-type'], 'MultiPolygon']
                ],
                ['==', ['get', 'hasIssues'], true]
              ] as unknown as any[],
              paint: {
                'fill-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#FF5722', '#F44336'],
                'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.8, 0.4]
              }
            },
            {
              id: 'preview-line-issues',
              type: 'line',
              source: 'preview',
              filter: ['all',
                ['any',
                  ['==', ['get', 'geometry-type'], 'LineString'],
                  ['==', ['get', 'geometry-type'], 'MultiLineString']
                ],
                ['==', ['get', 'hasIssues'], true]
              ] as unknown as any[],
              paint: {
                'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#FF5722', '#F44336'],
                'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 2],
                'line-dasharray': [2, 1]
              }
            },
            {
              id: 'preview-point-issues',
              type: 'circle',
              source: 'preview',
              filter: ['all',
                ['any',
                  ['==', ['get', 'geometry-type'], 'Point'],
                  ['==', ['get', 'geometry-type'], 'MultiPoint']
                ],
                ['==', ['get', 'hasIssues'], true]
              ] as unknown as any[],
              paint: {
                'circle-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#FF5722', '#F44336'],
                'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 7, 5],
                'circle-stroke-width': 2,
                'circle-stroke-color': '#000'
              }
            }
          ];

          // Add all layers
          [...normalLayers, ...issueLayers].forEach(layer => {
            if (!mapInstance.getLayer(layer.id)) {
              mapInstance.addLayer(layer);
            }
          });

          // Add popups for features with issues
          const popup = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false
          });

          issueLayers.forEach(layer => {
            mapInstance.on('mouseenter', layer.id, (e) => {
              if (e.features?.[0]) {
                const feature = e.features[0];
                const issues = feature.properties?.issues;
                if (issues) {
                  popup.setLngLat(e.lngLat)
                    .setHTML(`
                      <div class="p-2">
                        <strong>Geometry Issues:</strong>
                        <ul class="list-disc pl-4">
                          ${issues.map((issue: string) => `<li>${issue}</li>`).join('')}
                        </ul>
                      </div>
                    `)
                    .addTo(mapInstance);
                }
              }
            });

            mapInstance.on('mouseleave', layer.id, () => {
              popup.remove();
            });
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
        logger.error('Failed to update map data', {
          error,
          featureCount: features.length
        });
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
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{isLoading ? `Loading... (${loadedFeatures.length}/${features.length})` : `${features.length} features available`}</span>
          <span>{selectedFeatures.size} features selected</span>
        </div>
        {validationStats.withIssues > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {validationStats.withIssues} of {validationStats.total} features have geometry issues. 
              These will be repaired during import using PostGIS.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
} 