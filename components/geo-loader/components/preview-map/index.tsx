import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Map, MapRef, ViewStateChangeEvent, MapMouseEvent, ViewState } from 'react-map-gl';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../../types/coordinates';
import { PreviewMapProps, MapFeature } from '../../types/map';
import { PreviewManager } from '../../preview/preview-manager';
import { coordinateSystemManager } from '../../core/coordinate-systems/coordinate-system-manager';
import { useMapView } from '../../hooks/use-map-view';
import { usePreviewState } from './hooks/use-preview-state';
import { MapLayers, ensureGeoFeatureCollection } from './components/map-layers';
import { ActionButton } from '../shared/controls/action-button';
import { ErrorDisplay } from '../shared/controls/error-display';
import { LayerControl } from '../shared/controls/layer-control';
import { ProgressBar } from '../shared/controls/progress-bar';
import { StatusMessage } from '../shared/controls/status-message';
import { LogManager } from '../../core/logging/log-manager';
import 'mapbox-gl/dist/mapbox-gl.css';

interface PreviewState {
  points: GeoJSON.FeatureCollection;
  lines: GeoJSON.FeatureCollection;
  polygons: GeoJSON.FeatureCollection;
  totalCount: number;
  loading: boolean;
  progress: number;
}

// Helper function to transform coordinates with caching
const transformCoordinates = (() => {
  // Cache for transformed coordinates
  const cache: Record<string, string> = {};
  const logger = LogManager.getInstance();
  
  return async (
    lng: number,
    lat: number,
    from: CoordinateSystem,
    to: CoordinateSystem
  ): Promise<string> => {
    // Skip transformation if coordinates are not finite
    if (!isFinite(lng) || !isFinite(lat)) {
      logger.warn('PreviewMap', 'Invalid coordinates', { lng, lat });
      return 'Invalid coordinates';
    }

    // Round coordinates to reduce cache size (6 decimal places ≈ 10cm precision)
    const roundedLng = Math.round(lng * 1e6) / 1e6;
    const roundedLat = Math.round(lat * 1e6) / 1e6;
    
    const cacheKey = `${roundedLng},${roundedLat},${from},${to}`;
    if (cacheKey in cache) {
      return cache[cacheKey];
    }

    try {
      const features = await coordinateSystemManager.transform(
        [{
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [roundedLng, roundedLat]
          } as GeoJSON.Point,
          properties: {}
        }],
        from,
        to
      );
      
      const point = features[0].geometry as GeoJSON.Point;
      const [x, y] = point.coordinates;
      
      // Only cache valid results
      if (isFinite(x) && isFinite(y)) {
        const result = `${x.toFixed(2)}, ${y.toFixed(2)}`;
        cache[cacheKey] = result;
        return result;
      }
      
      return 'Invalid transformed coordinates';
    } catch (error) {
      logger.error('PreviewMap', 'Coordinate transformation failed', { 
        error: error instanceof Error ? error.message : String(error),
        details: { lng, lat, from, to }
      });
      return 'Error transforming coordinates';
    }
  };
})();

const MIN_ZOOM_FOR_UNCLUSTERED = 14;

