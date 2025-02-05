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
async function fileToGeoFileUpload(file: File): Promise<GeoFileUpload> {
  console.debug('[DEBUG] Converting file to GeoFileUpload:', {
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    hasRelatedFiles: !!(file as any).relatedFiles
  });

  // Function to read file as ArrayBuffer
  const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  };

  // Get companion files from relatedFiles property
  const relatedFiles = (file as any).relatedFiles || {};
  console.debug('[DEBUG] Found related files:', Object.keys(relatedFiles));

  // Convert companion files to expected format
  const companions: Record<string, { name: string; data: ArrayBuffer; type: string; size: number }> = {};
  
  // Process each companion file
  for (const [ext, companionFile] of Object.entries(relatedFiles)) {
    if (companionFile && companionFile instanceof File) {
      console.debug('[DEBUG] Processing companion file:', {
        extension: ext,
        name: companionFile.name,
        type: companionFile.type,
        size: companionFile.size
      });

      try {
        const data = await readFileAsArrayBuffer(companionFile);
        companions[ext] = {
          name: companionFile.name,
          data,
          type: companionFile.type || `application/x-${ext.slice(1)}`,
          size: companionFile.size
        };
      } catch (error) {
        console.error(`[ERROR] Failed to read companion file ${ext}:`, error);
        throw new Error(`Failed to read companion file ${ext}: ${error}`);
      }
    }
  }

  // For shapefiles, ensure we have all required companions
  if (file.name.toLowerCase().endsWith('.shp')) {
    const requiredExtensions = ['.dbf', '.shx'];
    const missingExtensions = requiredExtensions.filter(ext => !companions[ext]);
    
    if (missingExtensions.length > 0) {
      console.warn('[WARN] Missing required shapefile companions:', {
        fileName: file.name,
        missingExtensions,
        availableCompanions: Object.keys(companions)
      });
    }
  }

  // Read main file data
  let mainFileData: ArrayBuffer;
  try {
    mainFileData = await readFileAsArrayBuffer(file);
  } catch (error) {
    console.error('[ERROR] Failed to read main file:', error);
    throw new Error(`Failed to read main file: ${error}`);
  }

  const upload: GeoFileUpload = {
    mainFile: {
      name: file.name,
      data: mainFileData,
      type: file.type || 'application/x-shapefile',
      size: file.size
    },
    companions
  };

  console.debug('[DEBUG] Created GeoFileUpload:', {
    mainFileName: upload.mainFile.name,
    mainFileType: upload.mainFile.type,
    mainFileSize: upload.mainFile.data.byteLength,
    companionCount: Object.keys(upload.companions).length,
    companions: Object.keys(upload.companions).map(ext => ({
      ext,
      size: upload.companions[ext].data.byteLength
    }))
  });

  return upload;
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

      console.debug('[DEBUG] Getting processor for file:', {
        name: file.name,
        type: file.type,
        size: file.size,
        hasRelatedFiles: !!(file as any).relatedFiles
      });

      // Configure processor options
      const processorOptions: ProcessorOptions = {
        errorReporter,
        ...(coordinateSystem ? { coordinateSystem } : {}),
        ...options
      };

      // Create processor using registry
      const baseProcessor = ProcessorRegistry.getInstance().findProcessor(file.name, file.type);

      if (!baseProcessor) {
        throw new ValidationError(
          `No processor available for file: ${file.name}`,
          'UNSUPPORTED_FILE_TYPE'
        );
      }

      console.debug('[DEBUG] Found base processor:', {
        name: baseProcessor.constructor.name,
        options: processorOptions
      });

      // Create adapter with proper interface handling
      const processor: GeoProcessor = {
        // canProcess now handles both GeoFileUpload and direct file checks
        canProcess: (input: GeoFileUpload | File) => {
          try {
            if ((input as GeoFileUpload).mainFile) {
              // Handle GeoFileUpload
              const upload = input as GeoFileUpload;
              return baseProcessor.canProcess(upload.mainFile.name, upload.mainFile.type);
            } else {
              // Handle direct File
              const file = input as File;
              return baseProcessor.canProcess(file.name, file.type);
            }
          } catch (error) {
            console.error('[ERROR] Error in canProcess:', error);
            return false;
          }
        },

        analyze: async (input: GeoFileUpload | File, opts?: ProcessorOptions) => {
          let upload: GeoFileUpload;
          if ((input as GeoFileUpload).mainFile) {
            upload = input as GeoFileUpload;
          } else {
            upload = await fileToGeoFileUpload(input as File);
          }

          console.debug('[DEBUG] Analyzing file:', {
            fileName: upload.mainFile.name,
            fileType: upload.mainFile.type,
            companionFiles: Object.keys(upload.companions)
          });

          // For shapefiles, ensure we have the required companion files
          if (upload.mainFile.name.toLowerCase().endsWith('.shp')) {
            const requiredExtensions = ['.dbf', '.shx'];
            const missingExtensions = requiredExtensions.filter(ext => !upload.companions[ext]);
            if (missingExtensions.length > 0) {
              throw new ValidationError(
                `Missing required shapefile components: ${missingExtensions.join(', ')}`,
                'MISSING_COMPANION_FILES'
              );
            }
          }

          return baseProcessor.analyze(upload, { ...processorOptions, ...opts });
        },

        sample: async (input: GeoFileUpload | File, opts?: ProcessorOptions) => {
          const upload = (input as GeoFileUpload).mainFile ? input as GeoFileUpload : await fileToGeoFileUpload(input as File);
          return baseProcessor.sample(upload, { ...processorOptions, ...opts });
        },

        process: async (input: GeoFileUpload | File, opts?: ProcessorOptions) => {
          const upload = (input as GeoFileUpload).mainFile ? input as GeoFileUpload : await fileToGeoFileUpload(input as File);
          return baseProcessor.process(upload, { ...processorOptions, ...opts });
        },

        dispose: async () => {
          if (baseProcessor.dispose) {
            await baseProcessor.dispose();
          }
        }
      };

      // Configure event handlers
      const events: IProcessorEvents = {
        onWarning: (message: string, details?: Record<string, unknown>) => {
          console.debug('[DEBUG] Processor warning:', { message, details });
          onWarning(message, details);
          errorReporter.addWarning(message, 'PROCESSOR_WARNING', details);
        },
        onError: (message: string, details?: Record<string, unknown>) => {
          console.error('[ERROR] Processor error:', { message, details });
          onError(message, details);
          errorReporter.addError(message, 'PROCESSOR_ERROR', details);
        },
        onProgress: (progress: number) => {
          console.debug('[DEBUG] Processing progress:', progress);
          onProgress(progress);
        }
      };
      Object.assign(baseProcessor, events);

      processorRef.current = processor;
      return processor;
    } catch (error: unknown) {
      console.error('[ERROR] Failed to create processor:', error);
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
