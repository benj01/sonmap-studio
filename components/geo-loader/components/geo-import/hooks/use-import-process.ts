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
    errors: stats.errors
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

      // Create feature manager
      console.debug('[DEBUG] Creating feature manager');
      const featureManager = new FeatureManager();
      await featureManager.setFeatures(result.features);

      // Return result
      return {
        features: result.features,
        coordinateSystem: options.coordinateSystem,
        statistics: convertStatistics(result.statistics),
        featureManager
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