export function PreviewMap({
  preview,
  bounds,
  coordinateSystem = COORDINATE_SYSTEMS.WGS84,
  visibleLayers = ['shapes'],
  selectedElement,
  analysis
}: PreviewMapProps): React.ReactElement {
  const logger = LogManager.getInstance();
  const mapRef = useRef<MapRef>(null);
  const previewManagerRef = useRef<PreviewManager | null>(null);
  const [viewState, setViewState] = useState<Partial<ViewState>>({});
  const [mouseCoords, setMouseCoords] = useState<{ lat: number; lng: number }>();
  const [transformedCoords, setTransformedCoords] = useState<string>();
  const [error, setError] = useState<string>();
  const [streamProgress, setStreamProgress] = useState(0);
  const [currentVisibleLayers, setCurrentVisibleLayers] = useState<string[]>(visibleLayers);
  const [isLoading, setIsLoading] = useState(false);
  const [initialBoundsSet, setInitialBoundsSet] = useState(false);
  const [hoveredFeature, setHoveredFeature] = useState<MapFeature | null>(null);
  const [mapPreviewState, setMapPreviewState] = useState<PreviewState>({
    points: { type: 'FeatureCollection', features: [] },
    lines: { type: 'FeatureCollection', features: [] },
    polygons: { type: 'FeatureCollection', features: [] },
    loading: false,
    progress: 0,
    totalCount: 0
  });

  useEffect(() => {
    if (!preview) return;

    logger.debug('PreviewMap', 'Received preview data', {
      hasPreview: !!preview,
      previewType: preview instanceof PreviewManager ? 'PreviewManager' : 'Collection',
      features: {
        points: preview instanceof PreviewManager ? 0 : preview.points?.features?.length || 0,
        lines: preview instanceof PreviewManager ? 0 : preview.lines?.features?.length || 0,
        polygons: preview instanceof PreviewManager ? 0 : preview.polygons?.features?.length || 0
      },
      bounds,
      coordinateSystem,
      visibleLayers,
      firstLine: preview instanceof PreviewManager ? undefined : preview.lines?.features?.[0] ? {
        type: preview.lines.features[0].geometry?.type,
        coordinates: 'coordinates' in (preview.lines.features[0].geometry || {}) ? 
          (preview.lines.features[0].geometry as any).coordinates : undefined,
        properties: preview.lines.features[0].properties
      } : undefined
    });

    setMapPreviewState(prev => ({
      ...prev,
      points: preview instanceof PreviewManager ? { type: 'FeatureCollection', features: [] } : preview.points || { type: 'FeatureCollection', features: [] },
      lines: preview instanceof PreviewManager ? { type: 'FeatureCollection', features: [] } : preview.lines || { type: 'FeatureCollection', features: [] },
      polygons: preview instanceof PreviewManager ? { type: 'FeatureCollection', features: [] } : preview.polygons || { type: 'FeatureCollection', features: [] },
      loading: false,
      progress: 1,
      totalCount: 0
    }));

    logger.debug('PreviewMap', 'State update', {
      hasPreview: !!preview,
      hasBounds: !!bounds,
      previewManager: preview instanceof PreviewManager ? 'PreviewManager' : 'Collection',
      boundsData: bounds,
      visibleLayers: currentVisibleLayers,
      coordinateSystem,
      previewState: {
        points: mapPreviewState.points.features.length,
        lines: mapPreviewState.lines.features.length,
        polygons: mapPreviewState.polygons.features.length
      }
    });
  }, [preview, bounds, coordinateSystem, visibleLayers]);

  const {
    onMove,
    updateViewFromBounds,
    getViewportBounds
  } = useMapView(bounds, coordinateSystem);

  const previewState = usePreviewState({
    onPreviewUpdate: () => {
      setIsLoading(false);
      logger.debug('PreviewMap', 'Preview updated', {
        coordinateSystem,
        viewState,
        bounds
      });
    },
    previewManager: previewManagerRef.current,
    viewportBounds: getViewportBounds(),
    visibleLayers: currentVisibleLayers,
    initialBoundsSet,
    onUpdateBounds: (newBounds) => {
      updateViewFromBounds(newBounds);
      setInitialBoundsSet(true);
      setError(undefined);
    }
  });

  useEffect(() => {
    logger.debug('PreviewMap', 'State update', {
      hasPreview: !!preview,
      hasBounds: !!bounds,
      previewManager: preview instanceof PreviewManager ? 'PreviewManager' : 
                     preview?.previewManager ? 'PreviewInPreview' : 'null',
      boundsData: bounds,
      visibleLayers: currentVisibleLayers,
      coordinateSystem,
      previewState: {
        points: previewState?.points?.features?.length || 0,
        lines: previewState?.lines?.features?.length || 0,
        polygons: previewState?.polygons?.features?.length || 0
      }
    });
  }, [preview, bounds, currentVisibleLayers, coordinateSystem, previewState]);

  useEffect(() => {
    logger.debug('PreviewMap', 'Received preview data', {
      hasPreview: !!preview,
      previewType: preview instanceof PreviewManager ? 'PreviewManager' : 
                   preview?.previewManager ? 'PreviewInPreview' : 'null',
      features: preview instanceof PreviewManager ? 'PreviewManager' :
               preview ? {
                 points: preview.points?.features?.length || 0,
                 lines: preview.lines?.features?.length || 0,
                 polygons: preview.polygons?.features?.length || 0
               } : 'null',
      bounds,
      coordinateSystem,
      visibleLayers: currentVisibleLayers
    });

    const manager = preview instanceof PreviewManager ? preview : preview?.previewManager;
    if (!manager) {
      logger.debug('PreviewMap', 'No preview manager available');
      setIsLoading(true);
      return;
    }

    previewManagerRef.current = manager;
    
    // Ensure shapes layer is visible
    const updatedVisibleLayers = currentVisibleLayers.length === 0 ? ['shapes'] : currentVisibleLayers;
    
    logger.debug('PreviewMap', 'Updating preview manager options', {
      coordinateSystem,
      visibleLayers: updatedVisibleLayers,
      previewData: preview instanceof PreviewManager ? 'PreviewManager' : {
        points: (preview as any)?.points?.features?.length || 0,
        lines: (preview as any)?.lines?.features?.length || 0,
        polygons: (preview as any)?.polygons?.features?.length || 0
      }
    });

    manager.setOptions({
      coordinateSystem,
      visibleLayers: updatedVisibleLayers,
      enableCaching: true,
      smartSampling: true
    });

  }, [preview, bounds, currentVisibleLayers, coordinateSystem]);

  useEffect(() => {
    if (previewState) {
      logger.debug('PreviewMap', 'PreviewState updated', {
        points: previewState.points?.features?.length || 0,
        lines: previewState.lines?.features?.length || 0,
        polygons: previewState.polygons?.features?.length || 0,
        totalCount: previewState.totalCount,
        loading: isLoading,
        visibleLayers: currentVisibleLayers,
        coordinateSystem
      });
    }
  }, [previewState, isLoading, currentVisibleLayers, coordinateSystem]);

  const handleMapMove = useCallback((evt: ViewStateChangeEvent) => {
    onMove(evt);
  }, [onMove]);

  const handleMouseMove = useCallback(async (event: MapMouseEvent & { features?: Array<any> }) => {
    try {
      if (event.features && event.features.length > 0) {
        const feature = event.features[0];
        
        // Use original geometry for hover if available
        const geometry = feature.properties?.originalGeometry || feature.geometry;
        
        setHoveredFeature({
          type: 'Feature',
          geometry,
          properties: feature.properties || {},
          point: event.point ? [event.point.x, event.point.y] : undefined
        });
      } else {
        setHoveredFeature(null);
      }
      
      if (event.lngLat && isFinite(event.lngLat.lng) && isFinite(event.lngLat.lat)) {
        setMouseCoords({
          lng: event.lngLat.lng,
          lat: event.lngLat.lat
        });

        if (coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
          const transformed = await transformCoordinates(
            event.lngLat.lng,
            event.lngLat.lat,
            COORDINATE_SYSTEMS.WGS84,
            coordinateSystem
          );
          setTransformedCoords(transformed);
        } else {
          setTransformedCoords(undefined);
        }
      }
    } catch (error) {
      logger.error('PreviewMap', 'Error handling mouse move', {
        error: error instanceof Error ? error.message : String(error),
        details: { 
          eventType: event.type,
          hasFeatures: !!event.features,
          featureCount: event.features?.length || 0,
          coordinates: event.lngLat ? [event.lngLat.lng, event.lngLat.lat] : null
        }
      });
    }
  }, [coordinateSystem]);

  const handleMouseLeave = useCallback(() => {
    setHoveredFeature(null);
    setMouseCoords(undefined);
    setTransformedCoords(undefined);
  }, []);

  const handleLayerVisibilityChange = useCallback((layerId: string, visible: boolean) => {
    logger.debug('PreviewMap', 'Layer visibility changed', {
      layerId,
      visible,
      currentVisibleLayers
    });

    // Update visible layers
    const newVisibleLayers = visible
      ? [...currentVisibleLayers, layerId]
      : currentVisibleLayers.filter(l => l !== layerId);

    logger.debug('PreviewMap', 'New visible layers', newVisibleLayers);
    setCurrentVisibleLayers(newVisibleLayers);

    // Update preview manager if available
    if (preview instanceof PreviewManager) {
      preview.setOptions({ visibleLayers: newVisibleLayers });
    }
  }, [preview, currentVisibleLayers]);

  useEffect(() => {
    logger.debug('PreviewMap', 'Component mounted', {
      hasPreview: !!preview,
      coordinateSystem,
      visibleLayers,
      bounds
    });
  }, []);

  return (
    <div className="h-full w-full relative">
      <ActionButton 
        label={isLoading ? "Loading..." : "Ready"} 
        loading={isLoading} 
        onClick={() => {}}
      />
      <ProgressBar 
        info={{ 
          progress: streamProgress / 100, 
          status: 'Loading preview...', 
          details: 'Processing map data'
        }} 
      />
      {error && <ErrorDisplay error={{ message: error, details: {} }} />}

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
          initialViewState={{
            longitude: 8.035665827669139,
            latitude: 47.39015673011137,
            zoom: 15,
            pitch: 0,
            bearing: 0
          }}
          interactiveLayerIds={['lines']}
        >
          <MapLayers
            points={ensureGeoFeatureCollection(previewState?.points || { type: 'FeatureCollection', features: [] })}
            lines={ensureGeoFeatureCollection(previewState?.lines || { type: 'FeatureCollection', features: [] })}
            polygons={ensureGeoFeatureCollection(previewState?.polygons || { type: 'FeatureCollection', features: [] })}
          />

          {/* Add debug output */}
          {process.env.NODE_ENV === 'development' && (
            <div className="absolute bottom-4 right-4 z-10 bg-white bg-opacity-90 p-2 rounded text-xs">
              <div>Debug Info:</div>
              <div>Points: {previewState?.points?.features?.length || 0}</div>
              <div>Lines: {previewState?.lines?.features?.length || 0}</div>
              <div>Polygons: {previewState?.polygons?.features?.length || 0}</div>
              <div>Visible Layers: {currentVisibleLayers.join(', ')}</div>
              <div>First Line Feature:</div>
              <pre className="max-h-32 overflow-auto">
                {JSON.stringify(previewState?.lines?.features?.[0], null, 2)}
              </pre>
            </div>
          )}

          <div className="absolute top-4 right-4 z-10 space-y-2">
            <LayerControl
              layers={[
                {
                  id: 'shapes',
                  name: 'Shapes',
                  visible: currentVisibleLayers.includes('shapes'),
                  count: (
                    (previewState?.points?.features?.length || 0) +
                    (previewState?.lines?.features?.length || 0) +
                    (previewState?.polygons?.features?.length || 0)
                  )
                }
              ]}
              onVisibilityChange={handleLayerVisibilityChange}
              showCounts={true}
            />

            <div className="bg-white bg-opacity-90 rounded p-2 text-sm">
              <div>Cache: {Math.round((previewState?.progress || 0) * 100)}%</div>
              <div>Features: {previewState?.totalCount || 0}</div>
            </div>
          </div>

          {mouseCoords && (
            <div className="absolute bottom-4 left-4 z-10 space-y-1">
              <StatusMessage
                message={`WGS84: ${mouseCoords.lat.toFixed(6)}, ${mouseCoords.lng.toFixed(6)}`}
                type="info"
              />
              {transformedCoords && (
                <StatusMessage
                  message={`${coordinateSystem}: ${transformedCoords}`}
                  type="info"
                />
              )}
            </div>
          )}
          
          {hoveredFeature && (
            <div className="absolute bottom-4 right-4 z-10">
              <StatusMessage
                message={
                  Object.entries(hoveredFeature.properties)
                    .filter(([key]) => !key.startsWith('_'))
                    .map(([key, value]) => `${key}: ${value}`)
                    .join('\n')
                }
                type="info"
              />
            </div>
          )}
        </Map>
      </div>
    </div>
  );
}
