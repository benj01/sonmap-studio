import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Map, Source, Layer, AttributionControl, ViewStateChangeEvent, MapRef, MapMouseEvent } from 'react-map-gl';
import { COORDINATE_SYSTEMS, isSwissSystem } from '../types/coordinates';
import { layerStyles } from './map/map-layers';
import { PreviewMapProps, ViewState, MapFeature, MapEvent, CacheStats, PreviewOptions } from '../types/map';
import { useMapView } from '../hooks/use-map-view';
import { createPreviewManager, PreviewManager } from '../preview/preview-manager';
import { cacheManager } from '../core/cache-manager';
import { ProcessorResult } from '../core/processors/base/types';
import { Progress } from 'components/ui/progress';
import { Loader2 } from 'lucide-react';
import bboxPolygon from '@turf/bbox-polygon';
import booleanIntersects from '@turf/boolean-intersects';
import type { 
  Feature, 
  FeatureCollection, 
  Point, 
  LineString, 
  Polygon, 
  MultiLineString, 
  MultiPolygon,
  GeoJsonProperties 
} from 'geojson';
import 'mapbox-gl/dist/mapbox-gl.css';

const VIEWPORT_PADDING = 50;
const CLUSTER_RADIUS = 50;
const MIN_ZOOM_FOR_UNCLUSTERED = 14;
const CACHE_KEY_PREFIX = 'preview-map';
const DEBOUNCE_TIME = 250; // Increased debounce time

