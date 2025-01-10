import { IProcessor } from './interfaces';
import { ProcessorOptions } from './types';
import { ValidationError } from '../../errors/types';
import { createErrorReporter } from '../../errors/reporter';

// Helper type for processor registration
export type ProcessorConstructor = new (options: ProcessorOptions) => IProcessor;

/**
 * Registry for file processors
 */
export class ProcessorRegistry {
  private static processors = new Map<string, ProcessorConstructor>();

  static register(extension: string, processor: ProcessorConstructor) {
    this.processors.set(extension.toLowerCase(), processor);
  }

  static async getProcessor(file: File, options: ProcessorOptions = {}): Promise<IProcessor | null> {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const ProcessorClass = this.processors.get(extension);
    
    if (!ProcessorClass) {
      return null;
    }

    try {
      // Extract related files if available
      const processorOptions = { ...options };
      const relatedFiles = (file as any).relatedFiles;
      
      if (relatedFiles) {
        // Log the raw related files for debugging
        console.debug('[DEBUG] Raw related files:', relatedFiles);
        
        // Normalize file extensions to ensure they match expected format
        const normalizedFiles: Record<string, File> = {};
        Object.entries(relatedFiles).forEach(([ext, file]) => {
          // Ensure extension starts with a dot and is lowercase
          const normalizedExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
          normalizedFiles[normalizedExt] = file as File;
        });

        processorOptions.relatedFiles = {
          dbf: normalizedFiles['.dbf'],
          shx: normalizedFiles['.shx'],
          prj: normalizedFiles['.prj']
        };
        
        console.debug('[DEBUG] Normalized companion files:', processorOptions.relatedFiles);
      }

      const processor = new ProcessorClass(processorOptions);
      console.debug('[DEBUG] Created processor with options:', {
        hasRelatedFiles: !!processorOptions.relatedFiles,
        relatedFileTypes: processorOptions.relatedFiles ? Object.keys(processorOptions.relatedFiles) : []
      });
      const canProcess = await processor.canProcess(file);
      
      if (!canProcess) {
        console.debug('[DEBUG] Processor cannot handle file:', file.name);
        return null;
      }

      return processor;
    } catch (error) {
      const errorReporter = options.errorReporter || createErrorReporter();
      errorReporter.addError(
        `Failed to create processor for ${file.name}: ${error instanceof Error ? error.message : String(error)}`,
        'PROCESSOR_CREATION_ERROR',
        { file: file.name, extension, error: error instanceof Error ? error.message : String(error) }
      );
      return null;
    }
  }

  static getSupportedExtensions(): string[] {
    return Array.from(this.processors.keys());
  }
}

/**
 * Create a processor for the given file
 * @throws {ValidationError} If no processor is available for the file type
 */
export function createProcessor(file: File, options: ProcessorOptions = {}): Promise<IProcessor | null> {
  return ProcessorRegistry.getProcessor(file, options);
}
