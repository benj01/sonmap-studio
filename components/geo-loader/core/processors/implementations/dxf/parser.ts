import { Feature } from 'geojson';
import { 
  DxfEntity, 
  DxfEntityType, 
  DxfParseOptions, 
  DxfStructure, 
  DxfAnalyzeResult,
  DxfBlock,
  DxfLayer
} from './types';
import { ValidationError } from '../../../errors/types';

/**
 * Handles DXF file parsing
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
      
      // Parse header section to get basic file info
      const structure = await this.parseStructure(text);
      
      // Get preview entities
      const preview = await this.parseEntities(text, {
        maxEntities: options.previewEntities || 100,
        parseBlocks: options.parseBlocks,
        parseText: options.parseText,
        parseDimensions: options.parseDimensions
      });

      // Check for issues
      const issues = this.validateStructure(structure);

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
      const entities = await this.parseEntities(text, options);
      return this.convertToFeatures(entities);
    } catch (error) {
      throw new ValidationError(
        `Failed to parse DXF file: ${error instanceof Error ? error.message : String(error)}`,
        'DXF_PARSE_ERROR'
      );
    }
  }

  /**
   * Parse DXF file structure
   */
  private async parseStructure(text: string): Promise<DxfStructure> {
    // TODO: Implement actual DXF structure parsing
    // For now, return a minimal structure
    return {
      layers: [],
      blocks: [],
      entityTypes: []
    };
  }

  /**
   * Parse DXF entities from text content
   */
  async parseEntities(
    text: string,
    options: DxfParseOptions
  ): Promise<DxfEntity[]> {
    const entities: DxfEntity[] = [];
    const entityRegex = /^0\s+(\w+)\s+([\s\S]*?)(?=^0\s+\w+|\Z)/gm;
    
    let match;
    let count = 0;
    while ((match = entityRegex.exec(text)) !== null) {
      try {
        const [, type, entityContent] = match;
        if (this.isValidEntityType(type)) {
          const groupCodes = this.parseGroupCodes(entityContent);
          const entityType = type as DxfEntityType;
          
          // Skip if entity type is not in options
          if (options.entityTypes && !options.entityTypes.includes(entityType)) {
            continue;
          }

          // Skip text entities if not requested
          if (!options.parseText && (entityType === 'TEXT' || entityType === 'MTEXT')) {
            continue;
          }

          // Skip dimensions if not requested
          if (!options.parseDimensions && entityType === 'DIMENSION') {
            continue;
          }

          const entity: DxfEntity = {
            type: entityType,
            attributes: this.parseEntityAttributes(groupCodes),
            data: this.parseEntityData(groupCodes, entityType)
          };

          entities.push(entity);
          count++;

          // Stop if we've reached maxEntities
          if (options.maxEntities && count >= options.maxEntities) {
            break;
          }
        }
      } catch (error) {
        console.warn('Failed to parse entity:', error);
      }
    }

    return entities;
  }

  /**
   * Parse entity data based on type
   */
  private parseEntityData(
    groupCodes: Array<[number, string]>,
    type: DxfEntityType
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    groupCodes.forEach(([code, value]) => {
      switch (code) {
        case 10: // X coordinate
          data.x = parseFloat(value);
          break;
        case 20: // Y coordinate
          data.y = parseFloat(value);
          break;
        case 30: // Z coordinate
          data.z = parseFloat(value);
          break;
        case 11: // X2 coordinate (for lines)
          data.x2 = parseFloat(value);
          break;
        case 21: // Y2 coordinate (for lines)
          data.y2 = parseFloat(value);
          break;
        case 31: // Z2 coordinate (for lines)
          data.z2 = parseFloat(value);
          break;
        case 40: // Radius (for circles/arcs)
          data.radius = parseFloat(value);
          break;
        case 50: // Start angle (for arcs)
          data.startAngle = parseFloat(value);
          break;
        case 51: // End angle (for arcs)
          data.endAngle = parseFloat(value);
          break;
        case 70: // Flags
          if (type === 'POLYLINE' || type === 'LWPOLYLINE') {
            data.closed = (parseInt(value) & 1) === 1;
          }
          break;
      }
    });

    return data;
  }

  /**
   * Check if entity type is valid
   */
  private isValidEntityType(type: string): type is DxfEntityType {
    return [
      'POINT',
      'LINE',
      'POLYLINE',
      'LWPOLYLINE',
      'CIRCLE',
      'ARC',
      'ELLIPSE',
      'INSERT',
      'TEXT',
      'MTEXT',
      'DIMENSION'
    ].includes(type.toUpperCase());
  }

  /**
   * Convert DXF entities to GeoJSON features
   */
  private convertToFeatures(entities: DxfEntity[]): Feature[] {
    // TODO: Implement actual entity to feature conversion
    // For now, return an empty array
    return [];
  }

  /**
   * Parse DXF blocks
   */
  private parseBlocks(text: string): DxfBlock[] {
    // TODO: Implement block parsing
    return [];
  }

  /**
   * Parse DXF layers
   */
  private parseLayers(text: string): DxfLayer[] {
    // TODO: Implement layer parsing
    return [];
  }

  /**
   * Parse DXF header section
   */
  private parseHeader(text: string): Record<string, unknown> {
    // TODO: Implement header parsing
    return {};
  }

  /**
   * Validate DXF structure
   */
  private validateStructure(structure: DxfStructure): Array<{
    type: string;
    message: string;
    details?: Record<string, unknown>;
  }> {
    const issues: Array<{
      type: string;
      message: string;
      details?: Record<string, unknown>;
    }> = [];

    // Check for empty layers
    if (structure.layers.length === 0) {
      issues.push({
        type: 'NO_LAYERS',
        message: 'No layers found in DXF file'
      });
    }

    // Check for empty entity types
    if (structure.entityTypes.length === 0) {
      issues.push({
        type: 'NO_ENTITIES',
        message: 'No entities found in DXF file'
      });
    }

    return issues;
  }

  /**
   * Parse DXF group codes and values
   */
  private parseGroupCodes(text: string): Array<[number, string]> {
    const lines = text.split('\n');
    const pairs: Array<[number, string]> = [];
    
    for (let i = 0; i < lines.length - 1; i += 2) {
      const code = parseInt(lines[i].trim());
      const value = lines[i + 1].trim();
      if (!isNaN(code)) {
        pairs.push([code, value]);
      }
    }

    return pairs;
  }

  /**
   * Get entity type from group codes
   */
  private getEntityType(groupCodes: Array<[number, string]>): DxfEntityType | null {
    const typeCode = groupCodes.find(([code]) => code === 0);
    if (!typeCode) return null;

    const type = typeCode[1].toUpperCase() as DxfEntityType;
    const validTypes: DxfEntityType[] = [
      'POINT',
      'LINE',
      'POLYLINE',
      'LWPOLYLINE',
      'CIRCLE',
      'ARC',
      'ELLIPSE',
      'INSERT',
      'TEXT',
      'MTEXT',
      'DIMENSION'
    ];
    return validTypes.includes(type as DxfEntityType) ? type as DxfEntityType : null;
  }

  /**
   * Parse entity attributes from group codes
   */
  private parseEntityAttributes(
    groupCodes: Array<[number, string]>
  ): Record<string, unknown> {
    const attributes: Record<string, unknown> = {};

    groupCodes.forEach(([code, value]) => {
      switch (code) {
        case 8: // Layer name
          attributes.layer = value;
          break;
        case 6: // Line type name
          attributes.lineType = value;
          break;
        case 62: // Color number
          attributes.color = parseInt(value);
          break;
        case 370: // Line weight
          attributes.lineWeight = parseInt(value);
          break;
        case 440: // Transparency
          attributes.transparency = parseInt(value);
          break;
      }
    });

    return attributes;
  }
}
