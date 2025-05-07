'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import type { AnyLayer } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { GeoFeature } from '@/types/geo-import';
import { LogManager, LogLevel } from '@/core/logging/log-manager';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import bbox from '@turf/bbox';
import { dbLogger } from '@/utils/logging/dbLogger';

interface MapPreviewProps {
  features: GeoFeature[];
  bounds?: [number, number, number, number];
  selectedFeatureIds: number[];
  onFeaturesSelected?: (featureIdsOrUpdater: number[] | ((prev: number[]) => number[])) => void;
  onProgress?: (progress: number) => void;
}

const SOURCE = 'MapPreview';
const logManager = LogManager.getInstance();

// Set to INFO level for better visibility
logManager.setComponentLogLevel(SOURCE, LogLevel.INFO);

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

// Add these constants for debugging purposes
const DEBUG_USE_FALLBACK_GEOJSON = false; // Set to true to test with hardcoded GeoJSON
const DEBUG_SWAP_COORDINATES = false; // Set to true to test swapping coordinate order

// Define a valid fallback GeoJSON for testing
const FALLBACK_GEOJSON: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 1,
      geometry: {
        type: 'Point',
        coordinates: [8.5, 47.0] // Known good coordinates in Switzerland
      },
      properties: { id: 1, 'geometry-type': 'Point', hasIssues: false }
    },
    {
      type: 'Feature',
      id: 2,
      geometry: {
        type: 'LineString',
        coordinates: [
          [8.5, 47.0],
          [8.6, 47.1]
        ]
      },
      properties: { id: 2, 'geometry-type': 'LineString', hasIssues: false }
    }
  ]
};

// Allowed Mapbox layer types
// https://docs.mapbox.com/mapbox-gl-js/style-spec/layers/
type MapboxLayerType =
  | 'fill'
  | 'line'
  | 'circle'
  | 'symbol'
  | 'raster'
  | 'model'
  | 'slot'
  | 'heatmap'
  | 'fill-extrusion'
  | 'raster-particle'
  | 'hillshade'
  | 'background'
  | 'sky'
  | 'clip';

interface LayerSpecification {
  id: string;
  type: MapboxLayerType;
  source: string;
  filter?: any[];
  paint?: Record<string, any>;
  layout?: Record<string, any>;
}

// Helper to flatten coordinates for any geometry type
function flattenCoordinates(geometry: any) {
  if (geometry.type === 'Point') return [geometry.coordinates];
  if (geometry.type === 'GeometryCollection') {
    return geometry.geometries.flatMap(flattenCoordinates);
  }
  // For all other types, flatten deeply
  return geometry.coordinates.flat(Infinity);
}

// Add a specific validation function after the sanitizeCoordinates function
const sanitizeCoordinates = (coords: any): any => {
  if (Array.isArray(coords)) {
    if (coords.length === 0) return coords;
    
    if (typeof coords[0] === 'number') {
      if (coords.length >= 2) {
        const [x, y] = coords;
        if (isNaN(x) || isNaN(y)) {
          logManager.warn(SOURCE, 'Found invalid coordinates, using fallback', { coords });
          return [8.5, 47.0];
        }
      }
      return coords;
    } else {
      return coords.map(sanitizeCoordinates);
    }
  }
  return coords;
};

// Add a special validation function to ensure coordinates are valid for Mapbox
const ensureValidMapboxCoordinates = (feature: any): any => {
  if (!feature || !feature.geometry) return feature;
  
  const validateCoordPair = (coord: any): [number, number] => {
    // Ensure coordinates are valid numbers and in proper range
    if (!Array.isArray(coord) || coord.length < 2) {
      return [8.5, 47.0]; // Default to Switzerland
    }
    
    let [lng, lat] = coord;
    
    // Fix NaN values
    if (isNaN(lng) || isNaN(lat)) {
      return [8.5, 47.0];
    }
    
    // Check if values appear to be reversed
    if (Math.abs(lng) > 90 && Math.abs(lat) <= 180) {
      // These might be reversed (Lat/Lng instead of Lng/Lat)
      [lng, lat] = [lat, lng];
    }
    
    // Ensure values are in valid ranges for WGS84
    lng = Math.max(-180, Math.min(180, lng));
    lat = Math.max(-90, Math.min(90, lat));
    
    return [lng, lat];
  };
  
  const validateCoords = (coords: any): any => {
    if (!coords) return coords;
    
    if (!Array.isArray(coords)) return coords;
    
    if (coords.length === 0) return coords;
    
    // Check if this is a single coordinate pair
    if (typeof coords[0] === 'number') {
      return validateCoordPair(coords);
    }
    
    // Otherwise it's an array of coordinates or arrays of coordinates
    return coords.map(validateCoords);
  };
  
  // Clone to avoid mutations
  const safeFeature = { ...feature };
  
  if (safeFeature.geometry && 'coordinates' in safeFeature.geometry) {
    const originalCoords = safeFeature.geometry.coordinates;
    const validatedCoords = validateCoords(originalCoords);
    
    // Only log if we made changes
    if (JSON.stringify(originalCoords) !== JSON.stringify(validatedCoords)) {
      logManager.info(SOURCE, 'Corrected invalid coordinates', {
        featureId: safeFeature.id,
        geometryType: safeFeature.geometry.type,
        originalSample: JSON.stringify(originalCoords).substring(0, 100) + '...',
        correctedSample: JSON.stringify(validatedCoords).substring(0, 100) + '...'
      });
    }
    
    safeFeature.geometry.coordinates = validatedCoords;
  }
  
  return safeFeature;
};

