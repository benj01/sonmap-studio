import { useCallback } from 'react';
import { ProcessorOptions } from '../../../core/processors/base/types';
import { ProcessorStats } from '../../../core/processors/base/types';
import { CoordinateSystem } from '../../../types/coordinates';
import { LoaderResult, GeoFeature } from '../../../../../types/geo';
import { GeoLoaderError } from '../../../core/errors/types';
import { FeatureManager } from '../../../core/feature-manager';
import { FeatureCollection } from 'geojson';

interface ImportProcessProps {
  onWarning: (message: string) => void;
  onError: (message: string) => void;
  onProgress: (progress: number) => void;
  getProcessor: (file: File, options?: Partial<ProcessorOptions>) => Promise<any>;
}

interface ImportOptions {
  coordinateSystem?: CoordinateSystem;
  selectedLayers: string[];
  selectedTemplates: string[];
}

function convertStatistics(stats: ProcessorStats) {
  return {
    pointCount: stats.featureCount,
    layerCount: stats.layerCount,
    featureTypes: stats.featureTypes,
    failedTransformations: stats.failedTransformations,
    errors: stats.errors.map(error => ({
      type: 'error',
      message: error,
      count: 1
    }))
  };
}

export function useImportProcess({
  onWarning,
  onError,
  onProgress,
  getProcessor
}: ImportProcessProps) {
  const importFile = useCallback(async (
    file: File,
    options: ImportOptions
  ): Promise<LoaderResult | null> => {
    try {
      console.debug('[DEBUG] Starting file import with options:', options);

      // Get processor for file type
      const processor = await getProcessor(file, {
        coordinateSystem: options.coordinateSystem,
        selectedLayers: options.selectedLayers,
        selectedTypes: options.selectedTemplates
      });

      if (!processor) {
        throw new GeoLoaderError(
          `No processor available for file: ${file.name}`,
          'PROCESSOR_NOT_FOUND'
        );
      }

      // Process the file
      console.debug('[DEBUG] Processing file with processor');
      const result = await processor.process(file);

      if (!result) {
        throw new GeoLoaderError(
          'Processor returned no result',
          'PROCESSOR_NO_RESULT'
        );
      }

      // Create feature manager and initialize with features and visible layers
      console.debug('[DEBUG] Creating feature manager with layers:', {
        layers: result.layers,
        selectedLayers: options.selectedLayers
      });
      
      const featureManager = new FeatureManager();
      await featureManager.setFeatures(result.features);
      
      // Set initially visible layers - use either selected layers from options
      // or all layers if none specified
      const initialVisibleLayers = options.selectedLayers?.length 
        ? options.selectedLayers 
        : result.layers;
        
      console.debug('[DEBUG] Setting initial visible layers:', initialVisibleLayers);
      featureManager.setVisibleLayers(initialVisibleLayers);

      return {
        features: result.features,
        coordinateSystem: options.coordinateSystem,
        statistics: convertStatistics(result.statistics),
        bounds: result.bounds,
        layers: result.layers
      };
    } catch (error) {
      console.error('[ERROR] Import failed:', error);
      if (error instanceof Error) {
        onError(error.message);
      } else {
        onError(String(error));
      }
      return null;
    }
  }, [getProcessor, onError]);

  return {
    importFile
  };
}
