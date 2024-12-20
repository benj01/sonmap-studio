import { useRef, useCallback } from 'react';
import { ProcessorOptions, createProcessor } from '../../../processors';
import { GeoLoaderError } from '../../../utils/errors';

interface ProcessorHookProps {
  onWarning: (message: string) => void;
  onError: (message: string) => void;
  onProgress: (progress: number) => void;
}

export function useProcessor({
  onWarning,
  onError,
  onProgress
}: ProcessorHookProps) {
  const processorRef = useRef<any>(null);

  const getProcessor = useCallback(async (file: File, options: Partial<ProcessorOptions> = {}) => {
    try {
      // Return existing processor if available
      if (processorRef.current) {
        return processorRef.current;
      }

      // Create new processor
      const processor = await createProcessor(file, {
        onWarning,
        onError,
        onProgress,
        ...options
      } as ProcessorOptions);

      if (!processor) {
        throw new Error(`No processor available for file: ${file.name}`);
      }

      processorRef.current = processor;
      return processor;
    } catch (error: unknown) {
      if (error instanceof GeoLoaderError) {
        onError(`Processor error: ${error.message}`);
      } else {
        onError(`Failed to create processor: ${error instanceof Error ? error.message : String(error)}`);
      }
      return null;
    }
  }, [onWarning, onError, onProgress]);

  const resetProcessor = useCallback(() => {
    processorRef.current = null;
  }, []);

  return {
    getProcessor,
    resetProcessor
  };
}
