import { Feature, Geometry, Position } from 'geojson';
import { ShapeType } from '../types';
import { ValidationError } from '../../../../errors/types';

export class GeometryConverter {
  /**
   * Convert shapefile record to GeoJSON feature
   */
  recordToFeature(record: {
    header: { recordNumber: number; contentLength: number };
    shapeType: ShapeType;
    data: Record<string, unknown>;
    attributes: Record<string, unknown>;
  }): Feature {
    const geometry = record.data as unknown as Geometry;
    return {
      type: 'Feature',
      geometry,
      properties: record.attributes || { recordNumber: record.header.recordNumber }
    };
  }

  /**
   * Check if a ring is clockwise
   */
  isClockwise(ring: Position[]): boolean {
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      sum += (x2 - x1) * (y2 + y1);
    }
    return sum > 0;
  }

  /**
   * Convert point data to GeoJSON geometry
   */
  convertPoint(x: number, y: number): Geometry {
    return {
      type: 'Point',
      coordinates: [x, y]
    };
  }

  /**
   * Convert multipoint data to GeoJSON geometry
   */
  convertMultiPoint(points: Position[]): Geometry {
    return {
      type: 'MultiPoint',
      coordinates: points
    };
  }

  /**
   * Convert polyline data to GeoJSON geometry
   */
  convertPolyline(coordinates: Position[][]): Geometry {
    if (coordinates.length === 0) {
      return {
        type: 'LineString',
        coordinates: []
      };
    } else if (coordinates.length === 1) {
      return {
        type: 'LineString',
        coordinates: coordinates[0]
      };
    } else {
      return {
        type: 'MultiLineString',
        coordinates: coordinates
      };
    }
  }

  /**
   * Convert polygon data to GeoJSON geometry
   */
  convertPolygon(rings: Position[][]): Geometry {
    // Organize rings into polygons
    const polygons: Position[][][] = [];
    let currentPolygon: Position[][] = [];
    
    for (const ring of rings) {
      if (this.isClockwise(ring)) {
        if (currentPolygon.length > 0) {
          polygons.push(currentPolygon);
        }
        currentPolygon = [ring];
      } else {
        currentPolygon.push(ring);
      }
    }
    
    if (currentPolygon.length > 0) {
      polygons.push(currentPolygon);
    }
    
    if (polygons.length === 1) {
      return {
        type: 'Polygon',
        coordinates: polygons[0]
      };
    } else {
      return {
        type: 'MultiPolygon',
        coordinates: polygons
      };
    }
  }

  /**
   * Get bounds for a specific feature
   */
  getFeatureBounds(feature: Feature): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    const defaultBounds = {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0
    };

    if (!feature.geometry) {
      return defaultBounds;
    }

    const bounds = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity
    };

    // Try to use bbox if available
    if (feature.bbox && feature.bbox.length >= 4) {
      bounds.minX = feature.bbox[0];
      bounds.minY = feature.bbox[1];
      bounds.maxX = feature.bbox[2];
      bounds.maxY = feature.bbox[3];
      return bounds;
    }

    // Calculate from coordinates
    switch (feature.geometry.type) {
      case 'Point': {
        const coords = feature.geometry.coordinates as [number, number];
        bounds.minX = bounds.maxX = coords[0];
        bounds.minY = bounds.maxY = coords[1];
        break;
      }

      case 'LineString': {
        const coords = feature.geometry.coordinates as [number, number][];
        coords.forEach(([x, y]) => {
          bounds.minX = Math.min(bounds.minX, x);
          bounds.minY = Math.min(bounds.minY, y);
          bounds.maxX = Math.max(bounds.maxX, x);
          bounds.maxY = Math.max(bounds.maxY, y);
        });
        break;
      }

      case 'Polygon': {
        const coords = feature.geometry.coordinates as [number, number][][];
        coords[0].forEach(([x, y]) => {
          bounds.minX = Math.min(bounds.minX, x);
          bounds.minY = Math.min(bounds.minY, y);
          bounds.maxX = Math.max(bounds.maxX, x);
          bounds.maxY = Math.max(bounds.maxY, y);
        });
        break;
      }

      case 'MultiPoint': {
        const coords = feature.geometry.coordinates as [number, number][];
        coords.forEach(([x, y]) => {
          bounds.minX = Math.min(bounds.minX, x);
          bounds.minY = Math.min(bounds.minY, y);
          bounds.maxX = Math.max(bounds.maxX, x);
          bounds.maxY = Math.max(bounds.maxY, y);
        });
        break;
      }

      case 'MultiLineString': {
        const coords = feature.geometry.coordinates as [number, number][][];
        coords.forEach(line => {
          line.forEach(([x, y]) => {
            bounds.minX = Math.min(bounds.minX, x);
            bounds.minY = Math.min(bounds.minY, y);
            bounds.maxX = Math.max(bounds.maxX, x);
            bounds.maxY = Math.max(bounds.maxY, y);
          });
        });
        break;
      }

      case 'MultiPolygon': {
        const coords = feature.geometry.coordinates as [number, number][][][];
        coords.forEach(polygon => {
          polygon[0].forEach(([x, y]) => {
            bounds.minX = Math.min(bounds.minX, x);
            bounds.minY = Math.min(bounds.minY, y);
            bounds.maxX = Math.max(bounds.maxX, x);
            bounds.maxY = Math.max(bounds.maxY, y);
          });
        });
        break;
      }

      case 'GeometryCollection': {
        feature.geometry.geometries.forEach(geom => {
          const geomBounds = this.getFeatureBounds({
            type: 'Feature',
            geometry: geom,
            properties: null
          });
          bounds.minX = Math.min(bounds.minX, geomBounds.minX);
          bounds.minY = Math.min(bounds.minY, geomBounds.minY);
          bounds.maxX = Math.max(bounds.maxX, geomBounds.maxX);
          bounds.maxY = Math.max(bounds.maxY, geomBounds.maxY);
        });
        break;
      }
    }

    return isFinite(bounds.minX) ? bounds : defaultBounds;
  }
}
