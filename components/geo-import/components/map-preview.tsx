'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import type { AnyLayer, LayerSpecification } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { GeoFeature } from '@/types/geo-import';
import { LogManager, LogLevel } from '@/core/logging/log-manager';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

interface MapPreviewProps {
  features: GeoFeature[];
  bounds?: [number, number, number, number];
  selectedFeatureIds: number[];
  onFeaturesSelected?: (featureIdsOrUpdater: number[] | ((prev: number[]) => number[])) => void;
  onProgress?: (progress: number) => void;
}

const SOURCE = 'MapPreview';
const logManager = LogManager.getInstance();

// Ensure debug logs are shown for this component
logManager.setComponentLogLevel(SOURCE, LogLevel.DEBUG);

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

// Helper to flatten coordinates for any geometry type
function flattenCoordinates(geometry: any) {
  if (geometry.type === 'Point') return [geometry.coordinates];
  if (geometry.type === 'GeometryCollection') {
    return geometry.geometries.flatMap(flattenCoordinates);
  }
  // For all other types, flatten deeply
  return geometry.coordinates.flat(Infinity);
}

export function MapPreview({ features, bounds, selectedFeatureIds, onFeaturesSelected, onProgress }: MapPreviewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const mapInitialized = useRef(false);
  const [loadedFeatures, setLoadedFeatures] = useState<GeoFeature[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [validationStats, setValidationStats] = useState<{ total: number; withIssues: number }>({ total: 0, withIssues: 0 });
  // Track if we've already fit to initial bounds
  const didFitInitialBounds = useRef(false);

  const handleFeatureClick = (featureId: number) => {
    onFeaturesSelected?.((prev: number[]) => {
      if (prev.includes(featureId)) {
        logger.info('Feature deselected', { featureId });
        return prev.filter((id: number) => id !== featureId);
      } else {
        logger.info('Feature selected', { featureId });
        return [...prev, featureId];
      }
    });
  };

  // Select all features
  const handleSelectAll = () => {
    const allIds = loadedFeatures.map(f => f.id);
    logger.debug('Select All clicked', {
      allIds,
      loadedFeaturesCount: loadedFeatures.length,
      featuresCount: features.length,
      selectedFeatureIds
    });
    onFeaturesSelected?.(allIds);
  };

  // Deselect all features
  const handleDeselectAll = () => {
    logger.debug('Deselect All clicked', {
      loadedFeaturesCount: loadedFeatures.length,
      featuresCount: features.length,
      selectedFeatureIds
    });
    onFeaturesSelected?.([]);
  };

  // Add a button to zoom to selected features
  const handleZoomToSelected = () => {
    if (!map.current || !loadedFeatures.length || !selectedFeatureIds.length) return;
    const selected = loadedFeatures.filter(f => selectedFeatureIds.includes(f.id));
    if (!selected.length) return;
    // Calculate bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    selected.forEach(f => {
      const coords = flattenCoordinates(f.geometry);
      for (let i = 0; i < coords.length; i += 2) {
        const x = coords[i];
        const y = coords[i + 1];
        if (typeof x === 'number' && typeof y === 'number') {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    });
    if (minX !== Infinity && minY !== Infinity && maxX !== -Infinity && maxY !== -Infinity) {
      map.current.fitBounds(
        [[minX, minY], [maxX, maxY]],
        { padding: 50, animate: true }
      );
    }
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
          if (e.features?.[0]?.properties) {
            logger.debug('Mapbox click event', { layerId, properties: e.features[0].properties });
          }
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
          logger.debug('Map is being removed');
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

      setLoadedFeatures(prev => {
        const updated = [...prev, ...chunk];
        logger.debug('Chunk loaded', {
          chunkStart: start,
          chunkEnd: end,
          chunkLength: chunk.length,
          loadedFeaturesCount: updated.length,
          featuresCount: features.length
        });
        return updated;
      });
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

  // Log after each render
  useEffect(() => {
    logger.debug('Render state', {
      selectedFeatureIds,
      selectedCount: selectedFeatureIds.length,
      loadedFeaturesCount: loadedFeatures.length,
      featuresCount: features.length
    });
  }, [selectedFeatureIds, loadedFeatures, features]);

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
          features: loadedFeatures.map(f => {
            logger.debug('GeoJSON source feature', { id: f.id, previewId: 'previewId' in f ? f.previewId : undefined, properties: f.properties });
            return {
              type: 'Feature',
              id: f.id,
              geometry: f.geometry,
              properties: { 
                ...f.properties,
                id: f.id,
                previewId: 'previewId' in f ? f.previewId : undefined,
                'geometry-type': f.geometry.type,
                hasIssues: f.validation?.hasIssues || false,
                issues: f.validation?.issues || []
              }
            };
          })
        };

        if (source) {
          source.setData(sourceData);
        } else {
          logger.debug('addSource called for preview');
          mapInstance.addSource('preview', {
            type: 'geojson',
            data: sourceData
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
              logger.debug('addLayer called', { layerId: layer.id });
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
          logger.debug('setFeatureState call', {
            id: feature.id,
            selected: !!selectedFeatureIds.includes(feature.id),
            type: feature.geometry.type
          });
          mapInstance.setFeatureState(
            { source: 'preview', id: feature.id },
            { selected: !!selectedFeatureIds.includes(feature.id) }
          );
          const state = mapInstance.getFeatureState({ source: 'preview', id: feature.id });
          logger.debug('getFeatureState result', { id: feature.id, state });
          mapInstance.triggerRepaint();
        });

        // Only fit bounds once on initial load
        if (!didFitInitialBounds.current && !isLoading && bounds) {
          mapInstance.fitBounds(
            [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
            { padding: 50, animate: false }
          );
          didFitInitialBounds.current = true;
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
  }, [loadedFeatures, selectedFeatureIds, bounds, isLoading]);

  // Reset didFitInitialBounds when features or bounds change (e.g. new file)
  useEffect(() => {
    didFitInitialBounds.current = false;
  }, [features, bounds]);

  return (
    <div className="space-y-2">
      <div 
        ref={mapContainer} 
        className="h-[250px] w-full rounded-md overflow-hidden"
        style={{ minHeight: '200px' }}
      />
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{isLoading ? `Loading... (${loadedFeatures.length}/${features.length})` : `${features.length} features available`}</span>
          <span>{selectedFeatureIds.length} features selected</span>
        </div>
        <div className="flex gap-2 mt-2">
          <button onClick={handleSelectAll} className="px-2 py-1 bg-green-100 rounded text-green-800 border border-green-300 text-xs">Select All</button>
          <button onClick={handleDeselectAll} className="px-2 py-1 bg-gray-100 rounded text-gray-800 border border-gray-300 text-xs">Deselect All</button>
          <button onClick={handleZoomToSelected} className="px-2 py-1 bg-blue-100 rounded text-blue-800 border border-blue-300 text-xs">Zoom to selected features</button>
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