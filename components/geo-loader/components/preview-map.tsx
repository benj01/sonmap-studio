import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Map, Source, Layer, AttributionControl, ViewStateChangeEvent, MapRef } from 'react-map-gl';
import { COORDINATE_SYSTEMS } from '../types/coordinates';
import { layerStyles } from './map/map-layers';
import { PreviewMapProps } from '../types/map';
import { useMapView } from '../hooks/use-map-view';
import { useFeatureProcessing } from '../hooks/use-feature-processing';
import 'mapbox-gl/dist/mapbox-gl.css';

const VIEWPORT_PADDING = 50; // pixels to add around features when focusing
const BATCH_SIZE = 1000; // number of features to process at once
const CLUSTER_RADIUS = 50; // pixels
const MIN_ZOOM_FOR_UNCLUSTERED = 14; // zoom level at which to show individual points

/**
 * PreviewMap Component
 * 
 * Renders a map with GeoJSON features, supporting different coordinate systems
 * and feature types (points, lines, polygons). Features can be filtered by layer
 * and include warning indicators. Implements clustering and progressive loading
 * for improved performance.
 */
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
  
  // Process features with viewport filtering and batching
  const { 
    pointFeatures, 
    lineFeatures, 
    polygonFeatures,
    getFeaturesByTypeAndLayer,
    totalFeatureCount,
    visibleFeatureCount
  } = useFeatureProcessing({
    preview,
    coordinateSystem,
    visibleLayers,
    zoom: viewState.zoom,
    analysis,
    viewportBounds: getViewportBounds(),
    batchSize: BATCH_SIZE
  });

  // Initial zoom to bounds
  useEffect(() => {
    if (bounds) {
      try {
        updateViewFromBounds(bounds);
        setError(null);
      } catch (err) {
        const error = err as Error;
        setError(`Failed to set initial view: ${error.message}`);
      }
    }
  }, [bounds, updateViewFromBounds]);

  // Focus on selected element with padding
  useEffect(() => {
    if (selectedElement && preview) {
      try {
        const features = getFeaturesByTypeAndLayer(
          selectedElement.type,
          selectedElement.layer
        );
        if (features.length > 0) {
          focusOnFeatures(features, VIEWPORT_PADDING);
          setError(null);
        }
      } catch (err) {
        const error = err as Error;
        setError(`Failed to focus on selected element: ${error.message}`);
      }
    }
  }, [selectedElement, preview, getFeaturesByTypeAndLayer, focusOnFeatures]);

  // Handle loading state with batching feedback
  useEffect(() => {
    setIsLoading(false);
  }, [preview, visibleLayers]);

  // Memoize layer components with clustering for points
  const layerComponents = useMemo(() => {
    const components = [];

    if (pointFeatures.features.length > 0) {
      components.push(
        <Source
          key="points"
          type="geojson"
          data={pointFeatures}
          cluster={true}
          clusterMaxZoom={MIN_ZOOM_FOR_UNCLUSTERED}
          clusterRadius={CLUSTER_RADIUS}
        >
          {/* Clustered points */}
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
          
          {/* Cluster count */}
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

          {/* Unclustered points */}
          <Layer
            {...layerStyles.point}
            filter={['!', ['has', 'point_count']]}
          />
        </Source>
      );
    }

    if (lineFeatures.features.length > 0) {
      components.push(
        <Source key="lines" type="geojson" data={lineFeatures}>
          <Layer {...layerStyles.line} />
        </Source>
      );
    }

    if (polygonFeatures.features.length > 0) {
      components.push(
        <Source key="polygons" type="geojson" data={polygonFeatures}>
          <Layer {...layerStyles.polygon} />
          <Layer {...layerStyles.polygonOutline} />
        </Source>
      );
    }

    return components;
  }, [pointFeatures, lineFeatures, polygonFeatures]);

  // Handle move/zoom events with viewport filtering
  const handleMapMove = useCallback((evt: ViewStateChangeEvent) => {
    onMove(evt);
  }, [onMove]);

  // Handle feature hover interactions
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
            Loading preview... {visibleFeatureCount} of {totalFeatureCount} features processed
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
          
          {/* Feature count and viewport indicators */}
          <div className="absolute top-2 right-2 bg-background/80 text-xs p-2 rounded flex flex-col gap-1">
            <div>
              Showing {visibleFeatureCount} of {totalFeatureCount} features
            </div>
            {viewState.zoom < MIN_ZOOM_FOR_UNCLUSTERED && pointFeatures.features.length > 0 && (
              <div className="text-muted-foreground">
                Zoom in to view individual points
              </div>
            )}
          </div>

          {/* Hover tooltip */}
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
