import { GeoFeature } from '@/types/geo';
import { Geometry } from 'geojson';

export interface ProcessingContext {
  sourceSrid?: number;
  targetSrid?: number;
  validateGeometry?: boolean;
  repairGeometry?: boolean;
  propertyMapping?: Record<string, string>;
  propertyValidation?: Record<string, PropertyValidator>;
}

export interface ProcessingResult {
  feature: GeoFeature;
  isValid: boolean;
  wasRepaired: boolean;
  warnings: string[];
  errors: string[];
}

export interface PropertyValidator {
  type: 'string' | 'number' | 'boolean' | 'date';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  enum?: Array<string | number | boolean | null>;
}

export interface FeatureProcessor {
  process(feature: GeoFeature, context: ProcessingContext): Promise<ProcessingResult>;
}

export interface GeometryValidationResult {
  isValid: boolean;
  reason?: string;
  repairedGeometry?: Geometry;
}

export interface PropertyValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  transformedProperties?: Record<string, unknown>;
} 