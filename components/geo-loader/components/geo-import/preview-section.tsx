"use client";

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
    previewManager // Required by PreviewMap
  });
  const [isLoading, setIsLoading] = useState(true);

  const previewManagerRef = useRef(previewManager);

  // Track whether this is the initial load
  const isInitialLoadRef = useRef(true);

  // Separate effect for previewManager changes to avoid unnecessary preview reloads
  useEffect(() => {
    if (previewManagerRef.current !== previewManager) {
      previewManagerRef.current = previewManager;
      // Only set loading on initial load or when manager changes
      if (isInitialLoadRef.current || !previewManager) {
        setIsLoading(true);
      }
    }
  }, [previewManager]);

  // Effect for loading preview data
  useEffect(() => {
    async function loadPreview() {
      // Skip if we don't have a manager
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

        // For DXF files, default to Swiss LV95 if not specified
        let effectiveSystem = coordinateSystem || COORDINATE_SYSTEMS.SWISS_LV95;

        // Verify system is supported
        if (!coordinateSystemManager.getSupportedSystems().includes(effectiveSystem)) {
          console.warn('[DEBUG] Unsupported coordinate system, falling back to WGS84');
          effectiveSystem = COORDINATE_SYSTEMS.WGS84;
        }

        // Set features from analysis result if available
        if (analysis?.preview?.features) {
          await previewManagerRef.current.setFeatures(analysis.preview.features);
          console.debug('[DEBUG] Set features from analysis:', {
            featureCount: analysis.preview.features.length,
            coordinateSystem: effectiveSystem
          });
        }

        // Always update options with current visibleLayers
        const currentOptions = previewManagerRef.current.getOptions();
        previewManagerRef.current.setOptions({
          coordinateSystem: effectiveSystem,
          // Always sync visibleLayers with current state
          visibleLayers: visibleLayers || [],
          analysis: {
            warnings: [
              ...(analysis?.warnings?.map(w => w.message) || []),
              ...(effectiveSystem === COORDINATE_SYSTEMS.WGS84 && coordinateSystem !== COORDINATE_SYSTEMS.WGS84
                ? ['Unsupported coordinate system, using WGS84']
                : []
              )
            ]
          }
        });

        // Get collections only if we need to update the preview
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

        // Always update state with new data to ensure consistency
        if (collections) {
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
          
          // Mark initial load as complete
          if (isInitialLoadRef.current) {
            isInitialLoadRef.current = false;
          }
        }
      } catch (error) {
        console.error('[DEBUG] Failed to load preview:', error);
      } finally {
        setIsLoading(false);
      }
    }

    if (previewManagerRef.current) {
      loadPreview();
    }
  }, [coordinateSystem, bounds, analysis, visibleLayers]); // Remove previewManager from dependencies

  const currentAnalysis: PreviewAnalysis = analysis
    ? {
        ...analysis,
        warnings: analysis.warnings || []
      }
    : {
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
