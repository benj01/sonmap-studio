import { DxfParser as DxfParserLib } from 'dxf-parser';
import {
  DxfData,
  DxfEntity,
  DxfBlock,
  LayerInfo,
  DxfEntityBase,
  DxfInsertEntity,
  isValidEntity,
  isDxfInsertEntity
} from './types';
import { ErrorReporter } from '../errors';
import { TransformUtils } from './transform';
import { Matrix4 } from './matrix';
import { GeoFeature } from '../../../../types/geo';
import { DxfConverter } from './converter';

export interface ParserContext {
  onProgress?: (progress: number) => void;
  onWarning?: (message: string) => void;
  onError?: (message: string) => void;
}

export interface ParserResult {
  data: DxfData;
  errors: string[];
  warnings: string[];
}

/**
 * Main DXF parser class that handles parsing, validation, block expansion,
 * and coordinate transformations.
 */
export class DxfParser {
  private parser: DxfParserLib;
  private converter: DxfConverter;
  private blocks: Record<string, DxfBlock> = {};
  private layers = new Map<string, LayerInfo>();

  constructor(private readonly errorReporter: ErrorReporter) {
    this.parser = new DxfParserLib();
    this.converter = new DxfConverter(errorReporter);
  }

  /**
   * Parse DXF content and return structured data
   */
  async parse(content: string, context?: ParserContext): Promise<DxfData> {
    try {
      // Parse raw DXF content
      const parsed = this.parser.parse(content);
      if (!parsed) {
        this.errorReporter.reportError('PARSE_ERROR', 'Failed to parse DXF content');
        throw new Error('Failed to parse DXF content');
      }

      // Extract blocks and layers
      this.blocks = this.extractBlocks(parsed);
      this.layers = this.extractLayers(parsed);

      // Report progress
      context?.onProgress?.(0.5);

      // Convert parsed data to internal format
      const data: DxfData = {
        entities: [],
        blocks: this.blocks,
        tables: {
          layer: {
            layers: Object.fromEntries(this.layers)
          }
        }
      };

      // Process entities
      for (const entity of parsed.entities || []) {
        if (!isValidEntity(entity)) {
          this.errorReporter.reportWarning('INVALID_ENTITY', 'Invalid entity structure', {
            entity
          });
          continue;
        }

        data.entities.push(entity);
      }

      // Report progress
      context?.onProgress?.(1);

      return data;
    } catch (error) {
      this.errorReporter.reportError('PARSE_ERROR', 'DXF parsing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        contentPreview: content.slice(0, 100)
      });
      throw error;
    }
  }

  /**
   * Extract block definitions from parsed data
   */
  private extractBlocks(parsed: any): Record<string, DxfBlock> {
    const blocks: Record<string, DxfBlock> = {};

    try {
      if (!parsed.blocks) {
        return blocks;
      }

      for (const [name, block] of Object.entries<any>(parsed.blocks)) {
        if (!block || typeof block !== 'object') {
          this.errorReporter.reportWarning('INVALID_BLOCK', 'Invalid block definition', {
            name
          });
          continue;
        }

        blocks[name] = {
          name,
          position: block.position || { x: 0, y: 0 },
          entities: block.entities?.filter(isValidEntity) || [],
          layer: block.layer || '0'
        };
      }
    } catch (error) {
      this.errorReporter.reportError('BLOCK_ERROR', 'Failed to extract blocks', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    return blocks;
  }

  /**
   * Extract layer definitions from parsed data
   */
  private extractLayers(parsed: any): Map<string, LayerInfo> {
    const layers = new Map<string, LayerInfo>();

    try {
      // Ensure layer '0' exists
      layers.set('0', {
        name: '0',
        color: 7,
        lineType: 'CONTINUOUS',
        lineWeight: 0,
        visible: true
      });

      if (!parsed.tables?.layer?.layers) {
        return layers;
      }

      for (const [name, layer] of Object.entries<any>(parsed.tables.layer.layers)) {
        if (!layer || typeof layer !== 'object') {
          this.errorReporter.reportWarning('INVALID_LAYER', 'Invalid layer definition', {
            name
          });
          continue;
        }

        layers.set(name, {
          name,
          color: layer.color ?? 7,
          lineType: layer.lineType ?? 'CONTINUOUS',
          lineWeight: layer.lineWeight ?? 0,
          visible: layer.visible ?? true
        });
      }
    } catch (error) {
      this.errorReporter.reportError('LAYER_ERROR', 'Failed to extract layers', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    return layers;
  }

  /**
   * Expand block references recursively
   */
  expandBlockReferences(dxf: DxfData): DxfEntity[] {
    const expandedEntities: DxfEntity[] = [];
    const blockPath: string[] = [];

    const processEntity = (entity: DxfEntity, matrix?: Matrix4) => {
      if (isDxfInsertEntity(entity)) {
        // Check for circular references
        if (blockPath.includes(entity.block)) {
          this.errorReporter.reportWarning('CIRCULAR_REFERENCE', 'Circular block reference detected', {
            block: entity.block,
            path: blockPath.join(' -> ')
          });
          return;
        }

        const block = this.blocks[entity.block];
        if (!block) {
          this.errorReporter.reportWarning('MISSING_BLOCK', 'Referenced block not found', {
            block: entity.block
          });
          return;
        }

        // Calculate transformation matrix
        const blockMatrix = TransformUtils.createBlockTransformMatrix(entity);

        // Combine with parent matrix if exists
        const combinedMatrix = matrix
          ? TransformUtils.combineMatrices(matrix, blockMatrix)
          : blockMatrix;

        // Process block entities
        blockPath.push(entity.block);
        for (const blockEntity of block.entities) {
          processEntity(blockEntity, combinedMatrix);
        }
        blockPath.pop();
      } else {
        // Transform non-INSERT entity if matrix exists
        const transformedEntity = matrix
          ? TransformUtils.transformEntity(entity, matrix)
          : entity;

        if (transformedEntity) {
          expandedEntities.push(transformedEntity);
        }
      }
    };

    // Process all entities
    for (const entity of dxf.entities) {
      processEntity(entity);
    }

    return expandedEntities;
  }

  /**
   * Convert a DXF entity to a GeoJSON feature
   */
  entityToGeoFeature(entity: DxfEntity): GeoFeature | null {
    return this.converter.entityToGeoFeature(entity);
  }

  /**
   * Get all layer names
   */
  getLayers(): string[] {
    return Array.from(this.layers.keys());
  }

  /**
   * Clear internal state
   */
  clear(): void {
    this.blocks = {};
    this.layers.clear();
  }
}
