import { Feature } from 'geojson';
import { DxfStructure, DxfAnalyzeResult, DxfBlock, DxfLayer, DxfEntityType } from '../types';
import { ValidationError } from '../../../../errors/types';
import { validateStructure } from '../utils/validation/structure-validator';
import { EntityConverter } from './services/entity-converter';
import { GeoJsonConverter } from './services/geo-json-converter';
import { toPoint3d, isValidPoint } from './utils/point-utils';

/**
 * Wrapper for dxf-parser library to maintain compatibility with our system.
 * Coordinates parsing and conversion between DXF and GeoJSON formats.
 */
export class DxfParserWrapper {
  private parser: any | null = null;
  private entityConverter: EntityConverter;
  private geoJsonConverter: GeoJsonConverter;
  private static instance: DxfParserWrapper | null = null;

  private constructor() {
    this.entityConverter = new EntityConverter();
    this.geoJsonConverter = new GeoJsonConverter();
  }

  /**
   * Get singleton instance of DxfParserWrapper
   */
  public static getInstance(): DxfParserWrapper {
    if (!DxfParserWrapper.instance) {
      DxfParserWrapper.instance = new DxfParserWrapper();
    }
    return DxfParserWrapper.instance;
  }

  /**
   * Initialize the parser
   */
  private async initializeParser(): Promise<void> {
    if (this.parser) return;

    try {
      if (typeof window === 'undefined') {
        throw new Error('DXF parser can only be used in browser environment');
      }

      const DxfParser = await new Promise<any>((resolve, reject) => {
        import(/* webpackChunkName: "dxf-parser" */ 'dxf-parser')
          .then(module => resolve(module.default || module))
          .catch(error => reject(new Error('Failed to load DXF parser module')));
      });
      
      if (typeof DxfParser !== 'function') {
        throw new Error('Invalid DXF parser module');
      }

      this.parser = new DxfParser();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ValidationError(
        `Failed to initialize DXF parser: ${message}`,
        'DXF_PARSER_INIT_ERROR'
      );
    }
  }

  /**
   * Parse DXF content and convert to our internal structure
   */
  async parse(content: string, options?: DxfParseOptions): Promise<DxfStructure> {
    await this.initializeParser();
    
    try {
      if (!this.parser || typeof this.parser.parseSync !== 'function') {
        throw new Error('Parser not properly initialized');
      }

      // Configure parser options
      const parseOptions = {
        entityTypes: options?.entityTypes,
        parseBlocks: options?.parseBlocks ?? true,
        parseText: options?.parseText ?? true,
        parseDimensions: options?.parseDimensions ?? true
      };

      // Parse DXF content with options
      const parsedDxf = this.parser.parseSync(content, parseOptions);
      
      if (!parsedDxf || typeof parsedDxf !== 'object') {
        throw new Error('Parser returned invalid data');
      }

      // Extract all entities (including those from blocks)
      const allEntities = [
        ...(parsedDxf.entities || []),
        ...Object.values(parsedDxf.blocks || {}).flatMap(block => block.entities || [])
      ];

      // Convert to our structure format
      const structure: DxfStructure = {
        layers: this.convertLayers(parsedDxf.tables?.layer || {}),
        blocks: this.convertBlocks(parsedDxf.blocks || {}),
        entities: this.entityConverter.convertEntities(parsedDxf.entities || []),
        entityTypes: this.getEntityTypes(allEntities),
        extents: this.getExtents(parsedDxf.header),
        units: this.getUnits(parsedDxf.header)
      };

      // Validate the converted structure
      const issues = validateStructure(structure);
      if (issues.length > 0) {
        throw new ValidationError(
          'DXF structure validation failed',
          'DXF_STRUCTURE_VALIDATION',
          undefined,
          { issues }
        );
      }

      return structure;
    } catch (error) {
      throw new ValidationError(
        `Failed to parse DXF content: ${error instanceof Error ? error.message : String(error)}`,
        'DXF_PARSE_ERROR'
      );
    }
  }

  /**
   * Convert dxf-parser layers to our format
   */
  private convertLayers(layers: Record<string, any>): DxfLayer[] {
    return Object.entries(layers).map(([name, layer]) => ({
      name,
      color: typeof layer.color === 'number' ? layer.color : undefined,
      lineType: typeof layer.lineType === 'string' ? layer.lineType : undefined,
      lineWeight: typeof layer.lineWeight === 'number' ? layer.lineWeight : undefined,
      frozen: typeof layer.frozen === 'boolean' ? layer.frozen : false,
      locked: typeof layer.locked === 'boolean' ? layer.locked : false,
      off: typeof layer.off === 'boolean' ? layer.off : false
    }));
  }

  /**
   * Convert dxf-parser blocks to our format
   */
  private convertBlocks(blocks: Record<string, any>): DxfBlock[] {
    return Object.entries(blocks).map(([name, block]) => {
      const basePoint: [number, number, number] = block.position && isValidPoint(block.position) ? 
        toPoint3d(block.position) : 
        [0, 0, 0];

      const origin: [number, number, number] | undefined = block.origin && isValidPoint(block.origin) ? 
        toPoint3d(block.origin) : 
        undefined;

      return {
        name,
        basePoint,
        entities: this.entityConverter.convertEntities(block.entities || []),
        layer: typeof block.layer === 'string' ? block.layer : undefined,
        description: typeof block.description === 'string' ? block.description : undefined,
        origin,
        units: typeof block.units === 'string' ? block.units : undefined
      };
    });
  }

  /**
   * Get unique entity types from entities
   */
  private getEntityTypes(entities: any[]): DxfEntityType[] {
    const types = Array.from(new Set(entities.map(e => e.type)));
    return types.filter((type): type is DxfEntityType => 
      ['POINT', 'LINE', 'POLYLINE', 'LWPOLYLINE', 'CIRCLE', 'ARC', 'ELLIPSE', 
       'INSERT', 'TEXT', 'MTEXT', 'DIMENSION', 'SPLINE', 'HATCH', 'SOLID', 'FACE3D'].includes(type)
    );
  }

  /**
   * Get extents from header if available
   */
  private getExtents(header: any): { min: [number, number, number], max: [number, number, number] } | undefined {
    if (header?.$EXTMIN && header?.$EXTMAX && 
        isValidPoint(header.$EXTMIN) && isValidPoint(header.$EXTMAX)) {
      return {
        min: toPoint3d(header.$EXTMIN),
        max: toPoint3d(header.$EXTMAX)
      };
    }
    return undefined;
  }

  /**
   * Get units from header if available
   */
  private getUnits(header: any): 'metric' | 'imperial' | undefined {
    return header?.$MEASUREMENT === 1 ? 'metric' : 'imperial';
  }

  /**
   * Convert entities to GeoJSON features
   */
  async convertToFeatures(entities: DxfEntity[]): Promise<Feature[]> {
    return this.geoJsonConverter.convertToFeatures(entities);
  }
}
