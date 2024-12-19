import type { CoordinateSystem } from './coordinates';
import type proj4 from 'proj4';

/**
 * Type definition for proj4 converter
 */
export interface Proj4Converter {
  /**
   * Transform coordinates forward (from source to target system)
   */
  forward(coords: [number, number]): [number, number];

  /**
   * Transform coordinates inverse (from target to source system)
   */
  inverse(coords: [number, number]): [number, number];
}

/**
 * Re-export proj4 type
 */
export type Proj4Type = typeof proj4;

/**
 * Export proj4 module type for convenience
 */
export type { default as Proj4 } from 'proj4';
