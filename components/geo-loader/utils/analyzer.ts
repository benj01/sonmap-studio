import { AnalyzeResult, GeoFeature, GeoFeatureCollection } from '../../../types/geo';
import { suggestCoordinateSystem } from './coordinate-utils';

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  minZ?: number;
  maxZ?: number;
  minM?: number;
  maxM?: number;
}

export class GeoAnalyzer {
  static suggestCoordinateSystem(samplePoints: Point[]): string {
    return suggestCoordinateSystem(samplePoints);
  }

  static calculateBounds(points: Point[]): Bounds {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    points.forEach(point => {
      if (isFinite(point.x) && isFinite(point.y)) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    });

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return { minX: -180, minY: -90, maxX: 180, maxY: 90 };
    }

    return { minX, minY, maxX, maxY };
  }

  static generatePreview(features: GeoFeature[]): GeoFeatureCollection {
    // Take a representative sample of each geometry type
    const pointFeatures = features.filter(f => f.geometry.type === 'Point');
    const lineFeatures = features.filter(f => f.geometry.type === 'LineString');
    const polygonFeatures = features.filter(f => f.geometry.type === 'Polygon');

    const selectedFeatures = [
      ...pointFeatures.slice(0, 500),
      ...lineFeatures.slice(0, 250),
      ...polygonFeatures.slice(0, 250)
    ];

    return {
      type: 'FeatureCollection',
      features: selectedFeatures
    };
  }

  static createAnalyzeResult(
    features: GeoFeature[],
    bounds: Bounds,
    layers: string[],
    coordinateSystem: string,
    fieldInfo?: any[]
  ): AnalyzeResult {
    return {
      layers,
      bounds,
      coordinateSystem,
      preview: this.generatePreview(features),
      ...(fieldInfo && { fieldInfo })
    };
  }
}
