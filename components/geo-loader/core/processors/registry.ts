import { FileProcessor } from './base/interfaces';
import { ShapefileProcessor } from './implementations/shapefile/processor';
import { GeoJSONProcessor } from './implementations/geojson/processor';
import { LogManager } from '../logging/log-manager';

/**
 * Registry for file processors
 */
export class ProcessorRegistry {
  private static instance: ProcessorRegistry;
  private readonly processors: FileProcessor[] = [];
  private readonly logger = LogManager.getInstance();
  private readonly LOG_SOURCE = 'ProcessorRegistry';

  private constructor() {
    this.registerDefaultProcessors();
  }

  public static getInstance(): ProcessorRegistry {
    if (!ProcessorRegistry.instance) {
      ProcessorRegistry.instance = new ProcessorRegistry();
    }
    return ProcessorRegistry.instance;
  }

  /**
   * Register a new processor
   */
  public register(processor: FileProcessor): void {
    this.processors.push(processor);
    this.logger.debug(this.LOG_SOURCE, 'Registered processor', { processor });
  }

  /**
   * Find a processor that can handle the given file
   */
  public findProcessor(fileName: string, mimeType?: string): FileProcessor | undefined {
    this.logger.debug(this.LOG_SOURCE, 'Finding processor for file', { fileName, mimeType });

    for (const processor of this.processors) {
      try {
        if (processor.canProcess(fileName, mimeType)) {
          this.logger.debug(this.LOG_SOURCE, 'Found compatible processor', { processor });
          return processor;
        }
      } catch (error) {
        this.logger.error(this.LOG_SOURCE, 'Error checking processor compatibility', { error });
      }
    }

    this.logger.warn(this.LOG_SOURCE, 'No processor available for file', { fileName, mimeType });
    return undefined;
  }

  /**
   * Register default processors
   */
  private registerDefaultProcessors(): void {
    this.logger.debug(this.LOG_SOURCE, 'Registering default processors');
    
    // Register shapefile processor
    this.register(new ShapefileProcessor());
    
    // Register GeoJSON processor
    this.register(new GeoJSONProcessor());
    
    this.logger.debug(this.LOG_SOURCE, 'Default processors registered');
  }

  /**
   * Get all registered processors
   */
  public getAllProcessors(): FileProcessor[] {
    return this.processors;
  }

  /**
   * Get supported file extensions
   */
  public getSupportedExtensions(): string[] {
    const extensions = new Set<string>();
    
    for (const processor of this.processors) {
      try {
        // Test some common extensions against each processor
        const testExtensions = ['.shp', '.geojson', '.json', '.kml', '.kmz'];
        for (const ext of testExtensions) {
          if (processor.canProcess(`test${ext}`)) {
            extensions.add(ext);
          }
        }
      } catch (error) {
        this.logger.error(this.LOG_SOURCE, 'Error getting supported extensions', {
          processor: processor.constructor.name,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return Array.from(extensions);
  }

  /**
   * Clear all registered processors
   */
  public clear(): void {
    this.processors.length = 0;
    this.logger.debug(this.LOG_SOURCE, 'Cleared processor registry');
  }

  /**
   * Check if a file type is supported
   */
  public isSupported(fileName: string, mimeType?: string): boolean {
    return this.findProcessor(fileName, mimeType) !== undefined;
  }

  /**
   * Get detailed support information
   */
  public getSupportInfo(): {
    extensions: string[];
    processors: Array<{
      name: string;
      supportedFormats: string[];
    }>;
  } {
    const info = {
      extensions: this.getSupportedExtensions(),
      processors: this.processors.map((processor) => ({
        name: processor.constructor.name,
        supportedFormats: this.getProcessorFormats(processor)
      }))
    };

    this.logger.debug(this.LOG_SOURCE, 'Retrieved processor support information', info);
    return info;
  }

  private getProcessorFormats(processor: FileProcessor): string[] {
    const formats: string[] = [];
    const testExtensions = ['.shp', '.geojson', '.json', '.kml', '.kmz'];
    
    for (const ext of testExtensions) {
      try {
        if (processor.canProcess(`test${ext}`)) {
          formats.push(ext.slice(1).toUpperCase());
        }
      } catch (error) {
        this.logger.error(this.LOG_SOURCE, 'Error checking processor format support', {
          processor: processor.constructor.name,
          format: ext,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return formats;
  }
} 