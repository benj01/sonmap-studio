import { Feature } from 'geojson';
import { 
  DxfParseOptions, 
  DxfStructure, 
  DxfAnalyzeResult,
  DxfEntity
} from './types';
import { ValidationError } from '../../../errors/types';
import { cleanupContent } from './utils/regex-patterns';
import { DxfParserWrapper } from './parsers/dxf-parser-wrapper';

/**
 * Handles DXF file parsing using dxf-parser library
 */
export class DxfParser {
  private wrapper: DxfParserWrapper;

  constructor() {
    this.wrapper = new DxfParserWrapper();
  }

  /**
   * Analyze DXF file structure
   */
  async analyzeStructure(
    file: File,
    options: {
      previewEntities?: number;
      parseBlocks?: boolean;
      parseText?: boolean;
      parseDimensions?: boolean;
    } = {}
  ): Promise<DxfAnalyzeResult> {
    try {
      const text = await file.text();
      const cleanedText = cleanupContent(text);
      
      // Parse file using dxf-parser
      const structure = await this.wrapper.parse(cleanedText);
      
      // Get preview entities
      console.log('[DEBUG] Parsing preview entities...');
      const preview = await this.parseEntities(cleanedText, {
        maxEntities: options.previewEntities || 100,
        parseBlocks: options.parseBlocks,
        parseText: options.parseText,
        parseDimensions: options.parseDimensions
      });
      console.log('[DEBUG] Found preview entities:', preview.length);

      return {
        structure,
        preview,
        issues: [] // Issues are now handled by dxf-parser library
      };
    } catch (error) {
      throw new ValidationError(
        `Failed to analyze DXF file: ${error instanceof Error ? error.message : String(error)}`,
        'DXF_ANALYSIS_ERROR'
      );
    }
  }

  /**
   * Parse DXF entities into features
   */
  async parseFeatures(
    file: File,
    options: DxfParseOptions
  ): Promise<Feature[]> {
    try {
      const text = await file.text();
      const cleanedText = cleanupContent(text);
      const entities = await this.parseEntities(cleanedText, options);
      return this.wrapper.convertToFeatures(entities);
    } catch (error) {
      throw new ValidationError(
        `Failed to parse DXF file: ${error instanceof Error ? error.message : String(error)}`,
        'DXF_PARSE_ERROR'
      );
    }
  }

  /**
   * Parse DXF entities
   */
  private async parseEntities(
    content: string,
    options: DxfParseOptions
  ): Promise<DxfEntity[]> {
    try {
      // Parse entire file to get structure
      const structure = await this.wrapper.parse(content);
      
      // Filter entities based on options
      let entities = structure.blocks.flatMap(block => block.entities);
      
      // Apply entity type filter
      if (options.entityTypes) {
        entities = entities.filter(entity => options.entityTypes?.includes(entity.type));
      }
      
      // Apply text filter
      if (!options.parseText) {
        entities = entities.filter(entity => !['TEXT', 'MTEXT'].includes(entity.type));
      }
      
      // Apply dimensions filter
      if (!options.parseDimensions) {
        entities = entities.filter(entity => entity.type !== 'DIMENSION');
      }
      
      // Apply max entities limit
      if (options.maxEntities) {
        entities = entities.slice(0, options.maxEntities);
      }

      return entities;
    } catch (error) {
      throw new ValidationError(
        `Failed to parse DXF entities: ${error instanceof Error ? error.message : String(error)}`,
        'DXF_PARSE_ERROR'
      );
    }
  }
}
