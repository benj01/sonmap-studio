import DxfParser from 'dxf-parser';
import { DxfData, LayerInfo, DxfBlock, CustomDxfParserLib, ParserContext, ParserResult, DxfEntity, DxfEntityBase } from './types';
import { DxfEntityParser } from './entity-parser';
import { TransformUtils } from './transform';
import { GeoFeature } from '../../../../types/geo';
import { DxfValidator } from './validator';
import { DxfErrorReporter, createDxfErrorReporter } from './error-collector';
import { ErrorMessage } from '../errors';

type ParsedEntity = ReturnType<DxfEntityParser['parseEntity']>;

class DxfParserLibImpl implements CustomDxfParserLib {
  private parser: DxfParser;
  private entityParser: DxfEntityParser;

  constructor() {
    this.parser = new DxfParser();
    this.entityParser = new DxfEntityParser();
  }

  parseSync(content: string): DxfData {
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('Invalid or empty DXF content');
    }

    console.log('[DEBUG] Starting DXF parsing, content length:', content.length);
    
    try {
      const parsed = this.parser.parseSync(content);
      console.log('[DEBUG] Raw parse result:', {
        hasData: !!parsed,
        type: typeof parsed,
        hasEntities: parsed && Array.isArray(parsed.entities),
        entityCount: parsed?.entities?.length
      });

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Parsed DXF data is not an object');
      }
      if (!Array.isArray(parsed.entities)) {
        throw new Error('DXF data has no valid entities array');
      }

      const result = this.convertParsedData(parsed);
      console.log('[DEBUG] Converted parse result:', {
        entityCount: result.entities.length,
        hasBlocks: !!result.blocks,
        hasLayers: !!result.tables?.layer?.layers
      });

      return result;
    } catch (error: any) {
      console.error('[DEBUG] DXF parsing error:', error);
      throw new Error(`Failed to parse DXF content: ${error?.message || error}`);
    }
  }

  private convertParsedData(parsed: any): DxfData {
    const result: DxfData = {
      entities: [],
      blocks: {},
      tables: {
        layer: {
          layers: {}
        }
      }
    };

    // Convert entities
    if (Array.isArray(parsed.entities)) {
      result.entities = parsed.entities
        .map((entity: Record<string, any>) => this.entityParser.parseEntity(entity))
        .filter((entity: ParsedEntity): entity is DxfEntity => entity !== null);
    }

    // Convert blocks
    if (parsed.blocks && typeof parsed.blocks === 'object') {
      Object.entries(parsed.blocks).forEach(([name, block]: [string, any]) => {
        if (block.entities) {
          result.blocks![name] = {
            name,
            position: block.position || { x: 0, y: 0, z: 0 },
            entities: block.entities
              .map((entity: Record<string, any>) => this.entityParser.parseEntity(entity))
              .filter((entity: ParsedEntity): entity is DxfEntity => entity !== null),
            layer: block.layer || '0'
          };
        }
      });
    }

    // Convert layers
    if (parsed.tables?.layer?.layers) {
      result.tables!.layer!.layers = parsed.tables.layer.layers;
    }

    return result;
  }
}

export class DxfCoreParser {
  private parser: CustomDxfParserLib;
  private entityParser: DxfEntityParser;
  private validator: DxfValidator;
  private errorReporter: DxfErrorReporter;
  private blocks: Record<string, DxfBlock> = {};
  private layers: Map<string, LayerInfo> = new Map();

  constructor() {
    this.parser = new DxfParserLibImpl();
    this.entityParser = new DxfEntityParser();
    this.validator = new DxfValidator();
    this.errorReporter = createDxfErrorReporter();
  }

  async parse(content: string, context?: ParserContext): Promise<DxfData> {
    try {
      // Ensure context is defined with default values
      const ctx: ParserContext = {
        validate: true,
        ...context
      };

      const dxf = this.parser.parseSync(content);
      if (!dxf || !Array.isArray(dxf.entities)) {
        this.errorReporter.addDxfError('Invalid DXF data structure after parsing', {
          type: 'INVALID_DXF_STRUCTURE',
          dxf
        });
        throw new Error('Invalid DXF data structure after parsing.');
      }

      this.blocks = this.extractBlocks(dxf);
      this.layers = this.extractLayers(dxf);

      // Validate each entity
      dxf.entities.forEach((entity: DxfEntityBase, index: number) => {
        if (!this.validator.validateEntity(entity as DxfEntity)) {
          const errors = this.validator.getErrors();
          errors.forEach(error => {
            this.errorReporter.addEntityError(
              entity.type || 'UNKNOWN',
              entity.handle,
              `Entity ${index}: ${error.message}`,
              {
                type: 'VALIDATION_ERROR',
                entityIndex: index,
                validatorErrors: errors
              }
            );
          });
        }
      });

      // Report progress if callback provided
      if (ctx.onProgress) {
        ctx.onProgress(1);
      }

      return dxf;
    } catch (error: any) {
      this.errorReporter.addDxfError(`Failed to parse DXF content: ${error?.message || 'Unknown error'}`, {
        type: 'PARSE_ERROR',
        error: String(error)
      });
      throw error;
    }
  }

