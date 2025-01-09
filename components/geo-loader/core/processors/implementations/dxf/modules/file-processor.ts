import { DxfParserWrapper } from '../parsers/dxf-parser-wrapper';
import { DxfEntityProcessor } from './entity-processor';
import { DxfAnalyzer } from './analyzer';
import { DxfLayerProcessor } from './layer-processor';
import { ValidationError } from '../../../../errors/types';
import { 
  DxfEntity, 
  DxfParseOptions, 
  DxfStructure 
} from '../types';
import { PostGISConverter } from './postgis-converter';

/**
 * Handles DXF file processing operations
 */
export class FileProcessor {
  private parser: DxfParserWrapper;

  constructor() {
    this.parser = DxfParserWrapper.getInstance();
  }

  /**
   * Check if file can be processed
   */
  canProcess(file: File): boolean {
    return file.name.toLowerCase().endsWith('.dxf');
  }

  /**
   * Parse DXF file content
   */
  async parseFile(
    file: File,
    options: DxfParseOptions
  ): Promise<{
    structure: DxfStructure;
    entities: DxfEntity[];
    layers: string[];
  }> {
    try {
      console.debug('[DXF_DEBUG] Starting DXF parsing for:', file.name);
      const text = await file.text();
      console.debug('[DXF_DEBUG] File content length:', text.length);

      const structure = await this.parser.parse(text, options) as DxfStructure;
      const entities = await DxfEntityProcessor.extractEntities(structure);
      const layers = DxfLayerProcessor.extractLayerNames(structure.layers || []);

      return { structure, entities, layers };
    } catch (error) {
      throw new ValidationError(
        'Failed to parse DXF file',
        'PARSE_ERROR',
        undefined,
        { originalError: error }
      );
    }
  }

  /**
   * Validate DXF entities
   */
  validateEntities(entities: DxfEntity[]): void {
    if (!entities || entities.length === 0) {
      throw new ValidationError('No entities to validate', 'VALIDATION_ERROR');
    }

    for (const entity of entities) {
      if (!entity.type) {
        throw new ValidationError('Entity missing required type property', 'VALIDATION_ERROR');
      }
      if (!entity.attributes) {
        throw new ValidationError('Entity missing required attributes', 'VALIDATION_ERROR');
      }

      if (!PostGISConverter.validateEntityData(entity)) {
        throw new ValidationError(
          `Invalid data for entity type: ${entity.type}`,
          'VALIDATION_ERROR',
          undefined,
          { entity }
        );
      }
    }
  }

  /**
   * Calculate bounds from entities
   */
  calculateBounds(entities: DxfEntity[]): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    if (entities.length === 0) {
      return {
        minX: 0,
        minY: 0,
        maxX: 0,
        maxY: 0
      };
    }
    return DxfAnalyzer.calculateBoundsFromEntities(entities) || {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0
    };
  }

  /**
   * Process file in chunks
   */
  async processInChunks(
    entities: DxfEntity[],
    chunkSize: number,
    processChunk: (chunk: DxfEntity[], index: number) => Promise<void>
  ): Promise<void> {
    for (let i = 0; i < entities.length; i += chunkSize) {
      const chunk = entities.slice(i, i + chunkSize);
      await processChunk(chunk, Math.floor(i / chunkSize));
    }
  }

  /**
   * Detect coordinate system from file content
   */
  detectCoordinateSystem(
    bounds: ReturnType<typeof this.calculateBounds>,
    structure: DxfStructure
  ): {
    system: any; // Replace with proper coordinate system type
    confidence: 'high' | 'medium' | 'low';
    reason?: string;
  } {
    return DxfAnalyzer.detectCoordinateSystem(bounds, structure);
  }

  /**
   * Get file metadata
   */
  getMetadata(file: File): {
    name: string;
    size: number;
    lastModified: Date;
  } {
    return {
      name: file.name,
      size: file.size,
      lastModified: new Date(file.lastModified)
    };
  }
}
