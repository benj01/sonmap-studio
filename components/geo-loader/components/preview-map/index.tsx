import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Map, MapRef, ViewStateChangeEvent, MapMouseEvent } from 'react-map-gl';
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
  
  return async (
    lng: number,
    lat: number,
    from: CoordinateSystem,
    to: CoordinateSystem
  ): Promise<string> => {
    // Skip transformation if coordinates are not finite
    if (!isFinite(lng) || !isFinite(lat)) {
      console.warn('[DEBUG] Invalid coordinates:', { lng, lat });
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
      console.error('[DEBUG] Coordinate transformation failed:', error);
      return 'Error transforming coordinates';
    }
  };
})();

const MIN_ZOOM_FOR_UNCLUSTERED = 14;

export function PreviewMap({
  preview,
  bounds,
  coordinateSystem = COORDINATE_SYSTEMS.WGS84,
  visibleLayers = ['shapes'], // Initialize with 'shapes' layer
  selectedElement,
  analysis
}: PreviewMapProps): React.ReactElement {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredFeature, setHoveredFeature] = useState<MapFeature | null>(null);
  const [mouseCoords, setMouseCoords] = useState<{ lng: number; lat: number } | null>(null);
  const [streamProgress, setStreamProgress] = useState<number>(0);
  const [initialBoundsSet, setInitialBoundsSet] = useState(false);
  const [transformedCoords, setTransformedCoords] = useState<string | null>(null);
  const [currentVisibleLayers, setCurrentVisibleLayers] = useState<string[]>(visibleLayers);
  const mapRef = useRef<MapRef>(null);
  
  // Update loading state when preview manager changes
  useEffect(() => {
    const manager = preview instanceof PreviewManager ? preview : preview?.previewManager;
    console.debug('[DEBUG] PreviewMap state update:', {
      hasPreview: !!preview,
      hasBounds: !!bounds,
      previewManager: manager ? 'initialized' : 'null',
      boundsData: bounds,
      visibleLayers: currentVisibleLayers
    });
    
    if (!manager) {
      setIsLoading(true);
      return;
    }
    // Loading will be set to false by onPreviewUpdate callback
  }, [preview, bounds, currentVisibleLayers]);

  const {
    viewState,
    onMove,
    updateViewFromBounds,
    getViewportBounds
  } = useMapView(bounds, coordinateSystem);

  const previewState = usePreviewState({
    onPreviewUpdate: () => {
      setIsLoading(false);
      console.debug('[DEBUG] Preview updated:', {
        coordinateSystem,
        viewState,
        bounds
      });
    },
    previewManager: preview instanceof PreviewManager ? preview : preview?.previewManager ?? null,
    viewportBounds: getViewportBounds(),
    visibleLayers: currentVisibleLayers,
    initialBoundsSet,
    onUpdateBounds: (newBounds) => {
      console.debug('[DEBUG] Updating bounds:', {
        current: bounds,
        new: newBounds,
        coordinateSystem
      });
      updateViewFromBounds(newBounds);
      setInitialBoundsSet(true);
      setError(null);
    }
  });

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
          setTransformedCoords(null);
        }
      }
    } catch (error) {
      console.error('[DEBUG] Error handling mouse move:', error);
    }
  }, [coordinateSystem]);

  const handleMouseLeave = useCallback(() => {
    setHoveredFeature(null);
    setMouseCoords(null);
    setTransformedCoords(null);
  }, []);

  const handleLayerVisibilityChange = useCallback((layerId: string, visible: boolean) => {
    console.debug('[DEBUG] Layer visibility changed:', {
      layerId,
      visible,
      currentVisibleLayers
    });

    // Update visible layers
    const newVisibleLayers = visible
      ? [...currentVisibleLayers, layerId]
      : currentVisibleLayers.filter(l => l !== layerId);

    console.debug('[DEBUG] New visible layers:', newVisibleLayers);
    setCurrentVisibleLayers(newVisibleLayers);

    // Update preview manager if available
    if (preview instanceof PreviewManager) {
      preview.setOptions({ visibleLayers: newVisibleLayers });
    }
  }, [preview, currentVisibleLayers]);

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
          attributionControl={false}
          reuseMaps
          maxZoom={20}
          minZoom={1}
          interactiveLayerIds={['shapes']} // Update to use 'shapes' layer
        >
          {previewState && (
            <MapLayers
              points={ensureGeoFeatureCollection(previewState.points || { type: 'FeatureCollection', features: [] })}
              lines={ensureGeoFeatureCollection(previewState.lines || { type: 'FeatureCollection', features: [] })}
              polygons={ensureGeoFeatureCollection(previewState.polygons || { type: 'FeatureCollection', features: [] })}
            />
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
