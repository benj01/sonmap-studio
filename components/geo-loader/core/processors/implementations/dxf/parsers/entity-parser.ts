import { Feature } from 'geojson';
import { DxfEntity, DxfEntityType } from '../types';
import { parseGroupCodes, findSection, ENTITY_PATTERN } from '../utils/regex-patterns';
import { validateEntityData } from '../utils/validation/structure-validator';

/**
 * Parse DXF entities from ENTITIES section
 */
export async function parseEntities(
  text: string,
  options: {
    maxEntities?: number;
    parseBlocks?: boolean;
    parseText?: boolean;
    parseDimensions?: boolean;
    entityTypes?: DxfEntityType[];
  } = {}
): Promise<DxfEntity[]> {
  console.log('[DEBUG] Starting entity parsing');
  const entities: DxfEntity[] = [];

  try {
    // Find ENTITIES section
    console.log('[DEBUG] Looking for ENTITIES section in content:', {
      contentLength: text.length,
      sample: text.substring(0, 200).split('\n').join(' | ')
    });

    const entitiesSection = findSection(text, 'ENTITIES');
    if (!entitiesSection) {
      console.warn('[DEBUG] No ENTITIES section found');
      return entities;
    }

    console.log('[DEBUG] Found ENTITIES section:', {
      contentLength: entitiesSection.content.length,
      contentStart: entitiesSection.content.substring(0, 200).split('\n').join(' | '),
      groupCodes: parseGroupCodes(entitiesSection.content.substring(0, 200))
    });
    
    // Parse entities using pattern
    const entityRegex = ENTITY_PATTERN;
    let match;
    let count = 0;

    while ((match = entityRegex.exec(entitiesSection.content)) !== null) {
      try {
        const [, type, entityContent] = match;
        const upperType = type.toUpperCase();
        
        if (isValidEntityType(upperType)) {
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

          console.log('[DEBUG] Found entity:', {
            type: entityType,
            contentLength: entityContent.length,
            sample: entityContent.substring(0, 100).split('\n').join(' | '),
            groupCodes: parseGroupCodes(entityContent.substring(0, 100))
          });

          const groupCodes = parseGroupCodes(entityContent);
          console.log('[DEBUG] Parsed group codes:', {
            count: groupCodes.length,
            codes: groupCodes.map(([code]) => code).join(','),
            sample: groupCodes.slice(0, 5)
          });

          const attributes = parseEntityAttributes(groupCodes);
          const data = parseEntityData(groupCodes, entityType);

          // Validate entity data
          const issues = validateEntityData(entityType, data);
          if (issues.length > 0) {
            console.warn(`[DEBUG] Entity validation issues:`, issues);
            continue;
          }

          // Only create entity if we have valid data
          if (data && Object.keys(data).length > 0) {
            const entity: DxfEntity = {
              type: entityType,
              attributes: attributes || {},
              data: data
            };

            console.log('[DEBUG] Created entity:', {
              type: entityType,
              dataKeys: Object.keys(data),
              attributeKeys: Object.keys(attributes || {}),
              hasVertices: 'vertices' in data
            });

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

    console.log('[DEBUG] Parsed entities:', {
      count: entities.length,
      types: entities.map(e => e.type)
    });

    return entities;
  } catch (error) {
    console.error('[DEBUG] Error parsing entities:', error);
    // Return empty array on error rather than throwing
    return [];
  }
}

/**
 * Parse entity data based on type
 */
function parseEntityData(
  groupCodes: Array<[number, string]>,
  type: DxfEntityType
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const vertices: Array<{ x: number; y: number; z?: number }> = [];
  let currentVertex: { x?: number; y?: number; z?: number } = {};

  // First pass: collect all coordinates
  groupCodes.forEach(([code, value]) => {
    const num = parseFloat(value);
    if (isNaN(num)) return;

    switch (code) {
      case 10: // X coordinate
        if (type === 'POLYLINE' || type === 'LWPOLYLINE') {
          // If we have a complete vertex, add it and start a new one
          if (currentVertex.x !== undefined && currentVertex.y !== undefined) {
            vertices.push({
              x: currentVertex.x,
              y: currentVertex.y,
              ...(currentVertex.z !== undefined && { z: currentVertex.z })
            });
            currentVertex = { x: num };
          } else {
            currentVertex.x = num;
          }
        } else {
          data.x = num;
        }
        break;
      case 20: // Y coordinate
        if (type === 'POLYLINE' || type === 'LWPOLYLINE') {
          currentVertex.y = num;
          // If we now have a complete vertex, add it
          if (currentVertex.x !== undefined) {
            vertices.push({
              x: currentVertex.x,
              y: num,
              ...(currentVertex.z !== undefined && { z: currentVertex.z })
            });
            currentVertex = {};
          }
        } else {
          data.y = num;
        }
        break;
      case 30: // Z coordinate
        if (type === 'POLYLINE' || type === 'LWPOLYLINE') {
          currentVertex.z = num;
        } else {
          data.z = num;
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

  // Add any remaining complete vertex
  if (currentVertex.x !== undefined && currentVertex.y !== undefined) {
    vertices.push({
      x: currentVertex.x,
      y: currentVertex.y,
      ...(currentVertex.z !== undefined && { z: currentVertex.z })
    });
  }

  // Add vertices to data if we have any
  if (vertices.length > 0) {
    console.log('[DEBUG] Collected vertices:', vertices.length, vertices);
    data.vertices = vertices;
  }

  return data;
}

/**
 * Parse entity attributes from group codes
 */
function parseEntityAttributes(
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

/**
 * Check if entity type is valid
 */
function isValidEntityType(type: string): type is DxfEntityType {
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
export function convertToFeatures(entities: DxfEntity[]): Feature[] {
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
