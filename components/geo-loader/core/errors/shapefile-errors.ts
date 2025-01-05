import { GeoLoaderError } from './types';

/**
 * Error thrown when shapefile header is invalid
 */
export class ShapefileHeaderError extends GeoLoaderError {
  constructor(
    message: string,
    public expectedValue?: unknown,
    public actualValue?: unknown,
    details?: Record<string, unknown>
  ) {
    super(message, 'SHAPEFILE_HEADER_ERROR', {
      expected: expectedValue,
      actual: actualValue,
      ...details,
    });
    this.name = 'ShapefileHeaderError';
  }
}

/**
 * Error thrown when shapefile component files are missing or invalid
 */
export class ShapefileComponentError extends GeoLoaderError {
  constructor(
    message: string,
    public componentType: 'DBF' | 'SHX' | 'PRJ',
    public fileName: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'SHAPEFILE_COMPONENT_ERROR', {
      componentType,
      fileName,
      ...details,
    });
    this.name = 'ShapefileComponentError';
  }
}

/**
 * Error thrown when shapefile geometry is invalid
 */
export class ShapefileGeometryError extends GeoLoaderError {
  constructor(
    message: string,
    public recordNumber: number,
    public geometryType: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'SHAPEFILE_GEOMETRY_ERROR', {
      recordNumber,
      geometryType,
      ...details,
    });
    this.name = 'ShapefileGeometryError';
  }
}

/**
 * Error thrown when shapefile attributes are invalid
 */
export class ShapefileAttributeError extends GeoLoaderError {
  constructor(
    message: string,
    public recordNumber: number,
    public fieldName: string,
    public expectedType: string,
    public actualValue: unknown,
    details?: Record<string, unknown>
  ) {
    super(message, 'SHAPEFILE_ATTRIBUTE_ERROR', {
      recordNumber,
      fieldName,
      expectedType,
      actualValue,
      ...details,
    });
    this.name = 'ShapefileAttributeError';
  }
}

/**
 * Error thrown when shapefile size exceeds memory limits
 */
export class ShapefileSizeError extends GeoLoaderError {
  constructor(
    message: string,
    public fileSize: number,
    public memoryLimit: number,
    details?: Record<string, unknown>
  ) {
    super(message, 'SHAPEFILE_SIZE_ERROR', {
      fileSize,
      memoryLimit,
      ...details,
    });
    this.name = 'ShapefileSizeError';
  }
}
