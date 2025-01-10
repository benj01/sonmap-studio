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
}
