import { Feature } from 'geojson';
import { DxfBlock, DxfEntity, DxfEntityType, Vector3 } from '../types';
import { ValidationError } from '../../../../errors/types';
import { MatrixTransformer, Matrix4 } from './matrix-transformer';
import { GeometryConverterRegistry } from './geometry';

interface BlockCache {
  definition: DxfBlock;
  features: Feature[];
}

/**
 * Manages DXF blocks and their transformations
 */
export class BlockManager {
  private blocks: Map<string, BlockCache>;
  private maxCacheSize: number;

  constructor(options: { maxCacheSize?: number } = {}) {
    this.blocks = new Map();
    this.maxCacheSize = options.maxCacheSize || 100;
  }

  /**
   * Parse block definitions from DXF content
   */
  async parseBlocks(content: string): Promise<DxfBlock[]> {
    const blocks: DxfBlock[] = [];
    const blockRegex = /^0\s+BLOCK\s+([\s\S]*?)^0\s+ENDBLK/gm;
    
    let match;
    while ((match = blockRegex.exec(content)) !== null) {
      try {
        const blockContent = match[1];
        const block = this.parseBlockDefinition(blockContent);
        if (block) {
          blocks.push(block);
          // Cache block definition
          this.cacheBlock(block);
        }
      } catch (error) {
        console.warn('Failed to parse block:', error);
      }
    }

    return blocks;
  }

  /**
   * Parse a single block definition
   */
  private parseBlockDefinition(content: string): DxfBlock | null {
    const lines = content.split('\n').map(line => line.trim());
    const block: Partial<DxfBlock> = {
      entities: []
    };

    for (let i = 0; i < lines.length; i++) {
      const code = parseInt(lines[i]);
      const value = lines[i + 1];
      
      if (isNaN(code)) continue;
      
      switch (code) {
        case 2: // Block name
          block.name = value;
          break;
        case 8: // Layer name
          block.layer = value;
          break;
        case 10: // Base point X
          block.basePoint = block.basePoint || [0, 0, 0];
          block.basePoint[0] = parseFloat(value);
          break;
        case 20: // Base point Y
          block.basePoint = block.basePoint || [0, 0, 0];
          block.basePoint[1] = parseFloat(value);
          break;
        case 30: // Base point Z
          block.basePoint = block.basePoint || [0, 0, 0];
          block.basePoint[2] = parseFloat(value);
          break;
      }
      i++; // Skip value line
    }

    if (!block.name) {
      return null;
    }

    return block as DxfBlock;
  }

  /**
   * Process a block reference (INSERT entity)
   */
  async processBlockReference(
    entity: DxfEntity,
    options: {
      parseNested?: boolean;
      maxNestingLevel?: number;
    } = {}
  ): Promise<Feature[]> {
    if (entity.type !== 'INSERT' || !entity.blockName) {
      throw new ValidationError(
        'Invalid block reference',
        'INVALID_BLOCK_REFERENCE'
      );
    }

    const block = this.getBlock(entity.blockName);
    if (!block) {
      throw new ValidationError(
        `Block "${entity.blockName}" not found`,
        'BLOCK_NOT_FOUND'
      );
    }

    // Transform block features based on insertion point and scale
    const features = await this.transformBlockFeatures(
      block,
      entity,
      options.maxNestingLevel || 5
    );

    return features;
  }

  /**
   * Transform block features based on insertion parameters
   */
  private async transformBlockFeatures(
    block: DxfBlock,
    insert: DxfEntity,
    maxNestingLevel: number,
    currentLevel = 0
  ): Promise<Feature[]> {
    if (currentLevel > maxNestingLevel) {
      throw new ValidationError(
        'Maximum block nesting level exceeded',
        'MAX_NESTING_LEVEL_EXCEEDED'
      );
    }

    const features: Feature[] = [];
    const cached = this.blocks.get(block.name);

    if (cached?.features) {
      features.push(...this.transformFeatures(cached.features, insert));
    } else {
      // Process block entities
      for (const entity of block.entities) {
        if (entity.type === 'INSERT') {
          // Handle nested blocks
          const nestedFeatures = await this.processBlockReference(
            entity,
            { maxNestingLevel, parseNested: true }
          );
          features.push(...nestedFeatures);
        } else {
          // Convert entity to feature using appropriate converter
          const feature = GeometryConverterRegistry.convertEntity(entity);
          if (feature) {
            features.push(feature);
          }
        }
      }

      // Cache processed features if block name exists
      if (block.name) {
        this.cacheBlockFeatures(block.name, features);
      }
    }

    return features;
  }

