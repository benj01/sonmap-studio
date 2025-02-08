import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
import { Bounds } from '../../core/feature-manager/bounds';

interface PreviewState {
  points: GeoJSON.FeatureCollection;
  lines: GeoJSON.FeatureCollection;
  polygons: GeoJSON.FeatureCollection;
  totalCount: number;
  loading: boolean;
  progress: number;
}

// Optimize coordinate transformation cache
const transformCoordinates = (() => {
  const cache: Record<string, string> = {};
  const logger = LogManager.getInstance();
  
  return async (lng: number, lat: number, from: CoordinateSystem, to: CoordinateSystem): Promise<string> => {
    if (!isFinite(lng) || !isFinite(lat)) return 'Invalid coordinates';

    const roundedLng = Math.round(lng * 1e6) / 1e6;
    const roundedLat = Math.round(lat * 1e6) / 1e6;
    const cacheKey = `${roundedLng},${roundedLat},${from},${to}`;
    
    if (cacheKey in cache) return cache[cacheKey];

    try {
      const features = await coordinateSystemManager.transform(
        [{
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [roundedLng, roundedLat] },
          properties: {}
        }],
        from,
        to
      );
      
      const point = features[0].geometry as GeoJSON.Point;
      const [x, y] = point.coordinates;
      
      if (isFinite(x) && isFinite(y)) {
        const result = `${x.toFixed(2)}, ${y.toFixed(2)}`;
        cache[cacheKey] = result;
        return result;
      }
      
      return 'Invalid transformed coordinates';
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        logger.error('PreviewMap', 'Coordinate transformation failed', { error: error instanceof Error ? error.message : String(error) });
      }
      return 'Error transforming coordinates';
    }
  };
})();

const MIN_ZOOM_FOR_UNCLUSTERED = 14;

// Add this helper at the top of the file
const sanitizeFeatureForLogging = (feature: any) => {
  if (!feature) return null;
  return {
    type: feature.geometry?.type,
    layer: feature.properties?.layer,
    hasCoordinates: feature.geometry !== undefined,
    coordinates: feature.geometry?.type === 'LineString' ? 
      (feature.geometry as any).coordinates.slice(0, 2) : null,
    properties: Object.keys(feature.properties || {})
  };
};

