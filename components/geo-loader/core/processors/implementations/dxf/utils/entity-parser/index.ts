import { Feature } from 'geojson';
import { DxfEntity, DxfEntityType, EntityParserOptions } from './types';
import { LayerManager } from '../layer-manager';
import { BlockManager } from '../block-manager';
import { ValidationError } from '../../../../../errors/types';
import { validateGeometry, isValidEntityType } from './validation';
import { parseGroupCodes, processLwpolyline, normalizeContent, createParsingContext } from './parsers';
import {
  pointToGeometry,
  lineToGeometry,
  polylineToGeometry,
  circleToGeometry,
  arcToGeometry
} from './geometry';

/**
 * Handles parsing and conversion of DXF entities to GeoJSON features
 */
export class EntityParser {
  private layerManager: LayerManager;
  private blockManager: BlockManager;
  private options: EntityParserOptions;

  constructor(
    layerManager: LayerManager,
    blockManager: BlockManager,
    options: EntityParserOptions = {}
  ) {
    this.layerManager = layerManager;
    this.blockManager = blockManager;
    this.options = options;
  }

  /**
   * Parse DXF entities from content
   */
  async parseEntities(content: string): Promise<DxfEntity[]> {
    const entities: DxfEntity[] = [];
    
    try {
      // Normalize line endings first
      content = content.replace(/\r\n?/g, '\n');
      
      // Find ENTITIES section with line-based pattern
      const lines = content.split('\n');
      let inEntitiesSection = false;
      let entitiesContent = '';
      
      console.log('[DEBUG] Scanning for ENTITIES section:', {
        totalLines: lines.length,
        firstLines: lines.slice(0, 5)
      });

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (!inEntitiesSection) {
          // Look for section start
          if (line === '0' && 
              lines[i + 1]?.trim() === 'SECTION' &&
              lines[i + 2]?.trim() === '2' &&
              lines[i + 3]?.trim() === 'ENTITIES') {
            inEntitiesSection = true;
            i += 3; // Skip to after ENTITIES
            console.log('[DEBUG] Found ENTITIES section start at line:', i);
            continue;
          }
        } else {
          // Look for section end
          if (line === '0' && lines[i + 1]?.trim() === 'ENDSEC') {
            console.log('[DEBUG] Found ENTITIES section end at line:', i);
            break;
          }
          entitiesContent += line + '\n';
        }
      }

      if (!inEntitiesSection || !entitiesContent) {
        console.warn('[DEBUG] No valid ENTITIES section found');
        return entities;
      }

      // Parse entities with line-based pattern
      const entityRegex = /[\s\r\n]*0[\s\r\n]+([^\s\r\n]+)[\s\r\n]+((?:(?![\s\r\n]*0[\s\r\n]+(?:[^\s\r\n]+|ENDSEC))[\s\S])*)/gm;
      
      console.log('[DEBUG] Processing ENTITIES section:', {
        length: entitiesContent.length,
        sample: entitiesContent.substring(0, 100) + '...',
        rawContent: entitiesContent.split('\n').slice(0, 5),
        firstMatch: entitiesContent.match(/0[\s\r\n]+([^\s\r\n]+)/)?.[1],
        groupCodes: entitiesContent.match(/^\s*\d+\s*$/gm)?.slice(0, 5),
        lineCount: entitiesContent.split('\n').length
      });
      
      let match: RegExpExecArray | null;
      while ((match = entityRegex.exec(entitiesContent)) !== null) {
        try {
          const [, type, entityContent] = match;
          console.log('[DEBUG] Found entity match:', {
            type,
            contentLength: entityContent.length,
            contentSample: entityContent.substring(0, 50)
          });

          if (isValidEntityType(type)) {
            console.log('[DEBUG] Parsing entity:', type);
            const entity = await this.parseEntity(type, entityContent);
            if (entity) {
              console.log('[DEBUG] Successfully parsed entity:', {
                type,
                hasData: !!entity.data,
                dataKeys: Object.keys(entity.data || {}),
                vertexCount: type === 'LWPOLYLINE' ? entity.data.vertices?.length : undefined
              });
              entities.push(entity);
            }
          }
        } catch (error) {
          console.warn('Failed to parse entity:', error instanceof Error ? error.message : String(error));
        }
      }

      console.log('[DEBUG] Total entities parsed:', {
        count: entities.length,
        types: entities.map(e => e.type),
        firstEntity: entities[0]
      });
      return entities;
    } catch (error) {
      console.error('[DEBUG] Error parsing entities:', error instanceof Error ? error.message : String(error));
      return entities;
    }
  }

  /**
   * Parse a single DXF entity
   */
  private async parseEntity(type: DxfEntityType, content: string): Promise<DxfEntity | null> {
    try {
      const lines = normalizeContent(content);
      console.log('[DEBUG] Parsing entity:', {
        type,
        lineCount: lines.length,
        firstLine: lines[0],
        content: content.substring(0, 100)
      });

      const groupCodes = parseGroupCodes(lines);
      const context = createParsingContext(type, content);

      switch (type) {
        case 'LWPOLYLINE':
          return processLwpolyline(groupCodes, context);
        // Add other entity type handlers as needed
        default:
          console.warn('[DEBUG] Unsupported entity type:', type);
          return null;
      }
    } catch (error) {
      console.error('[DEBUG] Error parsing entity:', {
        type,
        error: error instanceof Error ? error.message : String(error),
        content: content.substring(0, 100) + '...'
      });
      return null;
    }
  }

  /**
   * Convert DXF entities to GeoJSON features
   */
  async convertToFeatures(entities: DxfEntity[]): Promise<Feature[]> {
    const features: Feature[] = [];
    console.log('[DEBUG] Converting entities to features:', entities.length);

    try {
      for (const entity of entities) {
        try {
          // Skip entities on frozen or invisible layers
          if (!this.layerManager.shouldProcessEntity(entity)) {
            continue;
          }

          const feature = await this.entityToFeature(entity);
          if (feature) {
            features.push(feature);
          }
        } catch (error) {
          console.warn('[DEBUG] Failed to convert entity:', {
            type: entity.type,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      console.log('[DEBUG] Successfully converted features:', features.length);
      return features;
    } catch (error) {
      console.error('[DEBUG] Error converting entities to features:', error instanceof Error ? error.message : String(error));
      return features;
    }
  }

  /**
   * Convert a DXF entity to a GeoJSON feature
   */
  private async entityToFeature(entity: DxfEntity): Promise<Feature | null> {
    try {
      console.log('[DEBUG] Converting entity to feature:', {
        type: entity.type,
        layer: entity.attributes.layer,
        hasData: !!entity.data
      });

      let geometry;
      const properties = this.getEntityProperties(entity);

      switch (entity.type) {
        case 'POINT':
          geometry = pointToGeometry(entity);
          break;
        case 'LINE':
          geometry = lineToGeometry(entity);
          break;
        case 'POLYLINE':
        case 'LWPOLYLINE':
          geometry = polylineToGeometry(entity);
          break;
        case 'CIRCLE':
          geometry = circleToGeometry(entity);
          break;
        case 'ARC':
          geometry = arcToGeometry(entity);
          break;
        case 'INSERT':
          return this.handleBlockReference(entity);
        default:
          console.warn('[DEBUG] Unsupported entity type:', entity.type);
          return null;
      }

      if (!geometry) {
        console.warn('[DEBUG] No geometry generated for entity:', {
          type: entity.type,
          data: entity.data
        });
        return null;
      }

      // Validate geometry if required
      if (this.options.validateGeometry && !validateGeometry(geometry)) {
        throw new ValidationError(
          'Invalid geometry',
          'INVALID_GEOMETRY',
          undefined,
          { entity }
        );
      }

      const feature = {
        type: 'Feature' as const,
        geometry,
        properties: {
          ...properties,
          geometryType: geometry.type,
          entityType: entity.type
        }
      };

      console.log('[DEBUG] Final feature:', {
        type: feature.type,
        geometryType: feature.geometry.type,
        properties: feature.properties
      });

      return feature;
    } catch (error) {
      console.warn('Failed to convert entity to feature:', error);
      return null;
    }
  }

  /**
   * Get entity properties including layer properties
   */
  private getEntityProperties(entity: DxfEntity): Record<string, unknown> {
    const layerProps = this.layerManager.getLayerProperties(entity);
    const properties: Record<string, unknown> = {
      entityType: entity.type,
      layer: entity.attributes.layer || '0'
    };

    // Add color if preserving colors
    if (this.options.preserveColors) {
      properties.color = entity.attributes.color || layerProps.color;
    }

    // Add line weight if preserving line weights
    if (this.options.preserveLineWeights) {
      properties.lineWeight = entity.attributes.lineWeight || layerProps.lineWeight;
    }

    // Add line type
    properties.lineType = entity.attributes.lineType || layerProps.lineType;

    return properties;
  }

  /**
   * Handle block reference (INSERT entity)
   */
  private async handleBlockReference(entity: DxfEntity): Promise<Feature | null> {
    try {
      const features = await this.blockManager.processBlockReference(entity);
      if (features.length === 0) return null;

      // If only one feature, return it with INSERT properties
      if (features.length === 1) {
        const feature = features[0];
        feature.properties = {
          ...feature.properties,
          ...this.getEntityProperties(entity)
        };
        return feature;
      }

      // If multiple features, return the first one and add count to properties
      const feature = features[0];
      feature.properties = {
        ...feature.properties,
        ...this.getEntityProperties(entity),
        blockFeatureCount: features.length
      };
      return feature;
    } catch (error) {
      console.warn('Failed to process block reference:', error);
      return null;
    }
  }
}

export * from './types';
export * from './validation';
export * from './parsers';
export * from './geometry';
