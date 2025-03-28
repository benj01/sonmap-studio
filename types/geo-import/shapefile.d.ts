declare module 'shapefile' {
  import type { Feature, Geometry, GeoJsonProperties } from 'geojson';

  export interface ShapefileHeader {
    length: number;
    bbox: [number, number, number, number];
  }

  export interface DBFHeader {
    fields: { name: string; type: string; length: number }[];
  }

  export interface ShapefileReader {
    header: Promise<ShapefileHeader>;
    read(): Promise<{ done: boolean; value: Feature<Geometry, GeoJsonProperties> }>;
    close(): void;
  }

  export interface DBFReader {
    header: Promise<DBFHeader>;
    read(): Promise<{ done: boolean; value: Record<string, any> }>;
    close(): void;
  }

  export function open(options?: { encoding?: string }): Promise<ShapefileReader>;
  export function read(source: any, dbf?: any, options?: { encoding?: string }): Promise<ShapefileReader>;
} 