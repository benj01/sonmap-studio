import { Feature, Geometry } from 'geojson';
import { ShapeType } from '../types';
import { WasmGeometryConverter } from './wasm-bridge';

export class GeometryConverter {
  private wasmConverter: WasmGeometryConverter;

  constructor() {
    this.wasmConverter = new WasmGeometryConverter();
  }

  /**
   * Convert shapefile record to GeoJSON feature
   */
  recordToFeature(record: {
    header: { recordNumber: number; contentLength: number };
    shapeType: ShapeType;
    data: Record<string, unknown>;
    attributes: Record<string, unknown>;
  }): Feature {
    const geometry = record.data as unknown as Geometry;
    return {
      type: 'Feature',
      geometry,
      properties: record.attributes || { recordNumber: record.header.recordNumber }
    };
  }

  /**
   * Check if a ring is clockwise
   * @param ring Array of [x, y] coordinates forming a ring
   * @returns true if the ring is clockwise, false otherwise
   */
  isClockwise(ring: [number, number][]): boolean {
    if (ring.length < 3) return false;

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
    return area > 0;
  }
}
