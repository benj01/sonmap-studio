import { Feature, Position, Point, LineString, Polygon, MultiPoint, MultiLineString, Geometry, BBox } from 'geojson';
import { ShapeType } from '../types';
import { ShapefileRecord, ShapefileAttributes } from '../types/records';

type ShapeGeometry = Point | LineString | Polygon | MultiPoint | MultiLineString;

interface GeometryMapping {
  type: 'Point' | 'LineString' | 'Polygon' | 'MultiPoint';
  coordinates: Position | Position[] | Position[][];
  bbox?: BBox;
}

function createBBox(bbox: { xMin: number; yMin: number; xMax: number; yMax: number }): BBox {
  return [bbox.xMin, bbox.yMin, bbox.xMax, bbox.yMax];
}

function validateLineCoordinates(coordinates: any): Position[] {
  if (!Array.isArray(coordinates)) {
    console.warn('[GeoJSON Converter] Line coordinates not an array:', coordinates);
    return [];
  }

  if (coordinates.length < 2) {
    console.warn('[GeoJSON Converter] Line has less than 2 points:', coordinates);
    return [];
  }

  const validCoords = coordinates.filter(coord => {
    if (!Array.isArray(coord) || coord.length < 2) {
      console.warn('[GeoJSON Converter] Invalid coordinate format:', coord);
      return false;
    }

    const [x, y] = coord;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      console.warn('[GeoJSON Converter] Non-finite coordinates:', { x, y });
      return false;
    }

    return true;
  });

  if (validCoords.length < 2) {
    console.warn('[GeoJSON Converter] Line has less than 2 valid points:', {
      original: coordinates,
      valid: validCoords
    });
    return [];
  }

  console.debug('[GeoJSON Converter] Line coordinates validated:', {
    pointCount: validCoords.length,
    sample: validCoords.slice(0, 2),
    bounds: {
      x: {
        min: Math.min(...validCoords.map(c => c[0])),
        max: Math.max(...validCoords.map(c => c[0]))
      },
      y: {
        min: Math.min(...validCoords.map(c => c[1])),
        max: Math.max(...validCoords.map(c => c[1]))
      }
    }
  });

  return validCoords;
}

function createGeometry(shapeType: number, coordinates: Position | Position[] | Position[][], bbox?: BBox): ShapeGeometry {
  console.debug('[GeoJSON Converter] Creating geometry:', {
    type: ShapeType[shapeType],
    sample: Array.isArray(coordinates) ? coordinates.slice(0, 1) : coordinates,
    bbox
  });

  switch (shapeType) {
    case ShapeType.POINT:
    case ShapeType.POINTZ:
    case ShapeType.POINTM:
      if (!Array.isArray(coordinates) || coordinates.length < 2) {
        throw new Error('Invalid point coordinates');
      }
      return {
        type: 'Point',
        coordinates: coordinates as Position,
        bbox
      };

    case ShapeType.POLYLINE:
    case ShapeType.POLYLINEZ:
    case ShapeType.POLYLINEM: {
      // Check if we have a multi-part line
      const isMultiPart = Array.isArray(coordinates) && 
                         coordinates.length > 0 && 
                         Array.isArray(coordinates[0]) &&
                         Array.isArray(coordinates[0][0]);
      
      if (isMultiPart) {
        // Handle multi-part line
        const validParts = (coordinates as Position[][]).map(part => validateLineCoordinates(part))
          .filter(part => part.length >= 2);

        if (validParts.length === 0) {
          throw new Error('No valid line parts found');
        }

        if (validParts.length === 1) {
          return {
            type: 'LineString',
            coordinates: validParts[0],
            bbox
          };
        }

        return {
          type: 'MultiLineString',
          coordinates: validParts,
          bbox
        };
      } else {
        // Handle single line
        const validCoords = validateLineCoordinates(coordinates as Position[]);
        if (validCoords.length < 2) {
          throw new Error('Invalid line coordinates');
        }

        return {
          type: 'LineString',
          coordinates: validCoords,
          bbox
        };
      }
    }
    case ShapeType.POLYGON:
    case ShapeType.POLYGONZ:
    case ShapeType.POLYGONM:
      // Validate polygon coordinates similar to lines
      if (!Array.isArray(coordinates) || !Array.isArray(coordinates[0])) {
        console.warn('[GeoJSON Converter] Invalid polygon coordinates structure:', coordinates);
        return {
          type: 'Polygon',
          coordinates: [],
          bbox
        };
      }

      // Validate each ring's coordinates
      const validRings = (coordinates as Position[][]).map(ring => validateLineCoordinates(ring))
        .filter(ring => ring.length >= 3); // Polygons need at least 3 points

      console.debug('[GeoJSON Converter] Creating Polygon:', {
        originalRings: (coordinates as Position[][]).length,
        validRings: validRings.length,
        ringsDetails: validRings.map(ring => ({
          points: ring.length,
          bounds: {
            minX: Math.min(...ring.map(p => p[0])),
            maxX: Math.max(...ring.map(p => p[0])),
            minY: Math.min(...ring.map(p => p[1])),
            maxY: Math.max(...ring.map(p => p[1]))
          }
        }))
      });

      if (validRings.length === 0) {
        console.warn('[GeoJSON Converter] No valid rings in Polygon');
        return {
          type: 'Polygon',
          coordinates: [],
          bbox
        };
      }

      return {
        type: 'Polygon',
        coordinates: validRings,
        bbox
      };
    case ShapeType.MULTIPOINT:
    case ShapeType.MULTIPOINTZ:
    case ShapeType.MULTIPOINTM:
      return {
        type: 'MultiPoint',
        coordinates: coordinates as Position[],
        bbox
      };
    default:
      throw new Error(`Unsupported shape type: ${shapeType}`);
  }
}

