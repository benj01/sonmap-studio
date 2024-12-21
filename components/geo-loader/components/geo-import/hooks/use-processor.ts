import { useRef, useCallback } from 'react';
import { ProcessorRegistry } from '../../../core/processors/base/registry';
import { ProcessorOptions } from '../../../core/processors/base/types';
import { createErrorReporter } from '../../../core/errors/reporter';
import { IProcessor, IProcessorEvents } from '../../../core/processors/base/interfaces';
import { ValidationError } from '../../../core/errors/types';
import { CoordinateSystem } from '../../../types/coordinates';

interface ProcessorHookProps extends IProcessorEvents {
  coordinateSystem?: CoordinateSystem;
  cacheTTL?: number;
}

export function useProcessor({
  onWarning,
  onError,
  onProgress,
  coordinateSystem,
  cacheTTL = 300000 // 5 minutes default TTL
}: ProcessorHookProps) {
  const processorRef = useRef<IProcessor | null>(null);
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
        coordinateSystem,
        ...options
      };

      // Create processor using registry
      const processor = await ProcessorRegistry.getProcessor(file, processorOptions);

      // Configure event handlers
      if (processor) {
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
        Object.assign(processor, events);
      }

      if (!processor) {
        const error = new ValidationError(
          `No processor available for file: ${file.name}`,
          'UNSUPPORTED_FILE_TYPE'
        );
        error.details = { fileName: file.name };
        throw error;
      }

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
      processorRef.current.clear();
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
