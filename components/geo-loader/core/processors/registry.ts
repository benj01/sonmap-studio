import { FileProcessor } from './base/interfaces';
import { ShapefileProcessor } from './implementations/shapefile/processor';
import { GeoJSONProcessor } from './implementations/geojson/processor';
import { LogManager } from '../logging/log-manager';

export class ProcessorRegistry {
  private static instance: ProcessorRegistry;
  private readonly processors: Map<string, FileProcessor>;
  private readonly logger = LogManager.getInstance();
  private readonly LOG_SOURCE = 'ProcessorRegistry';

  private constructor() {
    this.processors = new Map();
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
    const id = processor.constructor.name;
    this.processors.set(id, processor);
    this.logger.debug(this.LOG_SOURCE, 'Registered new processor', { id });
  }

  /**
   * Get a processor that can handle the given file
   */
  public getProcessorForFile(fileName: string, mimeType?: string): FileProcessor | null {
    for (const processor of this.processors.values()) {
      try {
        if (processor.canProcess(fileName, mimeType)) {
          return processor;
        }
      } catch (error) {
        this.logger.error(this.LOG_SOURCE, 'Error checking processor compatibility', {
          processor: processor.constructor.name,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    this.logger.warn(this.LOG_SOURCE, 'No processor available for file', {
      fileName,
      mimeType,
      availableProcessors: Array.from(this.processors.keys())
    });

    return null;
  }

  /**
   * Get all registered processors
   */
  public getAllProcessors(): FileProcessor[] {
    return Array.from(this.processors.values());
  }

  /**
   * Get supported file extensions
   */
  public getSupportedExtensions(): string[] {
    const extensions = new Set<string>();
    
    for (const processor of this.processors.values()) {
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
   * Register default processors
   */
  private registerDefaultProcessors(): void {
    try {
      // Register Shapefile processor
      this.register(new ShapefileProcessor());

      // Register GeoJSON processor
      this.register(new GeoJSONProcessor());

      this.logger.info(this.LOG_SOURCE, 'Default processors registered successfully');
    } catch (error) {
      this.logger.error(this.LOG_SOURCE, 'Failed to register default processors', { 
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Clear all registered processors
   */
  public clear(): void {
    this.processors.clear();
    this.logger.debug(this.LOG_SOURCE, 'Cleared processor registry');
  }

  /**
   * Check if a file type is supported
   */
  public isSupported(fileName: string, mimeType?: string): boolean {
    return this.getProcessorForFile(fileName, mimeType) !== null;
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
      processors: Array.from(this.processors.entries()).map(([name, processor]) => ({
        name,
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