import { useRef, useCallback } from 'react';
import { ProcessorRegistry } from '../../../core/processors/registry';
import { ProcessorOptions } from '../../../core/processors/base/types';
import { createErrorReporter } from '../../../core/errors/reporter';
import { IProcessorEvents } from '../../../core/processors/base/interfaces';
import { ValidationError } from '../../../core/errors/types';
import { CoordinateSystem } from '../../../types/coordinates';
import { GeoProcessor } from '../../../core/processors/base/processor';
import { GeoFileUpload } from '../../../core/processors/base/types';

interface ProcessorHookProps extends IProcessorEvents {
  coordinateSystem?: CoordinateSystem;
  cacheTTL?: number;
}

// Adapter to convert File to GeoFileUpload
function fileToGeoFileUpload(file: File): GeoFileUpload {
  return {
    mainFile: {
      name: file.name,
      data: new ArrayBuffer(0), // This will be filled by the processor
      type: file.type,
      size: file.size
    },
    companions: {}
  };
}

export function useProcessor({
  onWarning,
  onError,
  onProgress,
  coordinateSystem,
  cacheTTL = 300000 // 5 minutes default TTL
}: ProcessorHookProps) {
  const processorRef = useRef<GeoProcessor | null>(null);
  const errorReporter = createErrorReporter();

  const getProcessor = useCallback(async (file: File, options: Partial<ProcessorOptions> = {}) => {
    try {
      // Return existing processor if available
      if (processorRef.current) {
        return processorRef.current;
      }

      // Configure processor options
      const processorOptions: ProcessorOptions = {
        errorReporter,
        ...(coordinateSystem ? { coordinateSystem } : {}),
        ...options
      };

      // Create processor using registry
      const baseProcessor = ProcessorRegistry.getInstance().getProcessorForFile(file.name, file.type);

      if (!baseProcessor) {
        throw new ValidationError(
          `No processor available for file: ${file.name}`,
          'UNSUPPORTED_FILE_TYPE'
        );
      }

      // Create adapter
      const processor: GeoProcessor = {
        canProcess: (upload: GeoFileUpload) => baseProcessor.canProcess(upload.mainFile.name, upload.mainFile.type),
        analyze: async (upload: GeoFileUpload, opts?: ProcessorOptions) => {
          // Implementation will be added when needed
          throw new Error('Not implemented');
        },
        sample: async (upload: GeoFileUpload, opts?: ProcessorOptions) => {
          // Implementation will be added when needed
          throw new Error('Not implemented');
        },
        process: async (upload: GeoFileUpload, opts?: ProcessorOptions) => {
          // Implementation will be added when needed
          throw new Error('Not implemented');
        },
        dispose: async () => {
          // Implementation will be added when needed
        }
      };

      // Configure event handlers
      const events: IProcessorEvents = {
        onWarning: (message: string, details?: Record<string, unknown>) => {
          onWarning(message, details);
          errorReporter.addWarning(message, 'PROCESSOR_WARNING', details);
        },
        onError: (message: string, details?: Record<string, unknown>) => {
          onError(message, details);
          errorReporter.addError(message, 'PROCESSOR_ERROR', details);
        },
        onProgress
      };
      Object.assign(baseProcessor, events);

      processorRef.current = processor;
      return processor;
    } catch (error: unknown) {
      if (error instanceof ValidationError) {
        onError(error.message, error.details);
      } else {
        onError(
          `Failed to create processor: ${error instanceof Error ? error.message : String(error)}`,
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
      return null;
    }
  }, [onWarning, onError, onProgress, coordinateSystem, cacheTTL, errorReporter]);

  const resetProcessor = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.dispose();
      processorRef.current = null;
    }
  }, []);

  return {
    getProcessor,
    resetProcessor,
    errors: errorReporter.getErrors(),
    warnings: errorReporter.getWarnings()
  };
}
