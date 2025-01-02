import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Map, MapRef, ViewStateChangeEvent, MapMouseEvent } from 'react-map-gl';
import { COORDINATE_SYSTEMS } from '../../types/coordinates';
import { PreviewMapProps, MapFeature } from '../../types/map';
import { useMapView } from '../../hooks/use-map-view';
import { usePreviewState } from './hooks/use-preview-state';
import { MapLayers } from './components/map-layers';
import {
  MapAttribution,
  StatsControl,
  CoordinatesControl,
  FeatureTooltip,
  LoadingOverlay,
  ErrorOverlay,
  ProgressBar
} from './components/map-controls';
import 'mapbox-gl/dist/mapbox-gl.css';

const MIN_ZOOM_FOR_UNCLUSTERED = 14;

export function PreviewMap({
  preview,
  bounds,
  coordinateSystem = COORDINATE_SYSTEMS.WGS84,
  visibleLayers = [],
  selectedElement,
  analysis
}: PreviewMapProps): React.ReactElement {
  const [isLoading, setIsLoading] = useState(true);
  
  // Update loading state when preview manager changes
  useEffect(() => {
    console.debug('[DEBUG] PreviewMap state update:', {
      hasPreview: !!preview,
      hasBounds: !!bounds,
      previewManager: preview?.previewManager ? 'initialized' : 'null',
      boundsData: bounds,
      visibleLayers
    });
    
    if (!preview?.previewManager) {
      setIsLoading(true);
      return;
    }
    // Loading will be set to false by onPreviewUpdate callback
  }, [preview?.previewManager]);
  const [error, setError] = useState<string | null>(null);
  const [hoveredFeature, setHoveredFeature] = useState<MapFeature | null>(null);
  const [mouseCoords, setMouseCoords] = useState<{ lng: number; lat: number } | null>(null);
  const [streamProgress, setStreamProgress] = useState<number>(0);
  const [initialBoundsSet, setInitialBoundsSet] = useState(false);
  const mapRef = useRef<MapRef>(null);

  const {
    viewState,
    onMove,
    updateViewFromBounds,
    getViewportBounds
  } = useMapView(bounds, coordinateSystem);

  const { previewState, cacheStats } = usePreviewState({
    onPreviewUpdate: () => {
      setIsLoading(false);
      console.debug('[DEBUG] Preview updated:', {
        coordinateSystem,
        viewState,
        bounds,
        features: {
          points: previewState.points.features.length,
          lines: previewState.lines.features.length,
          polygons: previewState.polygons.features.length
        }
      });
    },
    previewManager: preview?.previewManager ?? null,
    viewportBounds: getViewportBounds(),
    visibleLayers,
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
      <LoadingOverlay isLoading={isLoading} />
      <ProgressBar progress={streamProgress} />
      <ErrorOverlay error={error} />

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
          {previewState && (
            <MapLayers
              points={previewState.points || { type: 'FeatureCollection', features: [] }}
              lines={previewState.lines || { type: 'FeatureCollection', features: [] }}
              polygons={previewState.polygons || { type: 'FeatureCollection', features: [] }}
            />
          )}

          <MapAttribution />

          <StatsControl
            visibleCount={previewState?.visibleCount || 0}
            totalCount={previewState?.totalCount || 0}
            pointsCount={previewState?.points?.features?.length || 0}
            zoomLevel={viewState.zoom}
            minZoomForUnclustered={MIN_ZOOM_FOR_UNCLUSTERED}
            cacheHitRate={cacheStats?.hitRate || 0}
          />

          <CoordinatesControl coordinates={mouseCoords} />
          <FeatureTooltip feature={hoveredFeature} />
        </Map>
      </div>
    </div>
  );
}
