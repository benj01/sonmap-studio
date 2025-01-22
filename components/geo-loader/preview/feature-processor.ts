import { Point } from 'geojson';
import { GeoFeature } from '../../../types/geo';
import { Bounds } from '../core/feature-manager/bounds';
import { PreviewCollections, SamplingStrategy } from './types';

export class FeatureProcessor {
  private readonly BOUNDS_PADDING = 0.1; // 10% padding

  createSamplingStrategy(maxFeatures: number, smartSampling: boolean): SamplingStrategy {
    if (!smartSampling) {
      return {
        shouldIncludeFeature: () => true
      };
    }

    // Enhanced sampling strategy for large files
    const gridSize = Math.ceil(Math.sqrt(maxFeatures));
    const grid = new Map<string, number>();
    let totalFeatures = 0;

    return {
      shouldIncludeFeature: (feature: GeoFeature) => {
        if (totalFeatures >= maxFeatures) {
          return false;
        }

        // Always include non-point features but count them
        if (feature.geometry.type !== 'Point') {
          totalFeatures++;
          return true;
        }

        // Grid-based sampling for points
        const [x, y] = (feature.geometry as Point).coordinates;
        const gridX = Math.floor(x / gridSize);
        const gridY = Math.floor(y / gridSize);
        const key = `${gridX}:${gridY}`;

        const count = grid.get(key) || 0;
        const cellLimit = Math.max(1, Math.floor(maxFeatures / (gridSize * gridSize)));
        
        if (count >= cellLimit) {
          return false;
        }

        grid.set(key, count + 1);
        totalFeatures++;
        return true;
      }
    };
  }

  categorizeFeatures(features: GeoFeature[]): PreviewCollections {
    console.debug('[FeatureProcessor] Starting feature categorization:', {
      totalFeatures: features.length,
      firstFeature: features[0] // Log first feature for debugging
    });

    const points: GeoFeature[] = [];
    const lines: GeoFeature[] = [];
    const polygons: GeoFeature[] = [];

    for (const feature of features) {
      if (!feature.geometry) {
        console.warn('[FeatureProcessor] Feature missing geometry:', feature);
        continue;
      }

      // Add better type checking and logging
      const geometryType = feature.geometry.type.toLowerCase();
      const coordinates = 'coordinates' in feature.geometry ? feature.geometry.coordinates : null;
      
      console.debug('[FeatureProcessor] Processing feature:', {
        type: geometryType,
        coordinates,
        properties: feature.properties
      });

      switch (geometryType) {
        case 'point':
        case 'multipoint':
          points.push(feature);
          break;
        case 'linestring':
        case 'multilinestring':
          lines.push(feature);
          break;
        case 'polygon':
        case 'multipolygon':
          polygons.push(feature);
          break;
        default:
          console.warn('[FeatureProcessor] Unknown geometry type:', geometryType);
      }
    }

    const result: PreviewCollections = {
      points: { type: 'FeatureCollection' as const, features: points },
      lines: { type: 'FeatureCollection' as const, features: lines },
      polygons: { type: 'FeatureCollection' as const, features: polygons }
    };

    console.debug('[FeatureProcessor] Categorization complete:', {
      points: points.length,
      lines: lines.length,
      polygons: polygons.length,
      sampleFeatures: {
        point: points[0],
        line: lines[0],
        polygon: polygons[0]
      }
    });

    return result;
  }

  /**
   * Calculate bounds for a collection of features
   */
  public calculateBounds(collections: PreviewCollections): Bounds {
    console.debug('[FeatureProcessor] Calculating bounds for collections');

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let hasValidBounds = false;

    const processCoordinate = (coord: number[]): void => {
      if (coord.length < 2) return;
      
      const x = coord[0];
      const y = coord[1];
      
      if (isFinite(x) && isFinite(y)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        hasValidBounds = true;
      }
    };

    const processGeometry = (geometry: any): void => {
      if (!geometry || !geometry.coordinates) return;

      const coords = geometry.coordinates;
      if (!Array.isArray(coords)) return;

      // Handle different geometry types
      switch (geometry.type) {
        case 'Point':
          processCoordinate(coords);
          break;
        case 'MultiPoint':
        case 'LineString':
          coords.forEach(processCoordinate);
          break;
        case 'MultiLineString':
        case 'Polygon':
          coords.forEach(line => line.forEach(processCoordinate));
          break;
        case 'MultiPolygon':
          coords.forEach(poly => poly.forEach(ring => ring.forEach(processCoordinate)));
          break;
      }
    };

    // Process all collections
    Object.values(collections).forEach(collection => {
      if (!collection || !Array.isArray(collection.features)) return;
      
      collection.features.forEach(feature => {
        if (!feature || !feature.geometry) return;
        processGeometry(feature.geometry);
      });
    });

    console.debug('[FeatureProcessor] Calculated bounds:', {
      hasValidBounds,
      bounds: { minX, minY, maxX, maxY }
    });

    // If no valid bounds found, use Swiss bounds
    if (!hasValidBounds) {
      console.warn('[FeatureProcessor] No valid bounds found, using Swiss bounds');
      return {
        minX: 2485000,  // Min X for Switzerland in LV95
        minY: 1075000,  // Min Y for Switzerland in LV95
        maxX: 2834000,  // Max X for Switzerland in LV95
        maxY: 1299000   // Max Y for Switzerland in LV95
      };
    }

    // Add padding
    const dx = (maxX - minX) * this.BOUNDS_PADDING;
    const dy = (maxY - minY) * this.BOUNDS_PADDING;

    const bounds = {
      minX: minX - dx,
      minY: minY - dy,
      maxX: maxX + dx,
      maxY: maxY + dy
    };

    console.debug('[FeatureProcessor] Final bounds with padding:', bounds);
    return bounds;
  }

  validateBounds(bounds: Bounds | null): Required<Bounds> | null {
    if (!bounds) return null;

    const { minX, minY, maxX, maxY } = bounds;
    
    if (!isFinite(minX) || !isFinite(minY) || 
        !isFinite(maxX) || !isFinite(maxY) ||
        minX === maxX || minY === maxY) {
      return null;
    }

    return bounds as Required<Bounds>;
  }
}
