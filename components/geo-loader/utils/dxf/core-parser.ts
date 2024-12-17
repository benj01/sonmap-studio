import DxfParser from 'dxf-parser';
import { DxfData, LayerInfo, DxfBlock, CustomDxfParserLib, ParserContext, ParserResult, DxfEntity, DxfEntityBase } from './types';
import { DxfEntityParser } from './entity-parser';
import { TransformUtils } from './transform';
import { GeoFeature } from '../../../../types/geo';
import { DxfValidator } from './validator';
import { ErrorCollector } from './error-collector';

type ParsedEntity = ReturnType<DxfEntityParser['parseEntity']>;

class DxfParserLibImpl implements CustomDxfParserLib {
  private parser: DxfParser;
  private entityParser: DxfEntityParser;

  constructor() {
    this.parser = new DxfParser();
    this.entityParser = new DxfEntityParser();
  }

  parseSync(content: string): DxfData {
    try {
      const parsed = this.parser.parseSync(content);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Parsed DXF data is not an object');
      }
      if (!Array.isArray(parsed.entities)) {
        throw new Error('DXF data has no valid entities array');
      }
      return this.convertParsedData(parsed);
    } catch (error: any) {
      console.error('DXF parsing error:', error?.message || error);
      throw new Error('Failed to parse DXF content');
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
  private errorCollector: ErrorCollector;
  private blocks: Record<string, DxfBlock> = {};
  private layers: Map<string, LayerInfo> = new Map();

  constructor() {
    this.parser = new DxfParserLibImpl();
    this.entityParser = new DxfEntityParser();
    this.validator = new DxfValidator();
    this.errorCollector = new ErrorCollector();
  }

  async parse(content: string, context: ParserContext): Promise<DxfData> {
    try {
      const dxf = this.parser.parseSync(content);
      if (!dxf || !Array.isArray(dxf.entities)) {
        throw new Error('Invalid DXF data structure after parsing.');
      }

      this.blocks = this.extractBlocks(dxf);
      this.layers = this.extractLayers(dxf);

      // Validate each entity
      dxf.entities.forEach((entity: DxfEntityBase, index: number) => {
        if (!this.validator.validateEntity(entity as DxfEntity)) {
          const errors = this.validator.getErrors();
          errors.forEach(error => {
            this.errorCollector.addError(
              entity.type || 'UNKNOWN',
              entity.handle,
              `Entity ${index}: ${error}`
            );
          });
        }
      });

      // Log validation errors if any
      const errors = this.errorCollector.getErrors();
      if (errors.length > 0) {
        console.warn('DXF validation errors:', errors);
      }
      
      // Report progress if callback provided
      if (context.onProgress) {
        context.onProgress(1);
      }

      return dxf;
    } catch (error: any) {
      console.error('Error parsing DXF content:', error?.message || error);
      throw new Error(`Failed to parse DXF content: ${error?.message || 'Unknown error'}`);
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
          this.errorCollector.addWarning(
            'INSERT',
            entity.handle,
            `Circular block reference detected: ${blockPath.join(' -> ')} -> ${entity.block}`
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
      this.errorCollector.addError(
        'DXF',
        undefined,
        'DXF data has no valid entities array during block expansion'
      );
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
      this.errorCollector.addWarning('BLOCK', undefined, `Error extracting blocks: ${error?.message || error}`);
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
      this.errorCollector.addWarning('LAYER', undefined, `Error extracting layers: ${error?.message || error}`);
      if (!layers.has('0')) {
        layers.set('0', { name: '0', visible: true });
      }
    }

    return layers;
  }

  getLayers(): string[] {
    return Array.from(this.layers.keys());
  }

  getErrors(): string[] {
    return this.errorCollector.getErrors();
  }

  getWarnings(): string[] {
    return this.errorCollector.getWarnings();
  }

  clear() {
    this.errorCollector.clear();
    this.validator.clear();
    this.entityParser.clear();
  }
}

export const createDxfParser = () => new DxfCoreParser();
