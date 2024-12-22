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
      console.log('[DEBUG] Parsing preview entities...');
      const preview = await this.parseEntities(text, {
        maxEntities: options.previewEntities || 100,
        parseBlocks: options.parseBlocks,
        parseText: options.parseText,
        parseDimensions: options.parseDimensions
      });
      console.log('[DEBUG] Found preview entities:', preview.length);

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
    try {
      // Parse layers from TABLES section
      const layers = this.parseLayers(text);

      // Parse blocks from BLOCKS section
      const blocks = this.parseBlocks(text);

      // Find ENTITIES section to collect entity types
      const entityTypes = new Set<DxfEntityType>();
      const entitiesMatch = text.match(/^0\s+SECTION\s+2\s+ENTITIES([\s\S]*?)^0\s+ENDSEC/m);
      
      if (entitiesMatch) {
        const entityRegex = /^0\s+(\w+)\s+/gm;
        let match;
        
        while ((match = entityRegex.exec(entitiesMatch[1])) !== null) {
          const type = match[1].toUpperCase() as DxfEntityType;
          if (this.isValidEntityType(type)) {
            entityTypes.add(type);
          }
        }
      }

      // Get extents from header if available
      const header = this.parseHeader(text);
      const extents = header.$EXTMIN && header.$EXTMAX ? {
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
      } : undefined;

      return {
        layers,
        blocks,
        entityTypes: Array.from(entityTypes),
        extents,
        units: header.$MEASUREMENT === 1 ? 'metric' : 'imperial'
      };
    } catch (error) {
      console.warn('Error parsing DXF structure:', error);
      // Return minimal structure on error
      return {
        layers: [{ name: '0' }], // Ensure at least default layer exists
        blocks: [],
        entityTypes: []
      };
    }
  }

  /**
   * Parse DXF entities from text content
   */
  async parseEntities(
    text: string,
    options: DxfParseOptions
  ): Promise<DxfEntity[]> {
    console.log('[DEBUG] Starting entity parsing');
    const entities: DxfEntity[] = [];
    const entityRegex = /^0\s+(\w+)\s+([\s\S]*?)(?=^0\s+\w+|\Z)/gm;
    
    let match;
    let count = 0;
    while ((match = entityRegex.exec(text)) !== null) {
      try {
        const [, type, entityContent] = match;
        const upperType = type.toUpperCase();
        
        if (this.isValidEntityType(upperType)) {
          const entityType = upperType as DxfEntityType;
          
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

          const groupCodes = this.parseGroupCodes(entityContent);
          const attributes = this.parseEntityAttributes(groupCodes);
          const data = this.parseEntityData(groupCodes, entityType);

          // Only create entity if we have valid data
          if (data && Object.keys(data).length > 0) {
            const entity: DxfEntity = {
              type: entityType,
              attributes: attributes || {},
              data: data
            };

            // Add block-specific properties for INSERT entities
            if (entityType === 'INSERT') {
              const blockName = groupCodes.find(([code]) => code === 2)?.[1];
              if (blockName) {
                entity.blockName = blockName;
              }
            }

            entities.push(entity);
            count++;

            // Stop if we've reached maxEntities
            if (options.maxEntities && count >= options.maxEntities) {
              break;
            }
          }
        }
      } catch (error) {
        console.warn('Failed to parse entity:', error);
      }
    }

    console.log('[DEBUG] Parsed entities:', entities.length);
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
    let currentX: number | null = null;
    let currentY: number | null = null;
    let currentZ: number | null = null;
    const vertices: Array<{ x: number; y: number; z?: number }> = [];

    groupCodes.forEach(([code, value]) => {
      switch (code) {
        case 10: // X coordinate
          if (type === 'POLYLINE' || type === 'LWPOLYLINE') {
            // If we have a complete vertex, add it
            if (currentX !== null && currentY !== null) {
              vertices.push({
                x: currentX,
                y: currentY,
                ...(currentZ !== null && { z: currentZ })
              });
            }
            currentX = parseFloat(value);
            currentY = null;
            currentZ = null;
          } else {
            data.x = parseFloat(value);
          }
          break;
        case 20: // Y coordinate
          if (type === 'POLYLINE' || type === 'LWPOLYLINE') {
            currentY = parseFloat(value);
          } else {
            data.y = parseFloat(value);
          }
          break;
        case 30: // Z coordinate
          if (type === 'POLYLINE' || type === 'LWPOLYLINE') {
            currentZ = parseFloat(value);
          } else {
            data.z = parseFloat(value);
          }
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

    // Add the last vertex if we have a complete one
    if (currentX !== null && currentY !== null) {
      vertices.push({
        x: currentX,
        y: currentY,
        ...(currentZ !== null && { z: currentZ })
      });
    }

    // Add vertices to data if we have any
    if (vertices.length > 0) {
      data.vertices = vertices;
    }

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
    console.log('[DEBUG] Converting entities to features:', entities.length);
    const features: Feature[] = [];
    
    entities.forEach(entity => {
      try {
        switch (entity.type) {
          case 'POINT':
            if (typeof entity.data.x === 'number' && typeof entity.data.y === 'number') {
              features.push({
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: [entity.data.x, entity.data.y]
                },
                properties: {
                  type: entity.type,
                  layer: entity.attributes.layer,
                  ...entity.attributes
                }
              });
            }
            break;
          
          case 'LINE':
            if (typeof entity.data.x === 'number' && typeof entity.data.y === 'number' &&
                typeof entity.data.x2 === 'number' && typeof entity.data.y2 === 'number') {
              features.push({
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [entity.data.x, entity.data.y],
                    [entity.data.x2, entity.data.y2]
                  ]
                },
                properties: {
                  type: entity.type,
                  layer: entity.attributes.layer,
                  ...entity.attributes
                }
              });
            }
            break;

          case 'POLYLINE':
          case 'LWPOLYLINE':
            if (Array.isArray(entity.data.vertices)) {
              const coordinates = entity.data.vertices.map(v => [v.x, v.y]);
              if (coordinates.length >= 2) {
                if (entity.data.closed && coordinates.length >= 3) {
                  // Close the polygon by adding the first point again
                  coordinates.push(coordinates[0]);
                  features.push({
                    type: 'Feature',
                    geometry: {
                      type: 'Polygon',
                      coordinates: [coordinates]
                    },
                    properties: {
                      type: entity.type,
                      layer: entity.attributes.layer,
                      ...entity.attributes
                    }
                  });
                } else {
                  features.push({
                    type: 'Feature',
                    geometry: {
                      type: 'LineString',
                      coordinates: coordinates
                    },
                    properties: {
                      type: entity.type,
                      layer: entity.attributes.layer,
                      ...entity.attributes
                    }
                  });
                }
              }
            }
            break;

          case 'CIRCLE':
            if (typeof entity.data.x === 'number' && 
                typeof entity.data.y === 'number' && 
                typeof entity.data.radius === 'number') {
              // Approximate circle with polygon points
              const points = 32;
              const coordinates = [];
              for (let i = 0; i <= points; i++) {
                const angle = (i / points) * Math.PI * 2;
                coordinates.push([
                  entity.data.x + Math.cos(angle) * entity.data.radius,
                  entity.data.y + Math.sin(angle) * entity.data.radius
                ]);
              }
              features.push({
                type: 'Feature',
                geometry: {
                  type: 'Polygon',
                  coordinates: [coordinates]
                },
                properties: {
                  type: entity.type,
                  layer: entity.attributes.layer,
                  ...entity.attributes
                }
              });
            }
            break;

          case 'ARC':
            if (typeof entity.data.x === 'number' && 
                typeof entity.data.y === 'number' && 
                typeof entity.data.radius === 'number' &&
                typeof entity.data.startAngle === 'number' &&
                typeof entity.data.endAngle === 'number') {
              // Convert angles from degrees to radians
              const startAngle = (entity.data.startAngle * Math.PI) / 180;
              const endAngle = (entity.data.endAngle * Math.PI) / 180;
              
              // Approximate arc with line segments
              const points = 32;
              const coordinates = [];
              const angleRange = endAngle - startAngle;
              for (let i = 0; i <= points; i++) {
                const angle = startAngle + (i / points) * angleRange;
                coordinates.push([
                  entity.data.x + Math.cos(angle) * entity.data.radius,
                  entity.data.y + Math.sin(angle) * entity.data.radius
                ]);
              }
              features.push({
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: coordinates
                },
                properties: {
                  type: entity.type,
                  layer: entity.attributes.layer,
                  ...entity.attributes
                }
              });
            }
            break;
        }
      } catch (error) {
        console.warn('Failed to convert entity to feature:', error);
      }
    });

    console.log('[DEBUG] Converted features:', features.length);
    return features;
  }

  /**
   * Parse DXF blocks
   */
  private parseBlocks(text: string): DxfBlock[] {
    const blocks: DxfBlock[] = [];
    const blocksMatch = text.match(/^0\s+SECTION\s+2\s+BLOCKS([\s\S]*?)^0\s+ENDSEC/m);
    
    if (blocksMatch) {
      const blockRegex = /^0\s+BLOCK\s+([\s\S]*?)^0\s+ENDBLK/gm;
      let match;
      
      while ((match = blockRegex.exec(blocksMatch[1])) !== null) {
        try {
          const groupCodes = this.parseGroupCodes(match[1]);
          const block: DxfBlock = {
            name: '',
            basePoint: [0, 0, 0],
            entities: []
          };
          
          groupCodes.forEach(([code, value]) => {
            switch (code) {
              case 2: // Block name
                block.name = value;
                break;
              case 10: // Base point X
                block.basePoint[0] = parseFloat(value);
                break;
              case 20: // Base point Y
                block.basePoint[1] = parseFloat(value);
                break;
              case 30: // Base point Z
                block.basePoint[2] = parseFloat(value);
                break;
              case 8: // Layer
                block.layer = value;
                break;
              case 4: // Description
                block.description = value;
                break;
            }
          });
          
          if (block.name) {
            blocks.push(block);
          }
        } catch (error) {
          console.warn('Failed to parse block:', error);
        }
      }
    }
    
    return blocks;
  }

  /**
   * Parse DXF layers
   */
  private parseLayers(text: string): DxfLayer[] {
    const layers: DxfLayer[] = [];
    // Find TABLES section first
    const tablesMatch = text.match(/^0\s+SECTION\s+2\s+TABLES([\s\S]*?)^0\s+ENDSEC/m);
    
    if (tablesMatch) {
      // Find LAYER table
      const layerTableMatch = tablesMatch[1].match(/^0\s+TABLE\s+2\s+LAYER([\s\S]*?)^0\s+ENDTAB/m);
      
      if (layerTableMatch) {
        // Match individual layers
        const layerRegex = /^0\s+LAYER\s+([\s\S]*?)(?=^0\s+(?:LAYER|ENDTAB)|\Z)/gm;
        let match;
        
        while ((match = layerRegex.exec(layerTableMatch[1])) !== null) {
          const groupCodes = this.parseGroupCodes(match[1]);
          const layer: DxfLayer = {
            name: '0' // Default layer name
          };
          
          // Parse layer properties
          groupCodes.forEach(([code, value]) => {
            switch (code) {
              case 2: // Layer name
                layer.name = value;
                break;
              case 62: // Color number
                layer.color = Math.abs(parseInt(value)); // Abs because negative means layer is off
                layer.off = parseInt(value) < 0;
                break;
              case 6: // Line type name
                layer.lineType = value;
                break;
              case 370: // Line weight
                layer.lineWeight = parseInt(value);
                break;
              case 70: // Flags
                const flags = parseInt(value);
                layer.frozen = (flags & 1) !== 0;
                layer.locked = (flags & 4) !== 0;
                break;
            }
          });
          
          layers.push(layer);
        }
      }
    }
    
    // Ensure default layer exists
    if (!layers.find(l => l.name === '0')) {
      layers.push({ name: '0' });
    }
    
    return layers;
  }

  /**
   * Parse DXF header section
   */
  private parseHeader(text: string): {
    $EXTMIN?: { x: number; y: number; z?: number };
    $EXTMAX?: { x: number; y: number; z?: number };
    $MEASUREMENT?: number;
  } {
    const header: {
      $EXTMIN?: { x: number; y: number; z?: number };
      $EXTMAX?: { x: number; y: number; z?: number };
      $MEASUREMENT?: number;
    } = {};

    // Find HEADER section
    const headerMatch = text.match(/^0\s+SECTION\s+2\s+HEADER([\s\S]*?)^0\s+ENDSEC/m);
    
    if (headerMatch) {
      // Parse $EXTMIN
      const extminMatch = headerMatch[1].match(/\$EXTMIN\s+([\s\S]*?)(?=\$|\Z)/);
      if (extminMatch) {
        const groupCodes = this.parseGroupCodes(extminMatch[1]);
        const extmin: { x?: number; y?: number; z?: number } = {};
        
        groupCodes.forEach(([code, value]) => {
          switch (code) {
            case 10:
              extmin.x = parseFloat(value);
              break;
            case 20:
              extmin.y = parseFloat(value);
              break;
            case 30:
              extmin.z = parseFloat(value);
              break;
          }
        });
        
        if (typeof extmin.x === 'number' && typeof extmin.y === 'number') {
          header.$EXTMIN = extmin as { x: number; y: number; z?: number };
        }
      }

      // Parse $EXTMAX
      const extmaxMatch = headerMatch[1].match(/\$EXTMAX\s+([\s\S]*?)(?=\$|\Z)/);
      if (extmaxMatch) {
        const groupCodes = this.parseGroupCodes(extmaxMatch[1]);
        const extmax: { x?: number; y?: number; z?: number } = {};
        
        groupCodes.forEach(([code, value]) => {
          switch (code) {
            case 10:
              extmax.x = parseFloat(value);
              break;
            case 20:
              extmax.y = parseFloat(value);
              break;
            case 30:
              extmax.z = parseFloat(value);
              break;
          }
        });
        
        if (typeof extmax.x === 'number' && typeof extmax.y === 'number') {
          header.$EXTMAX = extmax as { x: number; y: number; z?: number };
        }
      }

      // Parse $MEASUREMENT
      const measurementMatch = headerMatch[1].match(/\$MEASUREMENT\s+70\s+(\d+)/);
      if (measurementMatch) {
        header.$MEASUREMENT = parseInt(measurementMatch[1]);
      }
    }

    return header;
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
