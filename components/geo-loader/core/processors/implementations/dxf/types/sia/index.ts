/**
 * Type definitions for SIA 2014 standard implementation
 */

/**
 * Represents a single SIA layer key component
 */
export interface SiaLayerKey {
  prefix: string;  // Single letter prefix (a-z)
  content: string; // Content value after the prefix
}

/**
 * Represents a complete SIA layer structure according to SIA 2014 standard
 */
export interface SiaLayer {
  // Mandatory fields
  agent: SiaLayerKey;        // a - Responsible entity (architect, engineer, etc.)
  element: SiaLayerKey;      // b - Physical/functional part (walls, floors, etc.)
  presentation: SiaLayerKey; // c - Graphical representation

  // Optional fields
  scale?: SiaLayerKey;       // d - Applicable scale (1:100, 1:50, etc.)
  phase?: SiaLayerKey;       // e - Construction phase
  status?: SiaLayerKey;      // f - Element status (existing, new, etc.)
  location?: SiaLayerKey;    // g - Spatial positioning
  projection?: SiaLayerKey;  // h - View type
  freeTyping?: SiaLayerKey[]; // i-z - Custom fields
}

/**
 * Represents the SIA file header metadata
 */
export interface SiaHeader {
  // Required fields
  OBJFILE: string;      // Object identifier 
  PROJFILE: string;     // Project identifier
  FILE: string;         // CAD file name
  TEXTFILE: string;     // Description
  DATEFILE: string;     // Date (YYYYMMDD)
  VERFILE: string;      // Version
  AGENTFILE: string;    // Creator
  VERSIA2014: string;   // SIA Version

  // Optional custom key mappings
  KEYa?: string[];      // Custom agent keys
  KEYb?: string[];      // Custom element keys
  KEYc?: string[];      // Custom presentation keys
  KEYd?: string[];      // Custom scale keys
  KEYe?: string[];      // Custom phase keys
  KEYf?: string[];      // Custom status keys
  KEYg?: string[];      // Custom location keys
  KEYh?: string[];      // Custom projection keys
  [key: string]: string | string[] | undefined; // Allow additional custom keys
}

/**
 * Result of SIA validation
 */
export interface SiaValidationResult {
  isValid: boolean;
  errors: SiaValidationError[];
  warnings: SiaValidationWarning[];
}

/**
 * Represents a validation error in SIA processing
 */
export interface SiaValidationError {
  code: SiaErrorCode;
  message: string;
  field?: string;
  value?: string;
}

/**
 * Represents a validation warning in SIA processing
 */
export interface SiaValidationWarning {
  code: SiaWarningCode;
  message: string;
  field?: string;
  value?: string;
}

/**
 * Error codes for SIA validation
 */
export enum SiaErrorCode {
  MISSING_MANDATORY_FIELD = 'MISSING_MANDATORY_FIELD',
  INVALID_PREFIX = 'INVALID_PREFIX',
  INVALID_CONTENT = 'INVALID_CONTENT',
  INVALID_LAYER_FORMAT = 'INVALID_LAYER_FORMAT',
  MISSING_HEADER_FIELD = 'MISSING_HEADER_FIELD',
  INVALID_HIERARCHICAL_CODE = 'INVALID_HIERARCHICAL_CODE',
}

/**
 * Warning codes for SIA validation
 */
export enum SiaWarningCode {
  UNUSED_OPTIONAL_FIELD = 'UNUSED_OPTIONAL_FIELD',
  DEPRECATED_KEY = 'DEPRECATED_KEY',
  NON_STANDARD_PREFIX = 'NON_STANDARD_PREFIX',
  CUSTOM_KEY_WITHOUT_MAPPING = 'CUSTOM_KEY_WITHOUT_MAPPING',
}

/**
 * Constants for SIA layer prefixes
 */
export const SIA_PREFIXES = {
  AGENT: 'a',
  ELEMENT: 'b',
  PRESENTATION: 'c',
  SCALE: 'd',
  PHASE: 'e',
  STATUS: 'f',
  LOCATION: 'g',
  PROJECTION: 'h',
} as const;

/**
 * Type for SIA layer prefix
 */
export type SiaPrefix = typeof SIA_PREFIXES[keyof typeof SIA_PREFIXES];

/**
 * Extended GeoJSON properties with SIA metadata
 */
export interface SiaGeoJsonProperties {
  sia?: {
    agent: string;
    element: string;
    presentation: string;
    scale?: string;
    phase?: string;
    status?: string;
    location?: string;
    projection?: string;
    freeTyping?: string[];
  };
  [key: string]: any;
} 