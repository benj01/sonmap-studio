// components/geo-loader/converters/to-geojson.ts

import { 
    Feature, 
    FeatureCollection, 
    Geometry, 
    Point, 
    LineString, 
    Polygon, 
    MultiPoint, 
    MultiLineString, 
    MultiPolygon,
    Position 
  } from 'geojson';
  
  interface ConversionOptions {
    // Control whether to include z-coordinates when available
    includeZ?: boolean;
    // Control whether to simplify geometries (e.g., for preview)
    simplify?: boolean;
    // Tolerance for simplification (higher = more simplification)
    simplifyTolerance?: number;
    // Additional properties to include in all features
    defaultProperties?: Record<string, any>;
    // Whether to validate geometries before conversion
    validate?: boolean;
  }
  
  class GeoJsonConverter {
    private options: Required<ConversionOptions>;
  
    constructor(options: ConversionOptions = {}) {
      this.options = {
        includeZ: true,
        simplify: false,
        simplifyTolerance: 0.1,
        defaultProperties: {},
        validate: true,
        ...options
      };
    }
  
    /**
     * Main conversion method that handles any supported input type
     */
    convert(
      input: any, 
      type: string, 
      properties: Record<string, any> = {}
    ): Feature | null {
      try {
        const geometry = this.createGeometry(input, type);
        if (!geometry) return null;
  
        if (this.options.validate && !this.validateGeometry(geometry)) {
          return null;
        }
  
        return {
          type: 'Feature',
          geometry: this.options.simplify ? this.simplifyGeometry(geometry) : geometry,
          properties: {
            ...this.options.defaultProperties,
            ...properties,
            originalType: type
          }
        };
      } catch (error) {
        console.warn('GeoJSON conversion error:', error);
        return null;
      }
    }
  
    /**
     * Convert a collection of features
     */
    convertCollection(
      inputs: any[], 
      type: string, 
      properties: Record<string, any> = {}
    ): FeatureCollection {
      const features = inputs
        .map(input => this.convert(input, type, properties))
        .filter((feature): feature is Feature => feature !== null);
  
      return {
        type: 'FeatureCollection',
        features
      };
    }
  
    private createGeometry(input: any, type: string): Geometry | null {
      switch (type.toUpperCase()) {
        case 'POINT':
          return this.createPoint(input);
        case 'MULTIPOINT':
          return this.createMultiPoint(input);
        case 'LINE':
        case 'LINESTRING':
          return this.createLineString(input);
        case 'MULTILINESTRING':
          return this.createMultiLineString(input);
        case 'POLYGON':
          return this.createPolygon(input);
        case 'MULTIPOLYGON':
          return this.createMultiPolygon(input);
        default:
          console.warn(`Unsupported geometry type: ${type}`);
          return null;
      }
    }
  
    private createPoint(input: any): Point | null {
      if (!input || typeof input.x !== 'number' || typeof input.y !== 'number') {
        return null;
      }
  
      const coordinates: Position = this.options.includeZ && typeof input.z === 'number' 
        ? [input.x, input.y, input.z]
        : [input.x, input.y];
  
      return {
        type: 'Point',
        coordinates
      };
    }
  
    private createMultiPoint(input: any[]): MultiPoint | null {
      if (!Array.isArray(input)) return null;
  
      const coordinates = input
        .map(point => {
          const p = this.createPoint(point);
          return p ? p.coordinates : null;
        })
        .filter((coords): coords is Position => coords !== null);
  
      return coordinates.length > 0 ? {
        type: 'MultiPoint',
        coordinates
      } : null;
    }
  
    private createLineString(input: any): LineString | null {
      if (!Array.isArray(input)) return null;
  
      const coordinates = input
        .map(point => {
          const p = this.createPoint(point);
          return p ? p.coordinates : null;
        })
        .filter((coords): coords is Position => coords !== null);
  
      return coordinates.length >= 2 ? {
        type: 'LineString',
        coordinates
      } : null;
    }
  
    private createMultiLineString(input: any[]): MultiLineString | null {
      if (!Array.isArray(input)) return null;
  
      const coordinates = input
        .map(line => {
          const l = this.createLineString(line);
          return l ? l.coordinates : null;
        })
        .filter((coords): coords is Position[] => coords !== null);
  
      return coordinates.length > 0 ? {
        type: 'MultiLineString',
        coordinates
      } : null;
    }
  
    private createPolygon(input: any[]): Polygon | null {
      if (!Array.isArray(input)) return null;
  
      const coordinates = input
        .map(ring => {
          const l = this.createLineString(ring);
          return l ? l.coordinates : null;
        })
        .filter((coords): coords is Position[] => {
          if (!coords) return false;
          // Ensure ring is closed
          const first = coords[0];
          const last = coords[coords.length - 1];
          if (!this.coordinatesEqual(first, last)) {
            coords.push([...first]);
          }
          return coords.length >= 4;
        });
  
      return coordinates.length > 0 ? {
        type: 'Polygon',
        coordinates
      } : null;
    }
  
    private createMultiPolygon(input: any[]): MultiPolygon | null {
      if (!Array.isArray(input)) return null;
  
      const coordinates = input
        .map(poly => {
          const p = this.createPolygon(poly);
          return p ? p.coordinates : null;
        })
        .filter((coords): coords is Position[][] => coords !== null);
  
      return coordinates.length > 0 ? {
        type: 'MultiPolygon',
        coordinates
      } : null;
    }
  
    private validateGeometry(geometry: Geometry): boolean {
      try {
        switch (geometry.type) {
          case 'Point':
            return this.validateCoordinates(geometry.coordinates);
          case 'MultiPoint':
            return geometry.coordinates.every(coord => this.validateCoordinates(coord));
          case 'LineString':
            return geometry.coordinates.length >= 2 &&
                   geometry.coordinates.every(coord => this.validateCoordinates(coord));
          case 'MultiLineString':
            return geometry.coordinates.every(line => 
              line.length >= 2 && line.every(coord => this.validateCoordinates(coord))
            );
          case 'Polygon':
            return this.validatePolygon(geometry.coordinates);
          case 'MultiPolygon':
            return geometry.coordinates.every(poly => this.validatePolygon(poly));
          default:
            return false;
        }
      } catch (error) {
        return false;
      }
    }
  
    private validateCoordinates(coord: Position): boolean {
      return Array.isArray(coord) &&
             coord.length >= 2 &&
             coord.every(n => typeof n === 'number' && isFinite(n));
    }
  
    private validatePolygon(coordinates: Position[][]): boolean {
      return coordinates.every(ring => 
        ring.length >= 4 &&
        ring.every(coord => this.validateCoordinates(coord)) &&
        this.coordinatesEqual(ring[0], ring[ring.length - 1])
      );
    }
  
    private coordinatesEqual(a: Position, b: Position): boolean {
      return a.length === b.length && a.every((val, i) => val === b[i]);
    }
  
    private simplifyGeometry(geometry: Geometry): Geometry {
      if (!this.options.simplify) return geometry;
  
      // Implementation of geometry simplification could go here
      // For now, we'll just return the original geometry
      return geometry;
    }
  }
  
  export function createGeoJsonConverter(options?: ConversionOptions): GeoJsonConverter {
    return new GeoJsonConverter(options);
  }
  
  // Export utility functions for common conversions
  export const toGeoJson = {
    point: (x: number, y: number, z?: number): Point => ({
      type: 'Point',
      coordinates: z !== undefined ? [x, y, z] : [x, y]
    }),
  
    lineString: (coordinates: Position[]): LineString => ({
      type: 'LineString',
      coordinates
    }),
  
    polygon: (rings: Position[][]): Polygon => ({
      type: 'Polygon',
      coordinates: rings
    }),
  
    feature: (geometry: Geometry, properties: Record<string, any> = {}): Feature => ({
      type: 'Feature',
      geometry,
      properties
    }),
  
    featureCollection: (features: Feature[]): FeatureCollection => ({
      type: 'FeatureCollection',
      features
    })
  };