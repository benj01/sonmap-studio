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
    read(): Promise<{ done: boolean; value: GeoJsonProperties }>;
    close(): void;
  }

  export interface ShapefileSource {
    buffer?: ArrayBuffer | SharedArrayBuffer;
    stream?: ReadableStream;
    url?: string;
  }

  export function open(
    shp: ShapefileSource | ArrayBuffer | Uint8Array | string,
    dbf?: ShapefileSource | ArrayBuffer | Uint8Array | string,
    options?: { encoding?: string }
  ): Promise<ShapefileReader>;

  export function read(
    shp: ShapefileSource | ArrayBuffer | Uint8Array | string,
    dbf?: ShapefileSource | ArrayBuffer | Uint8Array | string,
    options?: { encoding?: string }
  ): Promise<ShapefileReader>;
} 