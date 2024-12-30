import { useState, useEffect, useRef } from 'react';
import { PreviewSectionProps } from './types';
import { PreviewMap } from '../preview-map/index';
import { Feature, FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';
import { ProcessorResult } from '../../core/processors/base/types';
import { COORDINATE_SYSTEMS } from '../../types/coordinates';

export function PreviewSection({
  previewManager,
  bounds,
  coordinateSystem,
  visibleLayers,
  analysis
}: PreviewSectionProps) {
  const [preview, setPreview] = useState<ProcessorResult>({
    features: {
      type: 'FeatureCollection' as const,
      features: []
    },
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    layers: [],
    statistics: {
      featureCount: 0,
      layerCount: 0,
      featureTypes: {},
      failedTransformations: 0,
      errors: []
    },
    coordinateSystem: coordinateSystem || COORDINATE_SYSTEMS.WGS84
  });
  const [isLoading, setIsLoading] = useState(true);

  // Keep track of preview manager instance
  const previewManagerRef = useRef(previewManager);
  useEffect(() => {
    previewManagerRef.current = previewManager;
  }, [previewManager]);

  // Load preview when preview manager or visible layers change
  useEffect(() => {
    async function loadPreview() {
      if (!previewManagerRef.current) return;
      
      setIsLoading(true);
      console.debug('[DEBUG] Loading preview with visible layers:', visibleLayers);
      try {
        // Only get collections if we have visible layers
        const { points, lines, polygons } = await previewManagerRef.current.getPreviewCollections();
        
        // Combine all features into one collection for the map
        const combinedFeatures: FeatureCollection = {
          type: 'FeatureCollection',
          features: [
            ...points.features,
            ...lines.features,
            ...polygons.features
          ]
        };
        
        setPreview(prev => ({
          features: combinedFeatures as FeatureCollection,
          bounds: bounds || prev.bounds,
          layers: visibleLayers || prev.layers,
          statistics: {
            featureCount: combinedFeatures.features.length,
            layerCount: visibleLayers?.length || 0,
            featureTypes: combinedFeatures.features.reduce((acc, f) => {
              const type = f.geometry.type;
              acc[type] = (acc[type] || 0) + 1;
              return acc;
            }, {} as Record<string, number>),
            failedTransformations: 0,
            errors: []
          },
          coordinateSystem: coordinateSystem || prev.coordinateSystem
        }));
      } catch (error) {
        console.error('Failed to load preview:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadPreview();
  }, [previewManager, visibleLayers]); // Depend on both preview manager and visible layers changes

  return (
    <div className="border rounded-lg p-4">
      <h4 className="text-sm font-medium mb-2">Preview</h4>
      <div className="h-[400px] w-full bg-accent rounded-md overflow-hidden">
        {isLoading ? (
          <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
            Loading preview...
          </div>
        ) : (
          <PreviewMap
            preview={preview}
            bounds={bounds}
            coordinateSystem={coordinateSystem}
            visibleLayers={visibleLayers}
            analysis={analysis ? {
              ...analysis,
              warnings: analysis.warnings || []
            } : {
              warnings: [],
              statistics: preview.statistics,
              coordinateSystem: preview.coordinateSystem
            }}
          />
        )}
      </div>
    </div>
  );
}
