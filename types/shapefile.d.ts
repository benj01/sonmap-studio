declare module 'shapefile' {
  interface ShapefileHeader {
    bbox: [number, number, number, number];
  }

  interface ShapefileSource {
    header: Promise<ShapefileHeader>;
    read(): Promise<{ done: boolean; value: any } | null>;
  }

  export function open(buffer: ArrayBuffer): Promise<ShapefileSource>;
}
