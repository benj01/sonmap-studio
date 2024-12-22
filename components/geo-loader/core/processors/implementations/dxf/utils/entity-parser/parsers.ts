import { DxfEntity, DxfEntityType, EntityParsingContext, GroupCode, Vertex } from './types';
import { validateGroupCode, validateVertex } from './validation';

/**
 * Parse group codes from content lines
 */
export function parseGroupCodes(lines: string[]): GroupCode[] {
  const groupCodes: GroupCode[] = [];
  let currentCode: number | null = null;
  
  console.log('[DEBUG] Parsing group codes from lines:', {
    lineCount: lines.length,
    firstLines: lines.slice(0, 4)
  });
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    if (currentCode === null) {
      // Try to parse as code
      const code = parseInt(line);
      if (!isNaN(code)) {
        currentCode = code;
        console.log('[DEBUG] Found group code:', code);
      }
    } else {
      // This line should be the value
      groupCodes.push({ code: currentCode, value: line });
      console.log('[DEBUG] Added group code pair:', {
        code: currentCode,
        value: line,
        pairIndex: groupCodes.length - 1
      });
      currentCode = null;
    }
  }

  console.log('[DEBUG] Parsed group codes:', {
    count: groupCodes.length,
    firstCodes: groupCodes.slice(0, 3),
    lastCodes: groupCodes.slice(-3)
  });

  return groupCodes;
}

/**
 * Process group codes for LWPOLYLINE entity
 */
export function processLwpolyline(
  groupCodes: GroupCode[],
  context: EntityParsingContext
): DxfEntity {
  const entity: DxfEntity = {
    type: 'LWPOLYLINE',
    attributes: {
      layer: '0' // Default layer
    },
    data: {
      vertices: [] as Vertex[],
      closed: false
    }
  };

  let currentVertex: Partial<Vertex> = {};

  for (const groupCode of groupCodes) {
    const { code, value } = groupCode;
    if (!validateGroupCode({ code, value })) {
      console.warn('[DEBUG] Invalid group code:', { code, value });
      continue;
    }

    switch (code) {
      case 70: // Flags
        const flags = parseInt(value);
        entity.data.closed = (flags & 1) === 1;
        console.log('[DEBUG] Set LWPOLYLINE flags:', {
          flags,
          closed: entity.data.closed
        });
        break;

      case 90: // Vertex count
        entity.data.vertexCount = parseInt(value);
        console.log('[DEBUG] Set vertex count:', entity.data.vertexCount);
        break;

      case 10: // X coordinate
        const x = parseFloat(value);
        if (!isNaN(x)) {
          // If we have a complete vertex, save it
          if (currentVertex.x !== undefined && currentVertex.y !== undefined) {
            if (validateVertex(currentVertex as Vertex)) {
              context.vertices.push(currentVertex as Vertex);
              context.vertexCount++;
              console.log('[DEBUG] Added complete vertex:', {
                ...currentVertex,
                vertexCount: context.vertexCount
              });
            }
          }
          // Start new vertex with X
          currentVertex = { x };
          console.log('[DEBUG] Started new vertex with X:', x);
        }
        break;

      case 20: // Y coordinate
        const y = parseFloat(value);
        if (!isNaN(y)) {
          currentVertex.y = y;
          console.log('[DEBUG] Added Y to vertex:', {
            ...currentVertex,
            newY: y
          });
          // If we now have both X and Y, add the vertex
          if (currentVertex.x !== undefined) {
            if (validateVertex(currentVertex as Vertex)) {
              context.vertices.push(currentVertex as Vertex);
              context.vertexCount++;
              console.log('[DEBUG] Added complete vertex:', {
                ...currentVertex,
                vertexCount: context.vertexCount
              });
              currentVertex = {}; // Reset for next vertex
            }
          }
        }
        break;

      case 30: // Z coordinate
        if (currentVertex.x !== undefined && currentVertex.y !== undefined) {
          const z = parseFloat(value);
          if (!isNaN(z)) {
            currentVertex.z = z;
            console.log('[DEBUG] Added Z to vertex:', currentVertex);
          }
        }
        break;

      case 42: // Bulge
        if (currentVertex.x !== undefined) {
          const bulge = parseFloat(value);
          if (!isNaN(bulge)) {
            currentVertex.bulge = bulge;
            console.log('[DEBUG] Added bulge to vertex:', currentVertex);
          }
        }
        break;

      case 8: // Layer
        entity.attributes.layer = value;
        break;

      case 6: // Line type
        entity.attributes.lineType = value;
        break;

      case 62: // Color
        entity.attributes.color = parseInt(value);
        break;

      case 370: // Line weight
        entity.attributes.lineWeight = parseInt(value);
        break;

      default:
        // Store other properties in data
        if (!isNaN(parseInt(value))) {
          entity.data[`code_${code}`] = parseFloat(value);
        } else {
          entity.data[`code_${code}`] = value;
        }
    }
  }

  // Add collected vertices
  if (context.vertices.length > 0) {
    entity.data.vertices = context.vertices;
    entity.data.vertexCount = context.vertices.length;
    
    console.log('[DEBUG] Finalized LWPOLYLINE entity:', {
      vertexCount: context.vertices.length,
      firstVertex: context.vertices[0],
      lastVertex: context.vertices[context.vertices.length - 1],
      closed: entity.data.closed,
      allData: entity.data
    });
  } else {
    console.warn('[DEBUG] No vertices collected for LWPOLYLINE');
  }

  return entity;
}

/**
 * Clean and normalize entity content
 */
export function normalizeContent(content: string): string[] {
  return content
    .replace(/\r\n?/g, '\n') // Normalize line endings
    .replace(/#.*$/gm, '') // Remove comments
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#')); // Filter empty lines and comments
}

/**
 * Create initial parsing context
 */
export function createParsingContext(type: DxfEntityType, content: string): EntityParsingContext {
  return {
    type,
    content,
    vertices: [],
    currentVertex: {},
    vertexCount: 0
  };
}
