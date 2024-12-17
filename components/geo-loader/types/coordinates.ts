import { Position } from 'geojson';

export const COORDINATE_SYSTEMS = {
  NONE: 'none',
  WGS84: 'EPSG:4326',
  SWISS_LV95: 'EPSG:2056',
  SWISS_LV03: 'EPSG:21781',
} as const;

export type CoordinateSystem = typeof COORDINATE_SYSTEMS[keyof typeof COORDINATE_SYSTEMS];

export interface Point {
  x: number;
  y: number;
  z?: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type Coordinate = Position;
export type Ring = Coordinate[];