const sanitizePreviewStateForLogging = (state: any) => {
  if (!state) return null;
  return {
    pointCount: state.points?.features?.length || 0,
    lineCount: state.lines?.features?.length || 0,
    polygonCount: state.polygons?.features?.length || 0,
    firstLine: sanitizeFeatureForLogging(state.lines?.features?.[0])
  };
};

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

  const {
    onMove,
    updateViewFromBounds,
    getViewportBounds
  } = useMapView(bounds, coordinateSystem);

  // Optimize viewport bounds calculation
  const currentViewportBounds = useMemo(() => {
    // Skip recalculation if essential values haven't changed significantly
    const longitude = Math.round((viewState.longitude || 0) * 1e6);
    const latitude = Math.round((viewState.latitude || 0) * 1e6);
    const zoom = Math.round((viewState.zoom || 0) * 1e6);

    // Only get viewport bounds if we have valid coordinates
    if (!isFinite(longitude) || !isFinite(latitude) || !isFinite(zoom)) {
      return undefined;
    }

    const bounds = getViewportBounds();
    if (!bounds) return undefined;
    
    // Round to 6 decimal places to prevent tiny changes from triggering updates
    return bounds.map(coord => Math.round(coord * 1e6) / 1e6) as [number, number, number, number];
  }, [
    Math.round((viewState.longitude || 0) * 1e6),
    Math.round((viewState.latitude || 0) * 1e6),
    Math.round((viewState.zoom || 0) * 1e6),
    getViewportBounds // Include the function in dependencies to ensure it updates if the function changes
  ]);

  // Optimize preview update handler
  const handlePreviewUpdate = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleUpdateBounds = useCallback((newBounds: Bounds) => {
    updateViewFromBounds(newBounds);
    setInitialBoundsSet(true);
    setError(undefined);
  }, [updateViewFromBounds]);

  const previewState = usePreviewState({
    onPreviewUpdate: handlePreviewUpdate,
    previewManager: preview instanceof PreviewManager ? preview : preview?.previewManager,
    viewportBounds: currentViewportBounds,
    visibleLayers: currentVisibleLayers,
    initialBoundsSet,
    onUpdateBounds: handleUpdateBounds
  });

  useEffect(() => {
    if (!preview) return;

    const manager = preview instanceof PreviewManager ? preview : preview?.previewManager;
    if (!manager) {
      setIsLoading(true);
      return;
    }

    previewManagerRef.current = manager;
    const updatedVisibleLayers = currentVisibleLayers.length === 0 ? ['shapes'] : currentVisibleLayers;
    
    // Only log significant state changes
    if (process.env.NODE_ENV === 'development') {
      logger.info('PreviewMap', 'Updating preview manager', {
        visibleLayersCount: updatedVisibleLayers.length,
        coordinateSystem,
        hasPreviewManager: true
      });
    }

    manager.setOptions({
      coordinateSystem,
      visibleLayers: updatedVisibleLayers,
      enableCaching: true,
      smartSampling: true
    });
  }, [preview, bounds, currentVisibleLayers, coordinateSystem]);

  const handleMapMove = useCallback((evt: ViewStateChangeEvent) => {
    onMove(evt);
  }, [onMove]);

  const handleMouseMove = useCallback(async (event: MapMouseEvent & { features?: Array<any> }) => {
    try {
      const features = event.features || [];
      if (features.length > 0) {
        const feature = features[0];
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
      if (process.env.NODE_ENV === 'development') {
        logger.error('PreviewMap', 'Error handling mouse move', { error: error instanceof Error ? error.message : String(error) });
      }
    }
  }, [coordinateSystem]);

  const handleMouseLeave = useCallback(() => {
    setHoveredFeature(null);
    setMouseCoords(undefined);
    setTransformedCoords(undefined);
  }, []);

  const handleLayerVisibilityChange = useCallback((layerId: string, visible: boolean) => {
    const newVisibleLayers = visible
      ? [...currentVisibleLayers, layerId]
      : currentVisibleLayers.filter(l => l !== layerId);

    setCurrentVisibleLayers(newVisibleLayers);

    if (preview instanceof PreviewManager) {
      preview.setOptions({ visibleLayers: newVisibleLayers });
    }
  }, [preview, currentVisibleLayers]);

  // Memoize MapLayers component props
  const mapLayersProps = useMemo(() => ({
    points: ensureGeoFeatureCollection(previewState?.points || { type: 'FeatureCollection', features: [] }),
    lines: ensureGeoFeatureCollection(previewState?.lines || { type: 'FeatureCollection', features: [] }),
    polygons: ensureGeoFeatureCollection(previewState?.polygons || { type: 'FeatureCollection', features: [] })
  }), [previewState?.points, previewState?.lines, previewState?.polygons]);

  // Memoize layer control props
  const layerControlProps = useMemo(() => ({
    layers: [{
      id: 'shapes',
      name: 'Shapes',
      visible: currentVisibleLayers.includes('shapes'),
      count: (
        (previewState?.points?.features?.length || 0) +
        (previewState?.lines?.features?.length || 0) +
        (previewState?.polygons?.features?.length || 0)
      )
    }],
    onVisibilityChange: handleLayerVisibilityChange,
    showCounts: true
  }), [currentVisibleLayers, previewState, handleLayerVisibilityChange]);

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
          <MapLayers {...mapLayersProps} />

          <div className="absolute top-4 right-4 z-10 space-y-2">
            <LayerControl {...layerControlProps} />

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

// Add this component at the bottom of the file
interface DebugPanelProps {
  previewState: any;
  visibleLayers: string[];
}

const DebugPanel: React.FC<DebugPanelProps> = React.memo(({ previewState, visibleLayers }) => {
  const sanitizedFeature = previewState?.lines?.features?.[0] ? 
    sanitizeFeatureForLogging(previewState.lines.features[0]) : null;

  return (
    <div className="absolute bottom-4 right-4 z-10 bg-white bg-opacity-90 p-2 rounded text-xs">
      <div>Debug Info:</div>
      <div>Points: {previewState?.points?.features?.length || 0}</div>
      <div>Lines: {previewState?.lines?.features?.length || 0}</div>
      <div>Polygons: {previewState?.polygons?.features?.length || 0}</div>
      <div>Visible Layers: {visibleLayers.join(', ')}</div>
      <div>First Line Feature:</div>
      <pre className="max-h-32 overflow-auto">
        {JSON.stringify(sanitizedFeature, null, 2)}
      </pre>
    </div>
  );
});