export function MapPreview({ features, bounds, selectedFeatureIds, onFeaturesSelected, onProgress }: MapPreviewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const mapInitialized = useRef(false);
  const [loadedFeatures, setLoadedFeatures] = useState<GeoFeature[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [validationStats, setValidationStats] = useState<{ total: number; withIssues: number }>({ total: 0, withIssues: 0 });
  const [mapError, setMapError] = useState<string | null>(null);
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

  const handleDeselectAll = () => {
    logger.debug('Deselect All clicked', {
      loadedFeaturesCount: loadedFeatures.length,
      featuresCount: features.length,
      selectedFeatureIds
    });
    onFeaturesSelected?.([]);
  };

  const handleZoomToSelected = () => {
    if (!map.current || !loadedFeatures.length || !selectedFeatureIds.length) return;
    const selected = loadedFeatures.filter(f => selectedFeatureIds.includes(f.id));
    if (!selected.length) return;
    const coords = selected.map(f => flattenCoordinates(f.geometry)).flat();
    if (coords.length < 4) return;
    map.current.fitBounds(
      [[coords[0], coords[1]], [coords[2], coords[3]]],
      { padding: 50, animate: true }
    );
  };

  useEffect(() => {
    if (!mapContainer.current) return;

    setMapError(null);

    logger.debug('Initializing map', {
      featureCount: features.length,
      hasBounds: !!bounds
    });

    try {
      const handleMapInitializationError = async (error: any) => {
        const errorMessage = error?.message || 'Unknown map initialization error';
        await dbLogger.error(SOURCE, 'Map initialization error', { 
          error, 
          message: errorMessage,
          stack: error.stack
        });
        setMapError(`Map initialization failed: ${errorMessage}`);
      };

      window.addEventListener('error', handleMapInitializationError);

      if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
        const tokenError = "Missing Mapbox token. Please check your environment variables.";
        (async () => {
          await dbLogger.error(SOURCE, tokenError);
        })();
        setMapError(tokenError);
        return;
      }

      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [0, 0],
        zoom: 1,
        accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
        preserveDrawingBuffer: true
      });

      map.current.on('error', (e) => {
        const errorMessage = e.error?.message || 'Unknown mapbox error';
        dbLogger.error(SOURCE, 'Mapbox runtime error', {
          error: e.error,
          message: errorMessage
        });
        setMapError(`Map error: ${errorMessage}`);
      });

      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
      mapInitialized.current = true;

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
        window.removeEventListener('error', handleMapInitializationError);
        
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

  useEffect(() => {
    if (!map.current || !features.length || !mapInitialized.current) return;

    const CHUNK_SIZE = 50;
    let currentChunk = 0;
    let totalWithIssues = 0;

    const loadNextChunk = () => {
      const start = currentChunk * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, features.length);
      const chunk = features.slice(start, end);

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

  useEffect(() => {
    logger.debug('Render state', {
      selectedFeatureIds,
      selectedCount: selectedFeatureIds.length,
      loadedFeaturesCount: loadedFeatures.length,
      featuresCount: features.length
    });
  }, [selectedFeatureIds, loadedFeatures, features]);

  useEffect(() => {
    if (!map.current || !loadedFeatures.length || !mapInitialized.current) return;

    const updateMapData = async () => {
      const mapInstance = map.current;
      if (!mapInstance) return;

      try {
        if (loadedFeatures.length > 0) {
          const sampleFeatures = loadedFeatures.slice(0, Math.min(3, loadedFeatures.length));
          for (const [index, feature] of sampleFeatures.entries()) {
            await dbLogger.info(SOURCE, `Feature ${index} details:`, {
              id: feature.id,
              geometryType: feature.geometry.type
            });
            if (feature.geometry.type === 'Point' && 'coordinates' in feature.geometry) {
              const coords = feature.geometry.coordinates;
              await dbLogger.info(SOURCE, `Feature ${index} Point coordinates:`, { coordinates: coords });
              if (Array.isArray(coords) && coords.length >= 2) {
                const [lng, lat] = coords;
                await dbLogger.info(SOURCE, `Feature ${index} coordinate validation:`, {
                  lng, lat,
                  isLngValid: lng >= -180 && lng <= 180,
                  isLatValid: lat >= -90 && lat <= 90,
                  isInWGS84Range: lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90
                });
              }
            } else if ((feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiPoint') && 
                        'coordinates' in feature.geometry) {
              const coords = feature.geometry.coordinates.slice(0, 3);
              await dbLogger.info(SOURCE, `Feature ${index} ${feature.geometry.type} coordinates (first 3 points):`, { 
                coordinates: coords
              });
              if (Array.isArray(coords) && coords.length > 0 && Array.isArray(coords[0]) && coords[0].length >= 2) {
                const [lng, lat] = coords[0];
                await dbLogger.info(SOURCE, `Feature ${index} first point validation:`, {
                  lng, lat,
                  isLngValid: lng >= -180 && lng <= 180,
                  isLatValid: lat >= -90 && lat <= 90,
                  isInWGS84Range: lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90
                });
              }
            }
          }
        }

        const source = mapInstance.getSource('preview') as mapboxgl.GeoJSONSource;
        
        let sourceData: GeoJSON.FeatureCollection<GeoJSON.Geometry>;

        if (DEBUG_USE_FALLBACK_GEOJSON) {
          await dbLogger.info(SOURCE, 'Using fallback GeoJSON for debugging', { fallbackGeoJSON: FALLBACK_GEOJSON });
          sourceData = FALLBACK_GEOJSON as GeoJSON.FeatureCollection<GeoJSON.Geometry>;
        } else {
          const basicFeatures = [];
          for (const f of loadedFeatures) {
            const feature = {
              type: 'Feature' as const,
              id: f.id,
              geometry: { ...f.geometry },
              properties: { 
                ...f.properties,
                id: f.id,
                previewId: 'previewId' in f ? f.previewId : undefined,
                'geometry-type': f.geometry.type,
                hasIssues: f.validation?.hasIssues || false,
                issues: f.validation?.issues || []
              }
            };
            // Apply coordinate swapping for debugging if enabled
            if (DEBUG_SWAP_COORDINATES) {
              if (feature.geometry.type === 'Point' && 'coordinates' in feature.geometry) {
                const [lng, lat] = feature.geometry.coordinates as [number, number];
                await dbLogger.info(SOURCE, 'Swapping Point coordinates for debugging', {
                  original: [lng, lat],
                  swapped: [lat, lng]
                });
                feature.geometry.coordinates = [lat, lng];
              }
              else if ((feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiPoint') && 
                        'coordinates' in feature.geometry) {
                const coords = feature.geometry.coordinates as [number, number][];
                await dbLogger.info(SOURCE, `Swapping ${feature.geometry.type} coordinates for debugging`, {
                  original: coords.slice(0, 2),
                  swapped: coords.slice(0, 2).map(([lng, lat]) => [lat, lng])
                });
                feature.geometry.coordinates = coords.map(([lng, lat]) => [lat, lng]);
              }
            }
            // Apply any other needed transformations
            if (feature.geometry && 'coordinates' in feature.geometry) {
              feature.geometry.coordinates = sanitizeCoordinates(feature.geometry.coordinates);
            }
            basicFeatures.push(feature);
          }
          
          // Now apply the final validation to ensure Mapbox-compatible coordinates
          const validatedFeatures = basicFeatures.map(ensureValidMapboxCoordinates);
          
          // Construct the final GeoJSON object
          sourceData = {
            type: 'FeatureCollection',
            features: validatedFeatures
          };
        }

        // Instead of logging the full GeoJSON object, log only a concise summary
        const geometryTypes = [...new Set(sourceData.features.map(f => f.geometry.type))];
        const sampleFeature = sourceData.features[0];
        let firstCoords: any = undefined;
        if (
          sampleFeature &&
          sampleFeature.geometry &&
          sampleFeature.geometry.type !== 'GeometryCollection' &&
          'coordinates' in sampleFeature.geometry
        ) {
          const coords = (sampleFeature.geometry as any).coordinates;
          firstCoords = Array.isArray(coords)
            ? (Array.isArray(coords[0]) ? coords[0].slice(0, 2) : coords.slice(0, 2))
            : undefined;
        }
        const summary = {
          featureCount: sourceData.features.length,
          geometryTypes,
          sampleFeature: sampleFeature
            ? {
                id: sampleFeature.id,
                geometryType: sampleFeature.geometry.type,
                firstCoords,
                properties: {
                  OBJECTID: sampleFeature.properties?.OBJECTID,
                  OBJEKTART: sampleFeature.properties?.OBJEKTART,
                  id: sampleFeature.properties?.id
                }
              }
            : null
        };
        await dbLogger.info(SOURCE, 'GeoJSON summary for Mapbox', summary);

        // Add a specific check for coordinate order issues in the first few features
        if (sourceData.features.length > 0) {
          const sampleCoords = [];
          
          // Extract coordinates from the first 3 features for analysis
          for (let i = 0; i < Math.min(3, sourceData.features.length); i++) {
            const feature = sourceData.features[i];
            if (feature.geometry && 'coordinates' in feature.geometry) {
              let coordSample;
              
              switch (feature.geometry.type) {
                case 'Point':
                  coordSample = feature.geometry.coordinates;
                  break;
                case 'LineString':
                case 'MultiPoint':
                  coordSample = feature.geometry.coordinates[0];
                  break;
                case 'Polygon':
                case 'MultiLineString':
                  coordSample = feature.geometry.coordinates[0]?.[0];
                  break;
                case 'MultiPolygon':
                  coordSample = feature.geometry.coordinates[0]?.[0]?.[0];
                  break;
                default:
                  coordSample = null;
              }
              
              if (Array.isArray(coordSample) && coordSample.length >= 2) {
                sampleCoords.push({
                  featureId: feature.id,
                  geomType: feature.geometry.type,
                  coordinates: coordSample,
                  analysis: {
                    isFirstLng: coordSample[0] >= -180 && coordSample[0] <= 180,
                    isFirstLat: coordSample[0] >= -90 && coordSample[0] <= 90,
                    isSecondLng: coordSample[1] >= -180 && coordSample[1] <= 180,
                    isSecondLat: coordSample[1] >= -90 && coordSample[1] <= 90,
                    suspectedFormat: (coordSample[0] >= -180 && coordSample[0] <= 180 && 
                                     coordSample[1] >= -90 && coordSample[1] <= 90) 
                                     ? "Appears to be [lng, lat] (correct)"
                                     : (coordSample[1] >= -180 && coordSample[1] <= 180 && 
                                        coordSample[0] >= -90 && coordSample[0] <= 90)
                                        ? "May be [lat, lng] (reversed)"
                                        : "Coordinates outside normal WGS84 ranges"
                  }
                });
              }
            }
          }
          
          if (sampleCoords.length > 0) {
            await dbLogger.info(SOURCE, 'Coordinate order analysis', { 
              samples: sampleCoords,
              conclusion: sampleCoords.every(s => s.analysis.suspectedFormat === "Appears to be [lng, lat] (correct)")
                ? "All sampled coordinates appear to be in correct [longitude, latitude] format"
                : "Some coordinates may be in wrong order or outside normal ranges"
            });
          }
        }

        // Add a highly visible debug log before passing data to Mapbox (log raw string directly)
        try {
          // Only log this in debug mode, and truncate/clean the output
          const debugDump = JSON.stringify(sourceData, null, 2).slice(0, 2000);
          // This log is intentionally debug-level to avoid log spam. Enable debug for 'MapPreview' to see full dumps.
          await dbLogger.debug('MAPBOX GEOJSON RAW DUMP STRING (truncated sample)', debugDump);
        } catch (err) {
          await dbLogger.debug('MAPBOX GEOJSON RAW DUMP STRING FAILED TO STRINGIFY', String(err));
        }

        // --- Start: Remove existing preview layers and source ---
        const previewLayerIds = [
          'preview-fill', 'preview-fill-issues',
          'preview-line', 'preview-line-issues',
          'preview-point', 'preview-point-issues'
        ];
        for (const layerId of previewLayerIds) {
          if (mapInstance.getLayer(layerId)) {
            try {
              mapInstance.removeLayer(layerId);
              await dbLogger.info(SOURCE, 'Removed existing layer', { layerId });
            } catch (err) {
              await dbLogger.warn(SOURCE, 'Failed to remove layer', { layerId, error: err });
            }
          }
        }
        if (mapInstance.getSource('preview')) {
          try {
            mapInstance.removeSource('preview');
            await dbLogger.info(SOURCE, 'Removed existing source', { sourceId: 'preview' });
          } catch (err) {
            await dbLogger.warn(SOURCE, 'Failed to remove source', { sourceId: 'preview', error: err });
          }
        }
        // --- End: Remove existing preview layers and source ---

        // Add the new source with the fresh GeoJSON data
        try {
          mapInstance.addSource('preview', {
            type: 'geojson',
            data: sourceData
          });
          await dbLogger.info(SOURCE, 'Added new preview source');
        } catch (err) {
          await dbLogger.error(SOURCE, 'Failed to add new preview source', { error: err });
          return;
        }

        // Add the layers back
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

        for (const layer of [...normalLayers, ...issueLayers]) {
          try {
            mapInstance.addLayer(layer as AnyLayer);
          } catch (err) {
            await dbLogger.warn(SOURCE, 'Failed to add layer', { layerId: layer.id, error: err });
          }
        }

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

        for (const feature of loadedFeatures) {
          await dbLogger.debug('setFeatureState call', {
            id: feature.id,
            selected: !!selectedFeatureIds.includes(feature.id),
            type: feature.geometry.type
          });
          mapInstance.setFeatureState(
            { source: 'preview', id: feature.id },
            { selected: !!selectedFeatureIds.includes(feature.id) }
          );
          const state = mapInstance.getFeatureState({ source: 'preview', id: feature.id });
          await dbLogger.debug('getFeatureState result', { id: feature.id, state });
          mapInstance.triggerRepaint();
        }

        if (!didFitInitialBounds.current && !isLoading && bounds) {
          try {
            const calculatedBbox = bbox(sourceData);
            if (
              calculatedBbox &&
              calculatedBbox.length === 4 &&
              calculatedBbox.every(coord => typeof coord === 'number' && isFinite(coord)) &&
              calculatedBbox[1] >= -90 && calculatedBbox[1] <= 90 &&
              calculatedBbox[3] >= -90 && calculatedBbox[3] <= 90
            ) {
              const mapboxBounds = [
                [calculatedBbox[0], calculatedBbox[1]],
                [calculatedBbox[2], calculatedBbox[3]]
              ] as [mapboxgl.LngLatLike, mapboxgl.LngLatLike];
              mapInstance.fitBounds(mapboxBounds, { padding: 50, duration: 0 });
              didFitInitialBounds.current = true;
              await dbLogger.info(SOURCE, 'fitBounds successful', { bounds: mapboxBounds });
            } else {
              await dbLogger.warn(SOURCE, 'Invalid calculated bounds, skipping fitBounds', { calculatedBbox });
            }
          } catch (boundsError) {
            await dbLogger.error(SOURCE, 'Error calculating or using bounds', { error: boundsError });
          }
        }
      } catch (error) {
        await dbLogger.error(SOURCE, 'Failed to update map data', {
          error: error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : error,
          featureCount: features.length
        });
      }
    };

    if (map.current.loaded()) {
      (async () => { await updateMapData(); })();
    } else {
      map.current.once('load', updateMapData);
    }
  }, [loadedFeatures, selectedFeatureIds, bounds, isLoading]);

  useEffect(() => {
    didFitInitialBounds.current = false;
  }, [features, bounds]);

  return (
    <div className="space-y-2">
      <div 
        ref={mapContainer} 
        className="h-[250px] w-full rounded-md overflow-hidden relative"
        style={{ minHeight: '200px' }}
      >
        {mapError && (
          <div className="absolute inset-0 bg-red-50 bg-opacity-80 flex items-center justify-center p-4 z-10">
            <div className="bg-white rounded-md shadow-sm p-4 max-w-md">
              <h3 className="text-red-700 font-medium mb-2">Map Error</h3>
              <p className="text-sm text-gray-700">{mapError}</p>
              <p className="text-xs text-gray-500 mt-2">The data will still be imported correctly. This is only a preview issue.</p>
            </div>
          </div>
        )}
      </div>
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