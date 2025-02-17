"use client";

import { useState, useEffect, useRef } from 'react';
import { PreviewSectionProps, PreviewAnalysis } from './types';
import { PreviewMap } from '../preview-map/index';
import { Feature, Geometry, GeoJsonProperties } from 'geojson';
import { ProcessorResult } from '../../core/processors/base/types';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../../types/coordinates';
import { coordinateSystemManager } from '../../core/coordinate-systems/coordinate-system-manager';
import { PreviewManager } from '../../preview/preview-manager';
import { CoordinateSystemManager } from '../../core/coordinate-systems/coordinate-system-manager';
import { LogManager } from '../../core/logging/log-manager';

interface ExtendedProcessorResult {
  features: Feature<Geometry, GeoJsonProperties>[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  layers: string[];
  statistics: {
    featureCount: number;
    layerCount: number;
    featureTypes: Record<string, number>;
    failedTransformations: number;
    errors: string[];
  };
  coordinateSystem: CoordinateSystem;
  previewManager: PreviewManager;
  databaseResult: {
    importedFeatures: number;
    collectionId: string;
    layerIds: string[];
    failedFeatures: string[];
    statistics: {
      importTime: number;
      validatedCount: number;
      transformedCount: number;
    };
  };
}

export function PreviewSection({
  previewManager,
  bounds,
  coordinateSystem,
  visibleLayers,
  analysis
}: PreviewSectionProps) {
  const [preview, setPreview] = useState<ExtendedProcessorResult>({
    features: [] as Feature<Geometry, GeoJsonProperties>[],
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
    previewManager,
    databaseResult: {
      importedFeatures: 0,
      collectionId: '',
      layerIds: [],
      failedFeatures: [],
      statistics: {
        importTime: 0,
        validatedCount: 0,
        transformedCount: 0
      }
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      if (!previewManagerRef.current) {
        console.warn('[PreviewSection] No preview manager available');
        return;
      }

      setIsLoading(true);
      const logger = LogManager.getInstance();
      logger.info('PreviewSection', 'Starting preview load', {
        visibleLayers,
        coordinateSystem,
        hasBounds: !!bounds,
        hasAnalysis: !!analysis,
        bounds,
        analysisFeatures: analysis?.preview?.features?.length
      });

      try {
        // Get coordinate system manager instance
        const manager = await CoordinateSystemManager.getInstance();

        // Ensure coordinate system manager is initialized
        if (!manager.isInitialized()) {
          logger.info('PreviewSection', 'Initializing coordinate system manager');
          await manager.initialize();
        }

        // For DXF files, default to Swiss LV95 if not specified
        let effectiveSystem = coordinateSystem || COORDINATE_SYSTEMS.SWISS_LV95;

        // Verify system is valid
        const isValid = await manager.validateSystem(effectiveSystem);
        if (!isValid) {
          logger.warn('PreviewSection', 'Invalid coordinate system, falling back to WGS84', {
            requestedSystem: effectiveSystem
          });
          effectiveSystem = COORDINATE_SYSTEMS.WGS84;
        }

        // Set features from analysis result if available
        if (analysis?.preview?.features) {
          logger.info('PreviewSection', 'Setting features from analysis', {
            featureCount: analysis.preview.features.length,
            coordinateSystem: effectiveSystem,
            firstFeature: analysis.preview.features[0] ? {
              type: analysis.preview.features[0].geometry.type,
              properties: analysis.preview.features[0].properties
            } : null
          });
          await previewManagerRef.current.setFeatures(analysis.preview.features);
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

        // Combine all features into an array
        const combinedFeatures: Feature<Geometry, GeoJsonProperties>[] = [
          ...(collections.points?.features || []),
          ...(collections.lines?.features || []),
          ...(collections.polygons?.features || [])
        ];

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
            features: combinedFeatures.map(f => ({...f, properties: {...f.properties, layer: 'shapes'}})),
            bounds: bounds || prev.bounds,
            layers: visibleLayers || [],
            statistics: {
              featureCount: combinedFeatures.length,
              layerCount: visibleLayers?.length || 0,
              featureTypes: combinedFeatures.reduce<Record<string, number>>((acc, feature) => {
                const type = feature.geometry.type;
                acc[type] = (acc[type] || 0) + 1;
                return acc;
              }, {}),
              failedTransformations: 0,
              errors: []
            },
            coordinateSystem: effectiveSystem,
            previewManager: previewManagerRef.current,
            databaseResult: prev.databaseResult // Preserve existing database result
          }));
          
          // Mark initial load as complete
          if (isInitialLoadRef.current) {
            isInitialLoadRef.current = false;
          }
        }
      } catch (error) {
        logger.error('PreviewSection', 'Failed to load preview', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        setError(error instanceof Error ? error.message : String(error));
      } finally {
        setIsLoading(false);
      }
    }

    if (previewManagerRef.current) {
      loadPreview();
    }
  }, [previewManager, bounds, coordinateSystem, visibleLayers, analysis]);

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
            preview={{
              points: { type: 'FeatureCollection', features: preview.features.filter(f => f.geometry.type === 'Point' || f.geometry.type === 'MultiPoint').map(f => ({...f, properties: {...f.properties, layer: 'shapes'}})) },
              lines: { type: 'FeatureCollection', features: preview.features.filter(f => f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString').map(f => ({...f, properties: {...f.properties, layer: 'shapes'}})) },
              polygons: { type: 'FeatureCollection', features: preview.features.filter(f => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon').map(f => ({...f, properties: {...f.properties, layer: 'shapes'}})) },
              bounds: preview.bounds,
              layers: preview.layers,
              previewManager: preview.previewManager,
              coordinateSystem: preview.coordinateSystem
            }}
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