  /**
   * Transform features based on insertion parameters
   */
  private transformFeatures(features: Feature[], insert: DxfEntity): Feature[] {
    // Calculate transformation matrix
    const position: Vector3 = {
      x: insert.insertionPoint?.[0] ?? 0,
      y: insert.insertionPoint?.[1] ?? 0,
      z: insert.insertionPoint?.[2] ?? 0
    };

    const scale: Vector3 | undefined = insert.scale ? {
      x: insert.scale[0],
      y: insert.scale[1],
      z: insert.scale[2]
    } : undefined;

    const matrix = MatrixTransformer.calculateBlockTransform(
      position,
      insert.rotation,
      scale
    );

    // Handle array patterns if specified
    if (insert.columnCount && insert.columnCount > 1 || 
        insert.rowCount && insert.rowCount > 1) {
      return this.createArrayPattern(
        features,
        matrix,
        insert.columnCount ?? 1,
        insert.rowCount ?? 1,
        insert.columnSpacing ?? 0,
        insert.rowSpacing ?? 0
      );
    }

    // Transform single instance
    return features.map(feature => this.transformFeature(feature, matrix));
  }

  /**
   * Transform a single feature using transformation matrix
   */
  private transformFeature(feature: Feature, matrix: Matrix4): Feature {
    // Deep clone the feature
    const transformed = JSON.parse(JSON.stringify(feature)) as Feature;

    if (!transformed.geometry) return transformed;

    // Transform coordinates based on geometry type
    switch (transformed.geometry.type) {
      case 'Point':
        transformed.geometry.coordinates = this.transformPoint(
          transformed.geometry.coordinates,
          matrix
        );
        break;

      case 'LineString':
        transformed.geometry.coordinates = transformed.geometry.coordinates.map(
          point => this.transformPoint(point, matrix)
        );
        break;

      case 'Polygon':
        transformed.geometry.coordinates = transformed.geometry.coordinates.map(
          ring => ring.map(point => this.transformPoint(point, matrix))
        );
        break;
    }

    return transformed;
  }

  /**
   * Transform a point using transformation matrix
   */
  private transformPoint(point: number[], matrix: Matrix4): number[] {
    const vector: Vector3 = {
      x: point[0],
      y: point[1],
      z: point[2] ?? 0
    };

    const transformed = MatrixTransformer.transformPoint(vector, matrix);
    if (!transformed) return point;

    return [transformed.x, transformed.y, transformed.z ?? 0];
  }

  /**
   * Create array pattern of transformed features
   */
  private createArrayPattern(
    features: Feature[],
    baseMatrix: Matrix4,
    columns: number,
    rows: number,
    columnSpacing: number,
    rowSpacing: number
  ): Feature[] {
    const pattern: Feature[] = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        // Calculate offset matrix for this array element
        const offsetMatrix = MatrixTransformer.createTranslationMatrix(
          col * columnSpacing,
          row * rowSpacing,
          0
        );

        // Combine base transformation with offset
        const matrix = MatrixTransformer.combineMatrices(baseMatrix, offsetMatrix);

        // Transform features with combined matrix
        features.forEach(feature => {
          pattern.push(this.transformFeature(feature, matrix));
        });
      }
    }

    return pattern;
  }

  /**
   * Cache a block definition
   */
  private cacheBlock(block: DxfBlock): void {
    // Skip if block has no name
    if (!block.name) return;

    if (this.blocks.size >= this.maxCacheSize) {
      // Remove oldest entry if cache is full
      const firstKey = this.blocks.keys().next().value;
      if (firstKey) {
        this.blocks.delete(firstKey);
      }
    }

    this.blocks.set(block.name, {
      definition: block,
      features: []
    });
  }

  /**
   * Cache processed features for a block
   */
  private cacheBlockFeatures(blockName: string | undefined, features: Feature[]): void {
    if (!blockName) return;
    
    const cached = this.blocks.get(blockName);
    if (cached) {
      cached.features = features;
    }
  }

  /**
   * Get a cached block
   */
  private getBlock(name: string | undefined): DxfBlock | null {
    if (!name) return null;
    const cached = this.blocks.get(name);
    return cached?.definition || null;
  }

  /**
   * Clear the block cache
   */
  clearCache(): void {
    this.blocks.clear();
  }
}
