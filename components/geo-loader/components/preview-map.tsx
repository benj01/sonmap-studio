import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Map, Source, Layer, AttributionControl, ViewStateChangeEvent, MapRef } from 'react-map-gl';
import { COORDINATE_SYSTEMS } from '../types/coordinates';
import { layerStyles } from './map/map-layers';
import { PreviewMapProps } from '../types/map';
import { useMapView } from '../hooks/use-map-view';
import 'mapbox-gl/dist/mapbox-gl.css';
import bboxPolygon from '@turf/bbox-polygon';
import booleanIntersects from '@turf/boolean-intersects';
import { FeatureCollection, Feature } from 'geojson';
import { createPreviewManager, PreviewManager } from '../preview/preview-manager';

/**
 * Updated PreviewMap:
 * 
 * Instead of using `useFeatureProcessing`, we directly use a `PreviewManager` to get features.
 * We also apply viewport filtering here manually if required. This ensures we only show features
 * in the current viewport. For large data sets, you could incorporate the `FeatureSampler` or 
 * other strategies.
 */
const VIEWPORT_PADDING = 50;
const CLUSTER_RADIUS = 50;
const MIN_ZOOM_FOR_UNCLUSTERED = 14;

export function PreviewMap({
  preview,
  bounds,
  coordinateSystem = COORDINATE_SYSTEMS.WGS84,
  visibleLayers = [],
  selectedElement,
  analysis
}: PreviewMapProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredFeature, setHoveredFeature] = useState<any>(null);
  const mapRef = React.useRef<MapRef>(null);

  const {
    viewState,
    onMove,
    updateViewFromBounds,
    focusOnFeatures,
    getViewportBounds
  } = useMapView(bounds, coordinateSystem);

  // Initialize preview manager
  const previewManagerRef = React.useRef<PreviewManager | null>(null);

  useEffect(() => {
    // Create or update the preview manager whenever preview or visibleLayers changes
    const pm = createPreviewManager({
      maxFeatures: 5000,
      visibleLayers,
      analysis
    });
    pm.setFeatures(preview);
    previewManagerRef.current = pm;
    setIsLoading(false);
  }, [preview, visibleLayers, analysis]);

  // Initial zoom to bounds
  useEffect(() => {
    if (bounds) {
      try {
        updateViewFromBounds(bounds);
        setError(null);
      } catch (err) {
        const e = err as Error;
        setError(`Failed to set initial view: ${e.message}`);
      }
    }
  }, [bounds, updateViewFromBounds]);

  // Focus on selected element if needed
  useEffect(() => {
    if (selectedElement && previewManagerRef.current) {
      try {
        const features = previewManagerRef.current.getFeaturesByTypeAndLayer(
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
  }, [selectedElement, focusOnFeatures]);

  const handleMapMove = useCallback((evt: ViewStateChangeEvent) => {
    onMove(evt);
  }, [onMove]);

  // Filter features by viewport if needed
  const viewportBounds = getViewportBounds();
  const viewportPolygon = useMemo(() => viewportBounds ? bboxPolygon(viewportBounds) : null, [viewportBounds]);

  const {
    points, lines, polygons, totalCount, visibleCount
  } = useMemo(() => {
    if (!previewManagerRef.current) {
      return {
        points: { type: 'FeatureCollection', features: [] },
        lines: { type: 'FeatureCollection', features: [] },
        polygons: { type: 'FeatureCollection', features: [] },
        totalCount: 0,
        visibleCount: 0
      };
    }

    const { points, lines, polygons, totalCount, visibleCount } = previewManagerRef.current.getPreviewCollections();
    
    // If viewport filtering is desired, filter features here:
    const filterByViewport = (fc: FeatureCollection) => {
      if (!viewportPolygon) return fc;
      const filtered = fc.features.filter((f: Feature) => booleanIntersects(f, viewportPolygon));
      return { ...fc, features: filtered };
    };

    const filteredPoints = filterByViewport(points);
    const filteredLines = filterByViewport(lines);
    const filteredPolygons = filterByViewport(polygons);

    const filteredVisibleCount = filteredPoints.features.length + filteredLines.features.length + filteredPolygons.features.length;

    return {
      points: filteredPoints,
      lines: filteredLines,
      polygons: filteredPolygons,
      totalCount,
      visibleCount: filteredVisibleCount
    };
  }, [viewportPolygon]);

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

  const handleMouseMove = useCallback((event: any) => {
    const features = event.features || [];
    setHoveredFeature(features[0]);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredFeature(null);
  }, []);

  return (
    <div className="h-full w-full relative">
      {isLoading && (
        <div className="absolute inset-0 bg-background/50 z-50 flex items-center justify-center">
          <div className="text-sm text-muted-foreground">
            Loading preview...
          </div>
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
          </div>

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