  expandBlockReferences(dxf: DxfData): DxfEntity[] {
    const expandedEntities: DxfEntity[] = [];
    const processedBlocks = new Set<string>(); // Track processed blocks to prevent cycles

    const processEntity = (entity: DxfEntity, transformMatrix?: number[][], blockPath: string[] = []): void => {
      // Handle INSERT entities (block references)
      if (entity.type === 'INSERT' && 'block' in entity) {
        // Check for circular references
        if (blockPath.includes(entity.block)) {
          this.errorReporter.addEntityWarning(
            'INSERT',
            entity.handle,
            `Circular block reference detected: ${blockPath.join(' -> ')} -> ${entity.block}`,
            {
              type: 'CIRCULAR_REFERENCE',
              blockPath: [...blockPath, entity.block]
            }
          );
          return;
        }

        const block = this.blocks[entity.block];
        if (block && Array.isArray(block.entities)) {
          // Calculate transformation matrix for the block
          const blockTransform = TransformUtils.createBlockTransformMatrix(entity);
          const finalTransform = transformMatrix 
            ? TransformUtils.combineTransformMatrices(transformMatrix, blockTransform)
            : blockTransform;

          // Process each entity in the block
          block.entities.forEach(blockEntity => {
            processEntity(blockEntity, finalTransform, [...blockPath, entity.block]);
          });
        }
      } else {
        // For non-INSERT entities, apply transformation if needed
        if (transformMatrix) {
          const transformedEntity = TransformUtils.transformEntity(entity, transformMatrix);
          if (transformedEntity) {
            expandedEntities.push(transformedEntity);
          }
        } else {
          expandedEntities.push(entity);
        }
      }
    };

    if (Array.isArray(dxf.entities)) {
      dxf.entities.forEach(entity => processEntity(entity));
    } else {
      this.errorReporter.addDxfError('DXF data has no valid entities array during block expansion', {
        type: 'INVALID_ENTITIES_ARRAY',
        dxf
      });
    }

    return expandedEntities;
  }

  entityToGeoFeature(entity: DxfEntity): GeoFeature | null {
    return this.entityParser.entityToGeoFeature(entity, {
      color: 7,
      visible: true
    });
  }

  private extractBlocks(dxf: DxfData): Record<string, DxfBlock> {
    const blocks: Record<string, DxfBlock> = {};
    try {
      if (dxf.blocks) {
        Object.entries(dxf.blocks).forEach(([name, block]) => {
          if (block.entities) {
            blocks[name] = {
              name,
              position: block.position || { x: 0, y: 0, z: 0 },
              entities: block.entities,
              layer: block.layer || '0'
            };
          }
        });
      }
    } catch (error: any) {
      this.errorReporter.addDxfWarning(`Error extracting blocks: ${error?.message || error}`, {
        type: 'BLOCK_EXTRACTION_ERROR',
        error: String(error)
      });
    }
    return blocks;
  }

  private extractLayers(dxf: DxfData): Map<string, LayerInfo> {
    const layers = new Map<string, LayerInfo>();
    try {
      if (dxf.tables?.layer?.layers) {
        Object.entries(dxf.tables.layer.layers).forEach(([name, layer]: [string, any]) => {
          layers.set(name, {
            name,
            color: layer.color,
            colorRGB: layer.colorRGB,
            lineType: layer.lineType,
            lineWeight: layer.lineWeight,
            frozen: Boolean(layer.flags & 1),
            locked: Boolean(layer.flags & 4),
            visible: !(layer.flags & 1)
          });
        });
      }

      if (Array.isArray(dxf.entities)) {
        dxf.entities.forEach(entity => {
          if (entity.layer && !layers.has(entity.layer)) {
            layers.set(entity.layer, {
              name: entity.layer,
              visible: true
            });
          }
        });
      }

      if (!layers.has('0')) {
        layers.set('0', {
          name: '0',
          color: 7,
          visible: true
        });
      }
    } catch (error: any) {
      this.errorReporter.addDxfWarning(`Error extracting layers: ${error?.message || error}`, {
        type: 'LAYER_EXTRACTION_ERROR',
        error: String(error)
      });
      if (!layers.has('0')) {
        layers.set('0', { name: '0', visible: true });
      }
    }

    return layers;
  }

  getLayers(): string[] {
    return Array.from(this.layers.keys());
  }

  getErrors(): ErrorMessage[] {
    return this.errorReporter.getErrors();
  }

  getWarnings(): ErrorMessage[] {
    return this.errorReporter.getWarnings();
  }

  clear() {
    this.errorReporter.clear();
    this.validator.clear();
    this.entityParser.clear();
  }
}

export const createDxfParser = () => new DxfCoreParser();
