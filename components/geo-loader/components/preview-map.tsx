import React, { useEffect } from 'react';
import { Map, Source, Layer, AttributionControl } from 'react-map-gl';
import { COORDINATE_SYSTEMS } from '../types/coordinates';
import { layerStyles } from './map/map-layers';
import { PreviewMapProps } from '../types/map';
import { useMapView } from '../hooks/use-map-view';
import { useFeatureProcessing } from '../hooks/use-feature-processing';
import 'mapbox-gl/dist/mapbox-gl.css';

/**
 * PreviewMap Component
 * 
 * Renders a map with GeoJSON features, supporting different coordinate systems
 * and feature types (points, lines, polygons). Features can be filtered by layer
 * and include warning indicators.
 */
export function PreviewMap({ 
  preview, 
  bounds, 
  coordinateSystem = COORDINATE_SYSTEMS.WGS84,
  visibleLayers = [],
  analysis
}: PreviewMapProps) {
  const { viewState, onMove, updateViewFromBounds } = useMapView(bounds, coordinateSystem);
  
  const { pointFeatures, lineFeatures, polygonFeatures } = useFeatureProcessing({
    preview,
    coordinateSystem,
    visibleLayers,
    zoom: viewState.zoom,
    analysis
  });

  useEffect(() => {
    if (bounds) {
      updateViewFromBounds(bounds);
    }
  }, [bounds, updateViewFromBounds]);

  return (
    <div className="h-full w-full relative">
      <div className="absolute inset-0 z-0">
        <Map
          {...viewState}
          onMove={onMove}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/light-v11"
          mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
          attributionControl={false}
          reuseMaps
        >
          {pointFeatures.features.length > 0 && (
            <Source type="geojson" data={pointFeatures}>
              <Layer {...layerStyles.point} />
            </Source>
          )}

          {lineFeatures.features.length > 0 && (
            <Source type="geojson" data={lineFeatures}>
              <Layer {...layerStyles.line} />
            </Source>
          )}

          {polygonFeatures.features.length > 0 && (
            <Source type="geojson" data={polygonFeatures}>
              <Layer {...layerStyles.polygon} />
              <Layer {...layerStyles.polygonOutline} />
            </Source>
          )}

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
        </Map>
      </div>
    </div>
  );
}
