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

  // Swiss LV95 coordinate ranges
  const SWISS_RANGES = {
    x: { min: 2485000, max: 2834000 },
    y: { min: 1075000, max: 1299000 }
  };

  const validCoords = coordinates.filter(coord => {
    if (!Array.isArray(coord) || coord.length < 2) {
      console.warn('[GeoJSON Converter] Invalid coordinate format:', coord);
      return false;
    }

    const [x, y] = coord;
    if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) {
      console.warn('[GeoJSON Converter] Non-numeric or non-finite coordinates:', { x, y });
      return false;
    }

    // Accept any finite coordinates for now, just log ranges for debugging
    console.debug('[GeoJSON Converter] Processing coordinates:', { 
      x, y,
      isSwissRange: {
        x: x >= SWISS_RANGES.x.min && x <= SWISS_RANGES.x.max,
        y: y >= SWISS_RANGES.y.min && y <= SWISS_RANGES.y.max
      },
      isWGS84Range: {
        x: Math.abs(x) <= 180,
        y: Math.abs(y) <= 90
      }
    });

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
    original: coordinates,
    valid: validCoords,
    pointCount: validCoords.length,
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
    coordinates,
    bbox
  });

  switch (shapeType) {
    case ShapeType.POINT:
    case ShapeType.POINTZ:
    case ShapeType.POINTM:
      return {
        type: 'Point',
        coordinates: coordinates as Position,
        bbox
      };
    case ShapeType.POLYLINE:
    case ShapeType.POLYLINEZ:
    case ShapeType.POLYLINEM:
      // Check if we have a multi-part line (array of arrays of positions)
      const isMultiPart = Array.isArray(coordinates) && 
                         coordinates.length > 0 && 
                         Array.isArray(coordinates[0]) &&
                         Array.isArray(coordinates[0][0]);
      
      if (isMultiPart) {
        // Validate each part's coordinates
        const validParts = (coordinates as Position[][]).map(part => validateLineCoordinates(part))
          .filter(part => part.length >= 2);

        console.debug('[GeoJSON Converter] Creating MultiLineString:', {
          originalParts: (coordinates as Position[][]).length,
          validParts: validParts.length,
          partsDetails: validParts.map(part => ({
            points: part.length,
            bounds: {
              minX: Math.min(...part.map(p => p[0])),
              maxX: Math.max(...part.map(p => p[0])),
              minY: Math.min(...part.map(p => p[1])),
              maxY: Math.max(...part.map(p => p[1]))
            }
          }))
        });

        if (validParts.length === 0) {
          console.warn('[GeoJSON Converter] No valid parts in MultiLineString');
          return {
            type: 'MultiLineString',
            coordinates: [],
            bbox
          };
        }

        return {
          type: 'MultiLineString',
          coordinates: validParts,
          bbox
        };
      } else {
        // Single LineString - validate coordinates
        const validLineCoords = validateLineCoordinates(coordinates as Position[]);
        
        console.debug('[GeoJSON Converter] Creating LineString:', {
          originalPoints: (coordinates as Position[]).length,
          validPoints: validLineCoords.length,
          bounds: validLineCoords.length >= 2 ? {
            minX: Math.min(...validLineCoords.map(p => p[0])),
            maxX: Math.max(...validLineCoords.map(p => p[0])),
            minY: Math.min(...validLineCoords.map(p => p[1])),
            maxY: Math.max(...validLineCoords.map(p => p[1]))
          } : null
        });

        return {
          type: 'LineString',
          coordinates: validLineCoords,
          bbox
        };
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
  console.debug('[GeoJSON Converter] Converting records:', {
    count: inputRecords.length,
    firstRecord: inputRecords[0],
    recordTypes: inputRecords.map(r => ShapeType[r.shapeType]),
    firstCoordinates: inputRecords[0]?.data.coordinates,
    firstBBox: inputRecords[0]?.data.bbox
  });

  return inputRecords.map((record, index): Feature => {
    const { shapeType, data } = record;
    const bbox = data.bbox ? createBBox(data.bbox) : undefined;

    // Enhanced coordinate logging
    console.debug('[GeoJSON Converter] Processing record:', {
      index,
      shapeType: ShapeType[shapeType],
      coordinates: data.coordinates,
      bbox,
      coordinateType: Array.isArray(data.coordinates) 
        ? Array.isArray(data.coordinates[0]) 
          ? 'nested array' 
          : 'array' 
        : 'single',
      sampleCoordinate: Array.isArray(data.coordinates) 
        ? data.coordinates[0] 
        : data.coordinates
    });

    const geometry = createGeometry(shapeType, data.coordinates, bbox);

    const feature: Feature = {
      type: 'Feature',
      geometry,
      properties: {
        ...record.attributes || {},
        shapeType: ShapeType[shapeType],
        recordIndex: index,
        layer: 'shapes' // Ensure features are assigned to the 'shapes' layer
      },
      bbox
    };

    if (index === 0 || index === inputRecords.length - 1) {
      console.debug(`[GeoJSON Converter] Converted ${index === 0 ? 'first' : 'last'} feature:`, {
        shapeType: ShapeType[shapeType],
        bbox,
        geometryType: geometry.type,
        coordinates: geometry.coordinates,
        properties: feature.properties
      });
    }

    return feature;
  });
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
