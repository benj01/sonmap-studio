'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { GeoFeature } from '@/types/geo-import';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import bbox from '@turf/bbox';
import { dbLogger } from '@/utils/logging/dbLogger';
import { isLogLevelEnabled } from '@/core/logging/logLevelConfig';

interface MapPreviewProps {
  features: GeoFeature[];
  bounds?: [number, number, number, number];
  selectedFeatureIds: number[];
  onFeaturesSelected?: (featureIdsOrUpdater: number[] | ((prev: number[]) => number[])) => void;
  onProgress?: (progress: number) => void;
}

const SOURCE = 'MapPreview';

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
  filter?: unknown[];
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
}

// Helper to flatten coordinates for any geometry type
function flattenCoordinates(geometry: unknown): number[][] {
  if (
    typeof geometry === 'object' &&
    geometry !== null &&
    'type' in geometry &&
    (geometry as { type: string }).type
  ) {
    const geom = geometry as { type: string; coordinates?: unknown; geometries?: unknown[] };
    if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
      return [geom.coordinates as number[]];
    }
    if (geom.type === 'GeometryCollection' && Array.isArray(geom.geometries)) {
      return geom.geometries.flatMap(flattenCoordinates);
    }
    if (Array.isArray(geom.coordinates)) {
      // For all other types, flatten deeply
      return (geom.coordinates as unknown[]).flat(Infinity) as number[][];
    }
  }
  return [];
}

// Add a specific validation function after the sanitizeCoordinates function
const sanitizeCoordinates = async (coords: unknown): Promise<unknown> => {
  if (Array.isArray(coords)) {
    if (coords.length === 0) return coords;
    if (typeof coords[0] === 'number') {
      if (coords.length >= 2) {
        const [x, y] = coords as [number, number];
        if (isNaN(x) || isNaN(y)) {
          await dbLogger.warn('Found invalid coordinates, using fallback', { source: SOURCE, coords });
          return [8.5, 47.0];
        }
      }
      return coords;
    } else {
      // Recursively sanitize all sub-coordinates
      return Promise.all(coords.map(sanitizeCoordinates));
    }
  }
  return coords;
};

const ensureValidMapboxCoordinates = async (feature: unknown): Promise<{ feature: GeoJSON.Feature | unknown, correction?: { featureId: unknown, geometryType: string, originalSample: string, correctedSample: string } }> => {
  if (!feature || typeof feature !== 'object' || !('geometry' in feature)) return { feature };
  const safeFeature = { ...(feature as GeoJSON.Feature) };
  const geometry = (safeFeature as GeoJSON.Feature).geometry;
  let correction: { featureId: unknown, geometryType: string, originalSample: string, correctedSample: string } | undefined = undefined;
  if (geometry && 'coordinates' in geometry) {
    const validateCoordPair = (coord: unknown): [number, number] => {
      if (!Array.isArray(coord) || coord.length < 2) {
        return [8.5, 47.0];
      }
      let [lng, lat] = coord as [number, number];
      if (isNaN(lng) || isNaN(lat)) {
        return [8.5, 47.0];
      }
      if (Math.abs(lng) > 90 && Math.abs(lat) <= 180) {
        [lng, lat] = [lat, lng];
      }
      lng = Math.max(-180, Math.min(180, lng));
      lat = Math.max(-90, Math.min(90, lat));
      return [lng, lat];
    };
    const validateCoords = (coords: unknown): unknown => {
      if (!coords) return coords;
      if (!Array.isArray(coords)) return coords;
      if (coords.length === 0) return coords;
      if (typeof coords[0] === 'number') {
        return validateCoordPair(coords);
      }
      return coords.map(validateCoords);
    };
    const originalCoords = geometry.coordinates;
    const validatedCoords = validateCoords(originalCoords);
    if (JSON.stringify(originalCoords) !== JSON.stringify(validatedCoords)) {
      correction = {
        featureId: (safeFeature as GeoJSON.Feature).id,
        geometryType: geometry.type,
        originalSample: JSON.stringify(originalCoords).substring(0, 100) + '...',
        correctedSample: JSON.stringify(validatedCoords).substring(0, 100) + '...'
      };
    }
    switch (geometry.type) {
      case 'Point':
        (safeFeature as GeoJSON.Feature).geometry = {
          ...geometry,
          coordinates: validatedCoords as GeoJSON.Position
        };
        break;
      case 'LineString':
      case 'MultiPoint':
        (safeFeature as GeoJSON.Feature).geometry = {
          ...geometry,
          coordinates: validatedCoords as GeoJSON.Position[]
        };
        break;
      case 'Polygon':
      case 'MultiLineString':
        (safeFeature as GeoJSON.Feature).geometry = {
          ...geometry,
          coordinates: validatedCoords as GeoJSON.Position[][]
        };
        break;
      case 'MultiPolygon':
        (safeFeature as GeoJSON.Feature).geometry = {
          ...geometry,
          coordinates: validatedCoords as GeoJSON.Position[][][]
        };
        break;
    }
  }
  return { feature: safeFeature, correction };
};