/**
 * Convert shapefile records to GeoJSON features
 */
export function convertToGeoJSON(inputRecords: ShapefileRecord[]): Feature[] {
  console.debug('[GeoJSON Converter] Starting conversion:', {
    recordCount: inputRecords.length,
    sample: inputRecords[0]
  });

  return inputRecords.map((record, index) => {
    try {
      const { shapeType, data } = record;
      console.debug(`[GeoJSON Converter] Converting record ${index}:`, {
        shapeType: ShapeType[shapeType],
        data
      });

      // Extract bbox if present
      const bbox = data.bbox ? createBBox(data.bbox) : undefined;
      console.debug('[GeoJSON Converter] Record bbox:', bbox);

      let geometry: any = null;

      switch (shapeType) {
        case ShapeType.POINT:
          if (!data.coordinates || !Array.isArray(data.coordinates)) {
            console.warn('[GeoJSON Converter] Invalid POINT coordinates:', data.coordinates);
            return null;
          }
          geometry = {
            type: 'Point',
            coordinates: data.coordinates,
            bbox
          };
          break;

        case ShapeType.POLYLINE:
          if (!data.coordinates || !Array.isArray(data.coordinates)) {
            console.warn('[GeoJSON Converter] Invalid POLYLINE coordinates:', data.coordinates);
            return null;
          }

          // Check if we have a multi-part line
          const isMultiPart = Array.isArray(data.coordinates[0]) && 
                            Array.isArray(data.coordinates[0][0]);

          if (isMultiPart) {
            // Multi-part line - each part is an array of coordinate pairs
            geometry = {
              type: 'MultiLineString',
              coordinates: data.coordinates,
              bbox
            };
          } else {
            // Single line - array of coordinate pairs
            geometry = {
              type: 'LineString',
              coordinates: data.coordinates,
              bbox
            };
          }

          console.debug('[GeoJSON Converter] Created POLYLINE geometry:', {
            type: geometry.type,
            partCount: isMultiPart ? data.coordinates.length : 1,
            pointCount: isMultiPart ? 
              data.coordinates.reduce((sum: number, part: any[]) => sum + part.length, 0) : 
              data.coordinates.length,
            bbox: geometry.bbox
          });
          break;

        case ShapeType.POLYGON:
          if (!data.coordinates || !Array.isArray(data.coordinates)) {
            console.warn('[GeoJSON Converter] Invalid POLYGON coordinates:', data.coordinates);
            return null;
          }

          // Check if we have a multi-part polygon
          const isMultiPolygon = Array.isArray(data.coordinates[0]) && 
                                Array.isArray(data.coordinates[0][0]) &&
                                Array.isArray(data.coordinates[0][0][0]);

          if (isMultiPolygon) {
            geometry = {
              type: 'MultiPolygon',
              coordinates: data.coordinates,
              bbox
            };
          } else {
            geometry = {
              type: 'Polygon',
              coordinates: data.coordinates,
              bbox
            };
          }

          console.debug('[GeoJSON Converter] Created POLYGON geometry:', {
            type: geometry.type,
            ringCount: isMultiPolygon ? 
              data.coordinates.reduce((sum: number, poly: any[]) => sum + poly.length, 0) : 
              data.coordinates.length,
            bbox: geometry.bbox
          });
          break;

        default:
          console.warn(`[GeoJSON Converter] Unsupported shape type: ${ShapeType[shapeType]}`);
          return null;
      }

      if (!geometry) {
        console.warn('[GeoJSON Converter] Failed to create geometry:', {
          shapeType: ShapeType[shapeType],
          data
        });
        return null;
      }

      const feature = {
        type: 'Feature',
        geometry,
        properties: record.attributes || {},
        bbox
      };

      console.debug(`[GeoJSON Converter] Created feature ${index}:`, {
        type: feature.geometry.type,
        coordinates: feature.geometry.coordinates,
        bbox: feature.bbox,
        properties: feature.properties
      });

      return feature;
    } catch (error) {
      console.error(`[GeoJSON Converter] Error converting record ${index}:`, {
        error: error instanceof Error ? error.message : String(error),
        record
      });
      return null;
    }
  }).filter(Boolean) as Feature[];
}