export function PreviewMap({
  preview,
  bounds,
  coordinateSystem = COORDINATE_SYSTEMS.WGS84,
  visibleLayers = [],
  selectedElement,
  analysis
}: PreviewMapProps): React.ReactElement {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredFeature, setHoveredFeature] = useState<MapFeature | null>(null);
  const [mouseCoords, setMouseCoords] = useState<{ lng: number; lat: number } | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats>({ hits: 0, misses: 0, hitRate: 0 });
  const [streamProgress, setStreamProgress] = useState<number>(0);
  const mapRef = React.useRef<MapRef>(null);

  const {
    viewState,
    onMove,
    updateViewFromBounds,
    focusOnFeatures,
    getViewportBounds
  } = useMapView(bounds, coordinateSystem);

  // Initialize preview manager with caching
  const previewManagerRef = React.useRef<PreviewManager | null>(null);

  useEffect(() => {
    const options: PreviewOptions = {
      maxFeatures: 5000,
      visibleLayers,
      analysis,
      coordinateSystem,
      enableCaching: true,
      onProgress: (progress: number): void => setStreamProgress(progress * 100),
      viewportBounds: getViewportBounds() as [number, number, number, number] | undefined
    };

    const pm = createPreviewManager(options);

    if (preview) {
      console.debug('Setting preview features:', {
        featureCount: preview.features.features.length,
        coordinateSystem,
        isSwiss: isSwissSystem(coordinateSystem)
      });

      // Use cached preview if available
      const cacheKey = `${CACHE_KEY_PREFIX}:${preview.statistics.featureCount}:${visibleLayers.join(',')}`;
      const cached = cacheManager.getCachedPreview(cacheKey, {
        visibleLayers,
        coordinateSystem
      });

      if (cached) {
        pm.setFeatures(cached.features);
        setCacheStats(prev => ({
          hits: prev.hits + 1,
          misses: prev.misses,
          hitRate: (prev.hits + 1) / (prev.hits + prev.misses + 1)
        }));
      } else {
        pm.setFeatures(preview.features);
        // Cache the processed features
        cacheManager.cachePreview(cacheKey, {
          visibleLayers,
          coordinateSystem
        }, {
          features: preview.features,
          bounds: preview.bounds,
          layers: preview.layers,
          featureCount: preview.statistics.featureCount,
          coordinateSystem: preview.coordinateSystem
        });
        setCacheStats(prev => ({
          hits: prev.hits,
          misses: prev.misses + 1,
          hitRate: prev.hits / (prev.hits + prev.misses + 1)
        }));
      }
    }

    previewManagerRef.current = pm;
    setIsLoading(false);

    // Cleanup preview manager on unmount or when options change
    return () => {
      if (previewManagerRef.current) {
        previewManagerRef.current = null;
      }
    };
  }, [preview, visibleLayers, analysis, coordinateSystem, getViewportBounds]);

  // Initial zoom to bounds
  useEffect(() => {
    if (bounds) {
      try {
        console.debug('Updating view from bounds:', {
          bounds,
          coordinateSystem,
          isSwiss: isSwissSystem(coordinateSystem)
        });
        updateViewFromBounds(bounds);
        setError(null);
      } catch (err) {
        const e = err as Error;
        setError(`Failed to set initial view: ${e.message}`);
      }
    }
  }, [bounds, updateViewFromBounds, coordinateSystem]);

  // Focus on selected element if needed
  useEffect(() => {
    async function focusSelectedElement() {
      if (selectedElement && previewManagerRef.current) {
        try {
          const features = await previewManagerRef.current.getFeaturesByTypeAndLayer(
            selectedElement.type,
            selectedElement.layer
          );
          if (features.length > 0) {
            focusOnFeatures(features, VIEWPORT_PADDING);
            setError(null);
          }
        } catch (err) {
          const e = err as Error;
          setError(`Failed to focus on selected element: ${e.message}`);
        }
      }
    }
    focusSelectedElement();
  }, [selectedElement, focusOnFeatures]);

  const handleMapMove = useCallback((evt: ViewStateChangeEvent) => {
    onMove(evt);
  }, [onMove]);

  // Filter features by viewport if needed
  const viewportBounds = getViewportBounds();

  // Memoize viewport polygon calculation with explicit bounds check
  const viewportPolygon = useMemo(() => {
    if (!viewportBounds || 
        !Array.isArray(viewportBounds) || 
        viewportBounds.length !== 4 ||
        !viewportBounds.every(n => typeof n === 'number' && isFinite(n))) {
      return null;
    }
    return bboxPolygon(viewportBounds);
  }, [viewportBounds?.[0], viewportBounds?.[1], viewportBounds?.[2], viewportBounds?.[3]]);

  const [previewState, setPreviewState] = useState<{
    points: FeatureCollection;
    lines: FeatureCollection;
    polygons: FeatureCollection;
    totalCount: number;
    visibleCount: number;
  }>({
    points: { type: 'FeatureCollection', features: [] },
    lines: { type: 'FeatureCollection', features: [] },
    polygons: { type: 'FeatureCollection', features: [] },
    totalCount: 0,
    visibleCount: 0
  });

  // Debounced preview update function
  const debouncedUpdatePreview = useCallback(async () => {
    if (!previewManagerRef.current) return;

    try {
      const collections = await previewManagerRef.current?.getPreviewCollections();
      if (!collections) return;

      // Try to get filtered features from cache first
      const bounds2D = viewportBounds ? [
        viewportBounds[0],
        viewportBounds[1],
        viewportBounds[2],
        viewportBounds[3]
      ] : undefined;
      const cacheKey = `${CACHE_KEY_PREFIX}:viewport:${bounds2D?.join(',')}`;
      const cached = cacheManager.getCachedPreview(cacheKey, {
        viewportBounds,
        visibleLayers
      });

      if (cached) {
        setPreviewState({
          points: cached.features as FeatureCollection,
          lines: cached.features as FeatureCollection,
          polygons: cached.features as FeatureCollection,
          totalCount: collections.totalCount,
          visibleCount: cached.featureCount
        });
        setCacheStats(prev => ({
          hits: prev.hits + 1,
          misses: prev.misses,
          hitRate: (prev.hits + 1) / (prev.hits + prev.misses + 1)
        }));
        return;
      }

      // Filter features by viewport
      const filterByViewport = (fc: FeatureCollection) => {
        if (!viewportPolygon) return fc;
        const filtered = fc.features.filter((f: Feature) => booleanIntersects(f, viewportPolygon));
        return { ...fc, features: filtered };
      };

      const filteredPoints = filterByViewport(collections.points);
      const filteredLines = filterByViewport(collections.lines);
      const filteredPolygons = filterByViewport(collections.polygons);

      const filteredVisibleCount = 
        filteredPoints.features.length + 
        filteredLines.features.length + 
        filteredPolygons.features.length;

      // Cache filtered features
      cacheManager.cachePreview(cacheKey, {
        viewportBounds,
        visibleLayers
      }, {
        features: {
          type: 'FeatureCollection',
          features: [
            ...filteredPoints.features,
            ...filteredLines.features,
            ...filteredPolygons.features
          ]
        },
        bounds: viewportBounds ? {
          minX: viewportBounds[0],
          minY: viewportBounds[1],
          maxX: viewportBounds[2],
          maxY: viewportBounds[3]
        } : preview?.bounds,
        layers: visibleLayers,
        featureCount: filteredVisibleCount,
        coordinateSystem
      });

      setPreviewState({
        points: filteredPoints,
        lines: filteredLines,
        polygons: filteredPolygons,
        totalCount: collections.totalCount,
        visibleCount: filteredVisibleCount
      });

      setCacheStats(prev => ({
        hits: prev.hits,
        misses: prev.misses + 1,
        hitRate: prev.hits / (prev.hits + prev.misses + 1)
      }));
    } catch (error) {
      console.error('Failed to update preview collections:', error);
    }
  }, [viewportPolygon, viewportBounds, visibleLayers, preview?.bounds, coordinateSystem]);

  // Effect to handle debounced preview updates
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const updatePreviewCollections = async () => {
      // Clear any pending update
      if (timeoutId) clearTimeout(timeoutId);
      
      // Schedule new update with increased debounce time
      timeoutId = setTimeout(() => {
        debouncedUpdatePreview();
      }, DEBOUNCE_TIME);
    };

    updatePreviewCollections();

    // Cleanup timeout on unmount or deps change
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [debouncedUpdatePreview]);

  const { points, lines, polygons, totalCount, visibleCount } = previewState;

  const layerComponents = useMemo(() => {
    const components = [];

    if (points.features.length > 0) {
      components.push(
        <Source
          key="points"
          type="geojson"
          data={points}
          cluster={true}
          clusterMaxZoom={MIN_ZOOM_FOR_UNCLUSTERED}
          clusterRadius={CLUSTER_RADIUS}
        >
          <Layer
            id="clusters"
            type="circle"
            filter={['has', 'point_count']}
            paint={{
              'circle-color': [
                'step',
                ['get', 'point_count'],
                '#51bbd6',
                100,
                '#f1f075',
                750,
                '#f28cb1'
              ],
              'circle-radius': [
                'step',
                ['get', 'point_count'],
                20,
                100,
                30,
                750,
                40
              ]
            }}
          />

          <Layer
            id="cluster-count"
            type="symbol"
            filter={['has', 'point_count']}
            layout={{
              'text-field': '{point_count_abbreviated}',
              'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
              'text-size': 12
            }}
          />

          <Layer
            {...layerStyles.point}
            filter={['!', ['has', 'point_count']]}
          />
        </Source>
      );
    }

    if (lines.features.length > 0) {
      components.push(
        <Source key="lines" type="geojson" data={lines}>
          <Layer {...layerStyles.line} />
        </Source>
      );
    }

    if (polygons.features.length > 0) {
      components.push(
        <Source key="polygons" type="geojson" data={polygons}>
          <Layer {...layerStyles.polygon} />
          <Layer {...layerStyles.polygonOutline} />
        </Source>
      );
    }

    return components;
  }, [points, lines, polygons]);

  const handleMouseMove = useCallback((event: MapMouseEvent & { features?: Array<any> }) => {
    if (event.features && event.features.length > 0) {
      const feature = event.features[0];
      setHoveredFeature({
        type: 'Feature',
        geometry: feature.geometry,
        properties: feature.properties || {},
        point: event.point ? [event.point.x, event.point.y] : undefined
      });
    } else {
      setHoveredFeature(null);
    }
    
    if (event.lngLat) {
      setMouseCoords({
        lng: event.lngLat.lng,
        lat: event.lngLat.lat
      });
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredFeature(null);
    setMouseCoords(null);
  }, []);

  return (
    <div className="h-full w-full relative">
      {isLoading && (
        <div className="absolute inset-0 bg-background/50 z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <div className="text-sm text-muted-foreground">
              Loading preview...
            </div>
          </div>
        </div>
      )}

      {streamProgress > 0 && streamProgress < 100 && (
        <div className="absolute top-0 left-0 right-0 z-50">
          <Progress value={streamProgress} className="h-1" />
        </div>
      )}

      {error && (
        <div className="absolute top-2 left-2 right-2 z-50 bg-destructive text-destructive-foreground p-2 rounded text-sm">
          {error}
        </div>
      )}

      <div className="absolute inset-0 z-0">
        <Map
          ref={mapRef}
          {...viewState}
          onMove={handleMapMove}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/light-v11"
          mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
          attributionControl={false}
          reuseMaps
          maxZoom={20}
          minZoom={1}
          interactiveLayerIds={['points', 'lines', 'polygons', 'clusters']}
        >
          {layerComponents}

          <div className="absolute bottom-0 right-0 z-10">
            <AttributionControl
              compact={true}
              style={{
                margin: '0 8px 8px 0',
                backgroundColor: 'rgba(255, 255, 255, 0.7)',
                fontSize: '10px'
              }}
            />
          </div>

          <div className="absolute top-2 right-2 bg-background/80 text-xs p-2 rounded flex flex-col gap-1">
            <div>
              Showing {visibleCount} of {totalCount} features
            </div>
            {viewState.zoom < MIN_ZOOM_FOR_UNCLUSTERED && points.features.length > 0 && (
              <div className="text-muted-foreground">
                Zoom in to view individual points
              </div>
            )}
            <div className="text-muted-foreground">
              Cache hit rate: {(cacheStats.hitRate * 100).toFixed(1)}%
            </div>
          </div>

          {mouseCoords && (
            <div className="absolute bottom-8 left-2 bg-background/80 text-xs p-2 rounded">
              Coordinates: {mouseCoords.lng.toFixed(6)}, {mouseCoords.lat.toFixed(6)}
            </div>
          )}

          {hoveredFeature && (
            <div
              className="absolute z-50 bg-background/90 p-2 rounded shadow-lg text-xs"
              style={{
                left: hoveredFeature.point?.[0],
                top: hoveredFeature.point?.[1],
                transform: 'translate(-50%, -100%)',
                marginTop: -8
              }}
            >
              <div className="font-medium">
                {hoveredFeature.properties?.layer || 'Unknown Layer'}
              </div>
              {hoveredFeature.properties?.hasWarning && (
                <div className="text-destructive mt-1">
                  {hoveredFeature.properties?.warningMessage}
                </div>
              )}
            </div>
          )}
        </Map>
      </div>
    </div>
  );
}