export function MapPreview({ features, bounds, selectedFeatureIds, onFeaturesSelected, onProgress }: MapPreviewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [loadedFeatures, setLoadedFeatures] = useState<GeoFeature[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [validationStats, setValidationStats] = useState<{ total: number; withIssues: number }>({ total: 0, withIssues: 0 });
  const [mapError, setMapError] = useState<string | null>(null);
  const didFitInitialBounds = useRef(false);

  // Add CHUNK_SIZE constant here
  const CHUNK_SIZE = 50;

  const handleFeatureClick = useCallback((featureId: number) => {
    if (!onFeaturesSelected) return;
    onFeaturesSelected((prev: number[]) => {
      let newSelection: number[];
      if (prev.includes(featureId)) {
        newSelection = prev.filter((id: number) => id !== featureId);
        (async () => { await dbLogger.info('Feature deselected', { source: SOURCE, featureId }); })();
      } else {
        newSelection = [...prev, featureId];
        (async () => { await dbLogger.info('Feature selected', { source: SOURCE, featureId }); })();
      }
      return newSelection;
    });
  }, [onFeaturesSelected]);

  const handleSelectAll = async () => {
    const allIds = loadedFeatures.map(f => f.id);
    await dbLogger.debug('Select All clicked', {
      source: SOURCE,
      allIds,
      loadedFeaturesCount: loadedFeatures.length,
      featuresCount: features.length,
      selectedFeatureIds
    });
    onFeaturesSelected?.(allIds);
  };

  const handleDeselectAll = async () => {
    await dbLogger.debug('Deselect All clicked', {
      source: SOURCE,
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
    const flatCoords = coords.flat();
    if (flatCoords.length < 4) return;
    map.current.fitBounds(
      [
        [flatCoords[0], flatCoords[1]],
        [flatCoords[2], flatCoords[3]]
      ],
      { padding: 50, animate: true }
    );
  };

  useEffect(() => { // Map Initialization Effect
    let isActive = true;
    const initMap = async () => {
      if (!mapContainer.current || !isActive) return;
      if (map.current) {
        await dbLogger.debug('Map instance already exists, skipping re-initialization.', { source: SOURCE });
        if (!isMapLoaded && map.current.isStyleLoaded() && map.current.loaded()) {
          setIsMapLoaded(true);
        }
        return;
      }
      setMapError(null);
      setIsMapLoaded(false);
      await dbLogger.debug('Initializing map instance', {
        source: SOURCE,
        featureCount: features.length,
        hasBounds: !!bounds
      });
      try {
        if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
          const tokenError = "Missing Mapbox token. Please check your environment variables.";
          if (isActive) {
            await dbLogger.error(SOURCE, tokenError); setMapError(tokenError);
          }
          return;
        }
        const newMap = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/light-v11',
          center: [0, 0], zoom: 1,
          accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
          preserveDrawingBuffer: true
        });
        map.current = newMap;
        if (!isActive) { newMap.remove(); map.current = null; return; }
        newMap.on('load', () => {
          if (isActive) {
            (async () => await dbLogger.info('Mapbox "load" event fired. Map is fully loaded.', { source: SOURCE }))();
            setIsMapLoaded(true);
          }
        });
        newMap.on('error', (e: any) => {
          if (!isActive) return;
          (async () => {
            let errorMessage = 'Unknown mapbox error';
            let errorObj: unknown = undefined;
            if (typeof e === 'object' && e !== null && 'error' in e) {
              errorObj = (e as { error: unknown }).error;
              if (typeof errorObj === 'object' && errorObj !== null && 'message' in errorObj) {
                errorMessage = (errorObj as { message: string }).message;
              }
            }
            await dbLogger.error(SOURCE, 'Mapbox runtime error', {
              error: errorObj,
              message: errorMessage
            });
            if (isActive) {
              setMapError(`Map error: ${errorMessage}`);
            }
          })();
        });
        newMap.addControl(new mapboxgl.NavigationControl(), 'top-right');
        ['preview-fill', 'preview-fill-issues', 'preview-line', 'preview-line-issues', 'preview-point', 'preview-point-issues'].forEach(layerId => {
          newMap.on('click', layerId, (e: mapboxgl.MapLayerMouseEvent) => {
            if (e.features && e.features.length > 0) {
              const feature = e.features[0];
              if (feature.properties && typeof feature.properties.id !== 'undefined') {
                handleFeatureClick(feature.properties.id);
              }
            }
          });
        });
      } catch (error) {
        if (isActive) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to initialize map';
          setMapError(errorMessage);
          await dbLogger.error('Failed to initialize map', { error });
        }
      }
    };
    initMap();
    return () => {
      isActive = false;
      setIsMapLoaded(false);
      if (map.current) {
        (async () => {
          await dbLogger.debug('Cleaning up map instance.', { source: SOURCE });
          if (map.current) {
            map.current.remove();
            map.current = null;
          }
        })();
      }
    };
  }, []);

  useEffect(() => {
    if (!isMapLoaded || !map.current) {
      if (features.length > 0 && !isMapLoaded) {
        onProgress?.(0);
        setIsLoading(true);
      } else if (features.length === 0) {
        setLoadedFeatures([]);
        setIsLoading(false);
        onProgress?.(100);
        setValidationStats({ total: 0, withIssues: 0 });
      }
      return;
    }
    setLoadedFeatures([]);
    setIsLoading(true);
    setValidationStats({ total: 0, withIssues: 0 });
    didFitInitialBounds.current = false;

    let currentChunkIndex = 0;
    let accumulatedIssuesThisRun = 0;
    const isActiveRef = { current: true };
    const loadNextChunkRecursive = () => {
      if (!map.current || !isActiveRef.current) { setIsLoading(false); return; }
      const startIndex = currentChunkIndex * CHUNK_SIZE;
      if (startIndex >= features.length) { setIsLoading(false); onProgress?.(100); return; }
      const endIndex = Math.min(startIndex + CHUNK_SIZE, features.length);
      const chunkToLoad = features.slice(startIndex, endIndex);
      const issuesInChunk = chunkToLoad.filter(f => f.validation?.hasIssues).length;
      accumulatedIssuesThisRun += issuesInChunk;
      setLoadedFeatures(prev => [...prev, ...chunkToLoad]);
      setValidationStats({ total: endIndex, withIssues: accumulatedIssuesThisRun });
      (async () => {
        await dbLogger.debug('Chunk processed', {
          source: SOURCE, chunkStart: startIndex, chunkEnd: endIndex,
          chunkLength: chunkToLoad.length, totalProcessed: endIndex, totalInProp: features.length,
        });
      })();
      const progressPercentage = features.length > 0 ? Math.min(100, (endIndex / features.length) * 100) : 100;
      onProgress?.(progressPercentage);
      currentChunkIndex++;
      if (isActiveRef.current) { requestAnimationFrame(loadNextChunkRecursive); } else { setIsLoading(false); }
    };
    loadNextChunkRecursive();
    return () => { isActiveRef.current = false; };
  }, [features, isMapLoaded, onProgress]);

  useEffect(() => {
    (async () => {
      await dbLogger.debug('Render state', {
        source: SOURCE,
        selectedFeatureIds,
        selectedCount: selectedFeatureIds.length,
        loadedFeaturesCount: loadedFeatures.length,
        featuresCount: features.length
      });
    })();
  }, [selectedFeatureIds, loadedFeatures, features]);

  useEffect(() => {
    if (!isMapLoaded || !map.current || isLoading) {
      if (!isLoading && loadedFeatures.length === 0) {
        const mapInstance = map.current;
        if (mapInstance && mapInstance.getSource && mapInstance.getSource('preview')) {
          (mapInstance.getSource('preview') as mapboxgl.GeoJSONSource).setData({ type: 'FeatureCollection', features: [] });
          dbLogger.debug('Map data cleared due to empty loadedFeatures after loading.', { source: SOURCE });
        }
      }
      return;
    }
    if (loadedFeatures.length === 0) return;
    const updateMapData = async () => {
      const mapInstance = map.current;
      if (!mapInstance) return;

      try {
        if (loadedFeatures.length > 0) {
          const sampleFeatures = loadedFeatures.slice(0, Math.min(3, loadedFeatures.length));
          for (const [index, feature] of sampleFeatures.entries()) {
            if (isLogLevelEnabled('MapPreview', 'debug')) {
              await dbLogger.debug('MapPreview: Feature details', {
                id: feature.id,
                geometryType: feature.geometry.type
              });
            }
            if (feature.geometry.type === 'Point' && 'coordinates' in feature.geometry) {
              const coords = feature.geometry.coordinates;
              if (isLogLevelEnabled('MapPreview', 'debug')) {
                await dbLogger.debug('MapPreview: Feature Point coordinates', { coordinates: coords });
              }
              if (Array.isArray(coords) && coords.length >= 2) {
                const [lng, lat] = coords;
                if (isLogLevelEnabled('MapPreview', 'debug')) {
                  await dbLogger.debug('MapPreview: Feature coordinate validation', {
                    lng, lat,
                    isLngValid: lng >= -180 && lng <= 180,
                    isLatValid: lat >= -90 && lat <= 90,
                    isInWGS84Range: lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90
                  });
                }
              }
            } else if ((feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiPoint') && 
                        'coordinates' in feature.geometry) {
              const coords = feature.geometry.coordinates.slice(0, 3);
              if (isLogLevelEnabled('MapPreview', 'debug')) {
                await dbLogger.debug('MapPreview: Feature coordinates (first 3 points)', { coordinates: coords });
              }
              if (Array.isArray(coords) && coords.length > 0 && Array.isArray(coords[0]) && coords[0].length >= 2) {
                const [lng, lat] = coords[0];
                if (isLogLevelEnabled('MapPreview', 'debug')) {
                  await dbLogger.debug('MapPreview: Feature first point validation', {
                    lng, lat,
                    isLngValid: lng >= -180 && lng <= 180,
                    isLatValid: lat >= -90 && lat <= 90,
                    isInWGS84Range: lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90
                  });
                }
              }
            }
          }
        }

        let sourceData: GeoJSON.FeatureCollection<GeoJSON.Geometry>;

        if (DEBUG_USE_FALLBACK_GEOJSON) {
          await dbLogger.info(SOURCE, 'Using fallback GeoJSON for debugging', { fallbackGeoJSON: FALLBACK_GEOJSON });
          sourceData = FALLBACK_GEOJSON as GeoJSON.FeatureCollection<GeoJSON.Geometry>;
        } else {
          const basicFeatures: GeoJSON.Feature[] = [];
          for (const f of loadedFeatures) {
            const feature: GeoJSON.Feature = {
              type: 'Feature',
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
                feature.geometry.coordinates = [lat, lng] as GeoJSON.Position;
              } else if ((feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiPoint') && 'coordinates' in feature.geometry) {
                const coords = feature.geometry.coordinates as [number, number][];
                feature.geometry.coordinates = coords.map(([lng, lat]) => [lat, lng]) as GeoJSON.Position[];
              }
            }
            // Apply any other needed transformations
            if (feature.geometry && 'coordinates' in feature.geometry) {
              feature.geometry.coordinates = await sanitizeCoordinates(feature.geometry.coordinates) as GeoJSON.Position | GeoJSON.Position[] | GeoJSON.Position[][] | GeoJSON.Position[][][];
            }
            basicFeatures.push(feature);
          }
          
          // Now apply the final validation to ensure Mapbox-compatible coordinates
          const validationResults = await Promise.all(basicFeatures.map(f => ensureValidMapboxCoordinates(f)));
          const validatedFeatures: GeoJSON.Feature[] = validationResults.map(r => r.feature as GeoJSON.Feature);
          const corrections = validationResults.filter(r => r.correction).map(r => r.correction!);
          // Log only the first 5 and last correction samples (debug), and a summary (info)
          if (corrections.length > 0) {
            const sample = corrections.slice(0, 5);
            if (corrections.length > 6) sample.push(corrections[corrections.length - 1]);
            await dbLogger.debug('MapPreview', 'Coordinate correction samples', { samples: sample });
            await dbLogger.info('MapPreview', 'Coordinate correction summary', {
              totalFeatures: validatedFeatures.length,
              correctedCount: corrections.length,
              correctedFeatureIds: corrections.slice(0, 10).map(c => c.featureId),
              ...(corrections.length > 10 ? { moreCorrected: corrections.length - 10 } : {})
            });
          }
          
          // Construct the final GeoJSON object
          sourceData = {
            type: 'FeatureCollection',
            features: validatedFeatures as GeoJSON.Feature[]
          };
        }

        // Instead of logging the full GeoJSON object, log only a concise summary
        const geometryTypes = [...new Set(sourceData.features.map(f => f.geometry.type))];
        const sampleFeature = sourceData.features[0];
        let firstCoords: number[] | undefined = undefined;
        if (
          sampleFeature &&
          sampleFeature.geometry &&
          sampleFeature.geometry.type !== 'GeometryCollection' &&
          'coordinates' in sampleFeature.geometry
        ) {
          const coords = (sampleFeature.geometry as GeoJSON.Point | GeoJSON.LineString | GeoJSON.Polygon | GeoJSON.MultiPoint | GeoJSON.MultiLineString | GeoJSON.MultiPolygon).coordinates;
          if (Array.isArray(coords)) {
            if (Array.isArray(coords[0])) {
              // Multi-coords (e.g., LineString, Polygon)
              const first = coords[0];
              if (Array.isArray(first) && typeof first[0] === 'number') {
                firstCoords = (first as number[]).slice(0, 2);
              } else if (Array.isArray(first) && Array.isArray(first[0]) && typeof first[0][0] === 'number') {
                // For MultiPolygon
                firstCoords = (first[0] as number[]).slice(0, 2);
              }
            } else if (typeof coords[0] === 'number') {
              // Point
              firstCoords = (coords as number[]).slice(0, 2);
            }
          }
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
        if (isLogLevelEnabled('MapPreview', 'debug')) {
          await dbLogger.debug('MapPreview: GeoJSON summary for Mapbox', summary);
        }

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
            if (isLogLevelEnabled('MapPreview', 'debug')) {
              await dbLogger.debug('MapPreview: Coordinate order analysis', { 
                samples: sampleCoords,
                conclusion: sampleCoords.every(s => s.analysis.suspectedFormat === "Appears to be [lng, lat] (correct)")
                  ? "All sampled coordinates appear to be in correct [longitude, latitude] format"
                  : "Some coordinates may be in wrong order or outside normal ranges"
              });
            }
          }
        }

        // Add a highly visible debug log before passing data to Mapbox (log raw string directly)
        try {
          // Only log this in debug mode, and truncate/clean the output
          const debugDump = JSON.stringify(sourceData, null, 2).slice(0, 2000);
          if (isLogLevelEnabled('MapPreviewGeoJson', 'debug')) {
            await dbLogger.debug('MAPBOX GEOJSON RAW DUMP STRING', { geojson: debugDump });
          }
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
              if (isLogLevelEnabled('MapPreview', 'debug')) {
                await dbLogger.info(SOURCE, 'Removed existing layer', { layerId });
              }
            } catch (err) {
              if (isLogLevelEnabled('MapPreview', 'debug')) {
                await dbLogger.warn(SOURCE, 'Failed to remove layer', { layerId, error: err });
              }
            }
          }
        }
        if (mapInstance.getSource('preview')) {
          try {
            mapInstance.removeSource('preview');
            if (isLogLevelEnabled('MapPreview', 'debug')) {
              await dbLogger.info(SOURCE, 'Removed existing source', { sourceId: 'preview' });
            }
          } catch (err) {
            if (isLogLevelEnabled('MapPreview', 'debug')) {
              await dbLogger.warn(SOURCE, 'Failed to remove source', { sourceId: 'preview', error: err });
            }
          }
        }
        // --- End: Remove existing preview layers and source ---

        // Add the new source with the fresh GeoJSON data
        try {
          mapInstance.addSource('preview', {
            type: 'geojson',
            data: sourceData
          });
          if (isLogLevelEnabled('MapPreview', 'debug')) {
            await dbLogger.info(SOURCE, 'Added new preview source');
          }
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
            ] as unknown as unknown[],
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
            ] as unknown as unknown[],
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
            ] as unknown as unknown[],
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
            ] as unknown as unknown[],
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
            ] as unknown as unknown[],
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
            ] as unknown as unknown[],
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
            mapInstance.addLayer(layer as unknown as mapboxgl.Layer);
          } catch (err) {
            if (isLogLevelEnabled('MapPreview', 'debug')) {
              await dbLogger.warn(SOURCE, 'Failed to add layer', { layerId: layer.id, error: err });
            }
          }
        }

        const popup = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false
        });

        issueLayers.forEach(layer => {
          mapInstance.on('mouseenter', layer.id, (e: unknown) => {
            if (
              typeof e === 'object' &&
              e !== null &&
              'features' in e &&
              Array.isArray((e as { features: unknown[] }).features) &&
              (e as { features: { properties?: { issues?: string[] } }[] }).features[0]
            ) {
              const feature = (e as { features: { properties?: { issues?: string[] } }[] }).features[0];
              const issues = feature.properties?.issues;
              if (issues && 'lngLat' in e) {
                popup.setLngLat((e as { lngLat: mapboxgl.LngLatLike }).lngLat)
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

        // Only log set/get state for first 3, last 1, and summary
        const total = loadedFeatures.length;
        for (let i = 0; i < total; i++) {
          const feature = loadedFeatures[i];
          const isFirstFew = i < 3;
          const isLast = i === total - 1;
          if (isFirstFew || isLast) {
            await dbLogger.debug('setFeatureState call', {
              id: feature.id,
              selected: !!selectedFeatureIds.includes(feature.id),
              type: feature.geometry.type
            });
          }
          mapInstance.setFeatureState(
            { source: 'preview', id: feature.id },
            { selected: !!selectedFeatureIds.includes(feature.id) }
          );
          const state = mapInstance.getFeatureState({ source: 'preview', id: feature.id });
          if (isFirstFew || isLast) {
            await dbLogger.debug('getFeatureState result', { id: feature.id, state });
          }
          mapInstance.triggerRepaint();
        }
        // Summary log
        await dbLogger.debug('setFeatureState summary', {
          total,
          first3: loadedFeatures.slice(0, 3).map(f => ({ id: f.id, type: f.geometry.type })),
          last: total > 0 ? { id: loadedFeatures[total - 1].id, type: loadedFeatures[total - 1].geometry.type } : null
        });

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
              if (isLogLevelEnabled('MapPreview', 'debug')) {
                await dbLogger.info(SOURCE, 'fitBounds successful', { bounds: mapboxBounds });
              }
            } else {
              if (isLogLevelEnabled('MapPreview', 'debug')) {
                await dbLogger.warn(SOURCE, 'Invalid calculated bounds, skipping fitBounds', { calculatedBbox });
              }
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
  }, [loadedFeatures, selectedFeatureIds, bounds, isLoading, features.length]);

  useEffect(() => {
    didFitInitialBounds.current = false;
  }, [features, bounds, features.length]);

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