import { useCallback } from 'react';
import { ProcessorOptions, ProcessorStats, createProcessor } from '../../../processors';
import { CoordinateSystem } from '../../../types/coordinates';
import { LoaderResult, GeoFeature } from 'types/geo';
import { CoordinateSystemError, TransformationError } from '../../../utils/coordinate-systems';

interface ImportProcessProps {
  onWarning: (message: string) => void;
  onError: (message: string) => void;
  onProgress: (progress: number) => void;
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
  onProgress
}: ImportProcessProps) {
  const importFile = useCallback(async (
    file: File,
    options: ImportOptions
  ): Promise<LoaderResult | null> => {
    try {
      const processor = await createProcessor(file, {
        onWarning,
        onError,
        onProgress,
        coordinateSystem: options.coordinateSystem,
        selectedLayers: options.selectedLayers,
        selectedTypes: options.selectedTemplates
      } as ProcessorOptions);

      if (!processor) {
        throw new Error(`No processor available for file: ${file.name}`);
      }

      const processorResult = await processor.process(file);

      // Convert ProcessorResult to LoaderResult
      const result: LoaderResult = {
        features: processorResult.features.features as GeoFeature[],
        bounds: processorResult.bounds,
        layers: processorResult.layers || [],
        coordinateSystem: processorResult.coordinateSystem,
        statistics: convertStatistics(processorResult.statistics)
      };

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
          result.statistics.errors.forEach(error => {
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
      if (error instanceof CoordinateSystemError) {
        onError(`Coordinate system error: ${error.message}`);
      } else if (error instanceof TransformationError) {
        onError(`Transformation error: ${error.message}`);
      } else {
        onError(`Import error: ${error instanceof Error ? error.message : String(error)}`);
      }
      return null;
    }
  }, [onWarning, onError, onProgress]);

  return {
    importFile
  };
}
