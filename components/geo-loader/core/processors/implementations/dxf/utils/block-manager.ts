import { Feature } from 'geojson';
import { DxfBlock, DxfEntity, DxfEntityType } from '../types';
import { ValidationError } from '../../../../errors/types';

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
          // Convert entity to feature and transform
          // TODO: Implement entity to feature conversion
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
    return features.map(feature => {
      // Deep clone the feature
      const transformed = JSON.parse(JSON.stringify(feature)) as Feature;

      // Apply transformations based on insertion parameters
      // TODO: Implement coordinate transformations
      // - Translation (insertion point)
      // - Scaling
      // - Rotation
      // - Arrays (if specified)

      return transformed;
    });
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
