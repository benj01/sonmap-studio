import { Feature } from 'geojson';
import { 
  DxfParseOptions, 
  DxfStructure, 
  DxfAnalyzeResult,
  DxfEntity,
  DxfEntityType,
  DxfBlock,
  DxfLayer
} from './types';
import { ValidationError } from '../../../errors/types';
import { 
  cleanupContent,
  parseGroupCodes,
  findSection,
  ENTITY_PATTERN,
  BLOCK_PATTERN,
  LAYER_PATTERN
} from './utils/regex-patterns';
import { parseHeader } from './parsers/header-parser';
import { parseLayers } from './parsers/layer-parser';
import { parseBlocks } from './parsers/block-parser';
import { parseEntities, convertToFeatures } from './parsers/entity-parser';
import { validateStructure } from './utils/validation/structure-validator';

/**
 * Handles DXF file parsing by coordinating specialized parsers
 */
export class DxfParser {
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
      
      // Parse header section to get basic file info
      const header = parseHeader(cleanedText);
      
      // Parse layers and blocks
      const layers = parseLayers(cleanedText);
      const blocks = parseBlocks(cleanedText);
      
      // Get preview entities
      console.log('[DEBUG] Parsing preview entities...');
      const preview = await parseEntities(cleanedText, {
        maxEntities: options.previewEntities || 100,
        parseBlocks: options.parseBlocks,
        parseText: options.parseText,
        parseDimensions: options.parseDimensions
      });
      console.log('[DEBUG] Found preview entities:', preview.length);

      // Create structure
      const structure: DxfStructure = {
        layers,
        blocks,
        entityTypes: Array.from(new Set(preview.map(e => e.type))),
        extents: header.$EXTMIN && header.$EXTMAX ? {
          min: [
            header.$EXTMIN.x,
            header.$EXTMIN.y,
            header.$EXTMIN.z || 0
          ] as [number, number, number],
          max: [
            header.$EXTMAX.x,
            header.$EXTMAX.y,
            header.$EXTMAX.z || 0
          ] as [number, number, number]
        } : undefined,
        units: header.$MEASUREMENT === 1 ? 'metric' : 'imperial'
      };

      // Check for issues
      const issues = validateStructure(structure);

      return {
        structure,
        preview,
        issues
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
      const entities = await parseEntities(cleanedText, options);
      return convertToFeatures(entities);
    } catch (error) {
      throw new ValidationError(
        `Failed to parse DXF file: ${error instanceof Error ? error.message : String(error)}`,
        'DXF_PARSE_ERROR'
      );
    }
  }

}
