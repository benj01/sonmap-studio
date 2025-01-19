import { Feature, Geometry, Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon } from 'geojson';
import { ShapeType } from '../types';
import { WasmGeometryConverter } from './wasm-bridge';

type GeometryWithCoordinates = Point | LineString | Polygon | MultiPoint | MultiLineString | MultiPolygon;

export class GeometryConverter {
  private wasmConverter: WasmGeometryConverter;

  constructor() {
    this.wasmConverter = new WasmGeometryConverter();
  }

  /**
   * Convert shapefile record to GeoJSON feature with validation
   */
  recordToFeature(record: {
    header: { recordNumber: number; contentLength: number };
    shapeType: ShapeType;
    data: Record<string, unknown>;
    attributes: Record<string, unknown>;
  }): Feature {
    try {
      // Validate record data
      if (!record.data || typeof record.data !== 'object') {
        throw new Error('Invalid record data');
      }

      // Validate geometry
      const geometry = record.data as unknown as GeometryWithCoordinates;
      if (!geometry || !geometry.type || !geometry.coordinates) {
        throw new Error('Invalid geometry data');
      }

      // Validate coordinates based on geometry type
      const validateCoordinates = (coords: any, type: string): boolean => {
        if (!Array.isArray(coords)) return false;
        if (coords.length === 0) return false;

        switch (type) {
          case 'Point':
            return coords.length === 2 && coords.every(isFinite);
          case 'MultiPoint':
          case 'LineString':
            return coords.every(c => Array.isArray(c) && c.length === 2 && c.every(isFinite));
          case 'Polygon':
          case 'MultiLineString':
            return coords.every(line => 
              Array.isArray(line) && line.every(c => 
                Array.isArray(c) && c.length === 2 && c.every(isFinite)
              )
            );
          case 'MultiPolygon':
            return coords.every(poly => 
              Array.isArray(poly) && poly.every(line => 
                Array.isArray(line) && line.every(c => 
                  Array.isArray(c) && c.length === 2 && c.every(isFinite)
                )
              )
            );
          default:
            return false;
        }
      };

      if (!validateCoordinates(geometry.coordinates, geometry.type)) {
        console.warn('[GeometryConverter] Invalid coordinates in record:', {
          recordNumber: record.header.recordNumber,
          geometryType: geometry.type
        });
        throw new Error(`Invalid coordinates for geometry type: ${geometry.type}`);
      }

      // Create feature with validated data
      const feature: Feature = {
        type: 'Feature',
        geometry: geometry as Geometry,
        properties: {
          ...record.attributes,
          recordNumber: record.header.recordNumber,
          shapeType: record.shapeType,
          _validated: true,
          _geometryType: geometry.type
        }
      };

      console.debug('[GeometryConverter] Converted record to feature:', {
        recordNumber: record.header.recordNumber,
        shapeType: record.shapeType,
        geometryType: geometry.type
      });

      return feature;
    } catch (error) {
      console.error('[GeometryConverter] Failed to convert record:', error);
      throw error;
    }
  }

  /**
   * Check if a ring is clockwise with validation
   * @param ring Array of [x, y] coordinates forming a ring
   * @returns true if the ring is clockwise, false otherwise
   */
  isClockwise(ring: [number, number][]): boolean {
    try {
      // Validate ring
      if (!Array.isArray(ring) || ring.length < 3) {
        console.warn('[GeometryConverter] Invalid ring:', ring);
        return false;
      }

      // Validate coordinates
      if (!ring.every(coord => 
        Array.isArray(coord) && 
        coord.length === 2 && 
        coord.every(isFinite)
      )) {
        console.warn('[GeometryConverter] Invalid coordinates in ring:', ring);
        return false;
      }

      // Calculate the signed area
      let area = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[i + 1];
        area += (x2 - x1) * (y2 + y1);
      }
      // Close the ring
      const [x1, y1] = ring[ring.length - 1];
      const [x2, y2] = ring[0];
      area += (x2 - x1) * (y2 + y1);

      // Area is positive for clockwise rings
      const isClockwise = area > 0;
      console.debug('[GeometryConverter] Ring orientation:', {
        pointCount: ring.length,
        area,
        isClockwise
      });

      return isClockwise;
    } catch (error) {
      console.error('[GeometryConverter] Failed to check ring orientation:', error);
      return false;
    }
  }
}
