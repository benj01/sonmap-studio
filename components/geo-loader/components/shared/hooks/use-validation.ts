import { useState, useCallback } from 'react';
import { Feature } from 'geojson';

interface ValidationError {
  code: string;
  message: string;
  feature?: Feature;
  details?: Record<string, unknown>;
}

interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

interface ValidationOptions {
  validateGeometry?: boolean;
  validateProperties?: boolean;
  validateBounds?: boolean;
  requiredProperties?: string[];
  allowedGeometryTypes?: string[];
  bounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

export function useValidation(defaultOptions: ValidationOptions = {}) {
  const [validating, setValidating] = useState(false);
  const [lastResult, setLastResult] = useState<ValidationResult | null>(null);

  const validateFeatures = useCallback(async (
    features: Feature[],
    options: ValidationOptions = {}
  ): Promise<ValidationResult> => {
    try {
      setValidating(true);
      const mergedOptions = { ...defaultOptions, ...options };
      const errors: ValidationError[] = [];
      const warnings: ValidationError[] = [];

      // Validate each feature
      for (const feature of features) {
        // Validate geometry type
        if (mergedOptions.allowedGeometryTypes?.length) {
          if (!mergedOptions.allowedGeometryTypes.includes(feature.geometry.type)) {
            errors.push({
              code: 'INVALID_GEOMETRY_TYPE',
              message: `Invalid geometry type: ${feature.geometry.type}`,
              feature,
              details: {
                allowed: mergedOptions.allowedGeometryTypes,
                found: feature.geometry.type
              }
            });
          }
        }

        // Validate geometry
        if (mergedOptions.validateGeometry) {
          const geometryErrors = validateGeometry(feature);
          errors.push(...geometryErrors);
        }

        // Validate properties
        if (mergedOptions.validateProperties) {
          const propertyErrors = validateProperties(
            feature,
            mergedOptions.requiredProperties
          );
          errors.push(...propertyErrors);
        }

        // Validate bounds
        if (mergedOptions.validateBounds && mergedOptions.bounds) {
          const boundsErrors = validateBounds(feature, mergedOptions.bounds);
          errors.push(...boundsErrors);
        }
      }

      const result = {
        isValid: errors.length === 0,
        errors,
        warnings
      };

      setLastResult(result);
      return result;
    } finally {
      setValidating(false);
    }
  }, [defaultOptions]);

  return {
    validating,
    lastResult,
    validateFeatures
  };
}

function validateGeometry(feature: Feature): ValidationError[] {
  const errors: ValidationError[] = [];
  const { type, coordinates } = feature.geometry;

  // Check for empty or invalid coordinates
  if (!coordinates || !Array.isArray(coordinates)) {
    errors.push({
      code: 'INVALID_COORDINATES',
      message: 'Invalid or missing coordinates',
      feature
    });
    return errors;
  }

  // Validate based on geometry type
  switch (type) {
    case 'Point':
      if (!isValidPoint(coordinates)) {
        errors.push({
          code: 'INVALID_POINT',
          message: 'Invalid point coordinates',
          feature
        });
      }
      break;

    case 'LineString':
      if (!isValidLineString(coordinates)) {
        errors.push({
          code: 'INVALID_LINESTRING',
          message: 'Invalid line coordinates',
          feature
        });
      }
      break;

    case 'Polygon':
      if (!isValidPolygon(coordinates)) {
        errors.push({
          code: 'INVALID_POLYGON',
          message: 'Invalid polygon coordinates',
          feature
        });
      }
      break;

    // Add other geometry types as needed
  }

  return errors;
}

function validateProperties(
  feature: Feature,
  requiredProperties: string[] = []
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!feature.properties) {
    if (requiredProperties.length > 0) {
      errors.push({
        code: 'MISSING_PROPERTIES',
        message: 'Feature is missing properties',
        feature
      });
    }
    return errors;
  }

  for (const prop of requiredProperties) {
    if (!(prop in feature.properties)) {
      errors.push({
        code: 'MISSING_REQUIRED_PROPERTY',
        message: `Missing required property: ${prop}`,
        feature,
        details: { property: prop }
      });
    }
  }

  return errors;
}

function validateBounds(
  feature: Feature,
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
): ValidationError[] {
  const errors: ValidationError[] = [];
  const coords = getAllCoordinates(feature);

  for (const [x, y] of coords) {
    if (
      x < bounds.minX ||
      x > bounds.maxX ||
      y < bounds.minY ||
      y > bounds.maxY
    ) {
      errors.push({
        code: 'OUT_OF_BOUNDS',
        message: 'Feature coordinates are outside allowed bounds',
        feature,
        details: {
          coordinates: [x, y],
          bounds
        }
      });
      break; // One error per feature is enough
    }
  }

  return errors;
}

// Helper functions
function isValidPoint(coords: any): boolean {
  return Array.isArray(coords) && coords.length === 2 &&
    typeof coords[0] === 'number' && typeof coords[1] === 'number';
}

function isValidLineString(coords: any): boolean {
  return Array.isArray(coords) && coords.length >= 2 &&
    coords.every(isValidPoint);
}

function isValidPolygon(coords: any): boolean {
  return Array.isArray(coords) && coords.length > 0 &&
    coords.every(ring =>
      Array.isArray(ring) && ring.length >= 4 &&
      ring.every(isValidPoint) &&
      JSON.stringify(ring[0]) === JSON.stringify(ring[ring.length - 1])
    );
}

function getAllCoordinates(feature: Feature): number[][] {
  const coords: number[][] = [];
  
  switch (feature.geometry.type) {
    case 'Point':
      coords.push(feature.geometry.coordinates);
      break;
    case 'LineString':
    case 'MultiPoint':
      coords.push(...feature.geometry.coordinates);
      break;
    case 'Polygon':
    case 'MultiLineString':
      feature.geometry.coordinates.forEach(line => {
        coords.push(...line);
      });
      break;
    case 'MultiPolygon':
      feature.geometry.coordinates.forEach(polygon => {
        polygon.forEach(line => {
          coords.push(...line);
        });
      });
      break;
  }

  return coords;
}
