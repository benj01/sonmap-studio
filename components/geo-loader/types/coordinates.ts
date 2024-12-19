import { Position } from 'geojson';

export const COORDINATE_SYSTEMS = {
  NONE: 'none',
  WGS84: 'EPSG:4326',
  SWISS_LV95: 'EPSG:2056',
  SWISS_LV03: 'EPSG:21781',
} as const;

// Helper function to check if a coordinate system is Swiss
export function isSwissSystem(system: string): boolean {
  return system === COORDINATE_SYSTEMS.SWISS_LV95 || system === COORDINATE_SYSTEMS.SWISS_LV03;
}

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

// Default center for Switzerland (Aarau)
export const DEFAULT_CENTER = {
  longitude: 8.0472,  // Aarau longitude
  latitude: 47.3925,  // Aarau latitude
  zoom: 13
};
