import { Feature, Point, LineString, Polygon, Position } from 'geojson';
import { DxfEntity, DxfEntityType } from '../../types';

export interface EntityParserOptions {
  validateGeometry?: boolean;
  preserveColors?: boolean;
  preserveLineWeights?: boolean;
  coordinateSystem?: string;
}

export interface Vertex {
  x: number;
  y: number;
  z?: number;
  bulge?: number;
}

export interface GeometryValidationResult {
  isValid: boolean;
  error?: string;
}

export interface EntityParsingContext {
  type: DxfEntityType;
  content: string;
  vertices: Vertex[];
  currentVertex: Partial<Vertex>;
  vertexCount: number;
}

export interface GroupCode {
  code: number;
  value: string;
}

export type GeometryConverter = (entity: DxfEntity) => Point | LineString | Polygon | null;

export type {
  Feature,
  Point,
  LineString,
  Polygon,
  Position,
  DxfEntity,
  DxfEntityType
};
