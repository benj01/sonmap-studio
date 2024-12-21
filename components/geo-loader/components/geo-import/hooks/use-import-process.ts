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
      // Only pass valid ProcessorOptions
      const processor = await getProcessor(file, {
        coordinateSystem: options.coordinateSystem,
        selectedLayers: options.selectedLayers,
        selectedTypes: options.selectedTemplates
      });

      if (!processor) {
        throw new Error(`No processor available for file: ${file.name}`);
      }

      // Create feature manager for streaming support
      const featureManager = new FeatureManager({
        chunkSize: 1000,
        maxMemoryMB: 512
      });

      // Process file with streaming support
      const processorResult = await processor.process(file);
      const features: GeoFeature[] = [];

      // Handle streaming or direct features
      if (processorResult.features && 
          typeof processorResult.features === 'object' && 
          Symbol.asyncIterator in processorResult.features) {
        for await (const feature of processorResult.features[Symbol.asyncIterator]()) {
          await featureManager.addFeature(feature);
          features.push(feature as GeoFeature);
        }
      } else {
        for (const feature of processorResult.features.features) {
          await featureManager.addFeature(feature);
          features.push(feature as GeoFeature);
        }
      }

      // Convert ProcessorResult to LoaderResult
      const result: LoaderResult = {
        features,
        bounds: processorResult.bounds,
        layers: processorResult.layers || [],
        coordinateSystem: processorResult.coordinateSystem,
        statistics: convertStatistics(processorResult.statistics)
      };

      // Clean up
      featureManager.clear();

      // Log import statistics
      const importLogs: { message: string; type: 'info' | 'warning' | 'error' }[] = [];

      if (result.coordinateSystem) {
        importLogs.push({
          message: `Using coordinate system: ${result.coordinateSystem}`,
          type: 'info'
        });
      }

      if (result.statistics) {
        importLogs.push({
          message: `Imported ${result.statistics.pointCount} features`,
          type: 'info'
        });

        if (result.statistics.layerCount) {
          importLogs.push({
            message: `Found ${result.statistics.layerCount} layers`,
            type: 'info'
          });
        }

        Object.entries(result.statistics.featureTypes).forEach(([type, count]) => {
          importLogs.push({
            message: `- ${count} ${type} features`,
            type: 'info'
          });
        });

        if (result.statistics.failedTransformations && result.statistics.failedTransformations > 0) {
          importLogs.push({
            message: `Warning: ${result.statistics.failedTransformations} features failed coordinate transformation`,
            type: 'warning'
          });
        }

        if (result.statistics.errors && result.statistics.errors.length > 0) {
          result.statistics.errors.forEach((error: { type: string; message?: string; count: number }) => {
            importLogs.push({
              message: error.message ?
                `${error.type}: ${error.message} (${error.count} occurrence${error.count > 1 ? 's' : ''})` :
                `${error.type}: ${error.count} occurrence${error.count > 1 ? 's' : ''}`,
              type: 'error'
            });
          });
        }
      }

      // Send logs
      importLogs.forEach(log => {
        switch (log.type) {
          case 'warning':
            onWarning(log.message);
            break;
          case 'error':
            onError(log.message);
            break;
          default:
            // Use onWarning for info since we don't have onInfo
            onWarning(log.message);
        }
      });

      return result;
    } catch (error) {
      if (error instanceof GeoLoaderError) {
        onError(`Import error: ${error.message}`);
      } else {
        onError(`Failed to import file: ${error instanceof Error ? error.message : String(error)}`);
      }
      return null;
    }
  }, [getProcessor, onWarning, onError, onProgress]);

  return {
    importFile
  };
}
