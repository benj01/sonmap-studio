import { useState, useEffect, useRef } from 'react';
import { PreviewSectionProps, PreviewAnalysis } from './types';
import { PreviewMap } from '../preview-map/index';
import { Feature, FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';
import { ProcessorResult } from '../../core/processors/base/types';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../../types/coordinates';
import { coordinateSystemManager } from '../../core/coordinate-system-manager';

type ExtendedProcessorResult = ProcessorResult & {
  previewManager: NonNullable<PreviewSectionProps['previewManager']>;
};

export function PreviewSection({
  previewManager,
  bounds,
  coordinateSystem,
  visibleLayers,
  analysis
}: PreviewSectionProps) {
  const [preview, setPreview] = useState<ExtendedProcessorResult>({
    features: {
      type: 'FeatureCollection',
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
    coordinateSystem: coordinateSystem || COORDINATE_SYSTEMS.WGS84,
    previewManager // This is required by PreviewMap
  });
  const [isLoading, setIsLoading] = useState(true);

  // Keep track of preview manager instance
  const previewManagerRef = useRef(previewManager);
  useEffect(() => {
    previewManagerRef.current = previewManager;
    // Update preview state when previewManager changes
    setPreview(prev => ({ ...prev, previewManager }));
  }, [previewManager]);

  // Load preview when preview manager, visible layers, or coordinate system changes
  useEffect(() => {
    async function loadPreview() {
      if (!previewManagerRef.current) return;
      
      setIsLoading(true);
      console.debug('[DEBUG] Loading preview:', {
        visibleLayers,
        coordinateSystem,
        hasBounds: !!bounds,
        hasAnalysis: !!analysis
      });

      try {
        // Ensure coordinate system manager is initialized
        if (!coordinateSystemManager.isInitialized()) {
          await coordinateSystemManager.initialize();
        }

        // Validate coordinate system
        const isSupported = coordinateSystemManager.getSupportedSystems().includes(coordinateSystem || COORDINATE_SYSTEMS.WGS84);
        if (!isSupported) {
          console.warn('[DEBUG] Unsupported coordinate system, falling back to WGS84');
        }

        const effectiveSystem = isSupported ? coordinateSystem || COORDINATE_SYSTEMS.WGS84 : COORDINATE_SYSTEMS.WGS84;

        // Set features from analysis result if available
        if (analysis?.preview?.features) {
          await previewManagerRef.current.setFeatures(analysis.preview.features);
          console.debug('[DEBUG] Set features from analysis:', {
            featureCount: analysis.preview.features.length,
            coordinateSystem: effectiveSystem
          });
        }

        // Update preview manager options after setting features
        previewManagerRef.current.setOptions({
          coordinateSystem: effectiveSystem,
          analysis: {
            warnings: [
              ...(analysis?.warnings?.map(w => w.message) || []),
              ...(!isSupported ? ['Unsupported coordinate system, using WGS84'] : [])
            ]
          }
        });
        
        // Get collections with updated options
        const collections = await previewManagerRef.current.getPreviewCollections();
        if (!collections) {
          console.warn('[DEBUG] No preview collections available');
          return;
        }
        
        // Combine all features into one collection for the map
        const combinedFeatures: FeatureCollection = {
          type: 'FeatureCollection',
          features: [
            ...(collections.points?.features || []),
            ...(collections.lines?.features || []),
            ...(collections.polygons?.features || [])
          ]
        };
        
        console.debug('[DEBUG] Preview features loaded:', {
          points: collections.points?.features.length || 0,
          lines: collections.lines?.features.length || 0,
          polygons: collections.polygons?.features.length || 0,
          coordinateSystem: effectiveSystem
        });

        setPreview(prev => ({
          ...prev,
          features: combinedFeatures,
          bounds: bounds || prev.bounds,
          layers: visibleLayers || [],
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
          coordinateSystem: effectiveSystem,
          previewManager: previewManagerRef.current
        }));
      } catch (error) {
        console.error('[DEBUG] Failed to load preview:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadPreview();
  }, [previewManager, visibleLayers, coordinateSystem, bounds, analysis]);

  const currentAnalysis: PreviewAnalysis = analysis ? {
    ...analysis,
    warnings: analysis.warnings || []
  } : {
    warnings: [],
    statistics: preview.statistics,
    coordinateSystem: preview.coordinateSystem
  };

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
            coordinateSystem={preview.coordinateSystem}
            visibleLayers={visibleLayers}
            analysis={currentAnalysis}
          />
        )}
      </div>
    </div>
  );
}