/**
 * Convert GeoJSON features back to shapefile records
 */
export function convertFromGeoJSON(features: Feature[]): ShapefileRecord[] {
  console.debug('[GeoJSON Converter] Converting features back to records:', {
    count: features.length,
    firstFeature: features[0],
    featureTypes: features.map(f => f.geometry.type)
  });

  return features.map((feature, index): ShapefileRecord => {
    const { geometry, properties } = feature;
    let shapeType: number;
    let coordinates: Position | Position[] | Position[][];

    switch (geometry.type) {
      case 'Point':
        shapeType = ShapeType.POINT;
        coordinates = geometry.coordinates;
        break;
      case 'LineString':
        shapeType = ShapeType.POLYLINE;
        coordinates = validateLineCoordinates(geometry.coordinates);
        break;
      case 'Polygon':
        shapeType = ShapeType.POLYGON;
        coordinates = geometry.coordinates;
        break;
      case 'MultiPoint':
        shapeType = ShapeType.MULTIPOINT;
        coordinates = geometry.coordinates;
        break;
      case 'MultiLineString':
        shapeType = ShapeType.POLYLINE;
        coordinates = geometry.coordinates;
        break;
      default:
        throw new Error(`Unsupported geometry type: ${geometry.type}`);
    }

    const bbox = feature.bbox ? {
      xMin: feature.bbox[0],
      yMin: feature.bbox[1],
      xMax: feature.bbox[2],
      yMax: feature.bbox[3]
    } : undefined;

    // Create attributes with required recordNumber
    const attributes: ShapefileAttributes = {
      recordNumber: index + 1,
      ...properties as Record<string, string | number | boolean | null>
    };

    const record: ShapefileRecord = {
      header: {
        recordNumber: index + 1,
        contentLength: 0 // This will be calculated when writing the file
      },
      shapeType,
      data: {
        coordinates,
        bbox
      },
      attributes
    };

    if (index === 0 || index === features.length - 1) {
      console.debug(`[GeoJSON Converter] Converted ${index === 0 ? 'first' : 'last'} record:`, {
        shapeType: ShapeType[shapeType],
        bbox,
        coordinates,
        attributes: record.attributes
      });
    }

    return record;
  });
}
