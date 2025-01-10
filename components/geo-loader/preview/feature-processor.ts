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
    console.debug('[FeatureProcessor] Categorizing features:', {
      total: features.length
    });

    const points: GeoFeature[] = [];
    const lines: GeoFeature[] = [];
    const polygons: GeoFeature[] = [];

    for (const feature of features) {
      if (!feature.geometry) continue;

      switch (feature.geometry.type.toLowerCase()) {
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
      }
    }

    console.debug('[FeatureProcessor] Features categorized:', {
      points: points.length,
      lines: lines.length,
      polygons: polygons.length
    });

    return {
      points: { type: 'FeatureCollection', features: points },
      lines: { type: 'FeatureCollection', features: lines },
      polygons: { type: 'FeatureCollection', features: polygons }
    };
  }

  calculateBounds(collections: PreviewCollections): Required<Bounds> {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const updateBounds = (coords: number[]) => {
      minX = Math.min(minX, coords[0]);
      minY = Math.min(minY, coords[1]);
      maxX = Math.max(maxX, coords[0]);
      maxY = Math.max(maxY, coords[1]);
    };

    const processGeometry = (geometry: any) => {
      if (!geometry) return;

      switch (geometry.type.toLowerCase()) {
        case 'point':
          updateBounds(geometry.coordinates);
          break;
        case 'multipoint':
        case 'linestring':
          geometry.coordinates.forEach(updateBounds);
          break;
        case 'multilinestring':
        case 'polygon':
          geometry.coordinates.flat().forEach(updateBounds);
          break;
        case 'multipolygon':
          geometry.coordinates.flat(2).forEach(updateBounds);
          break;
      }
    };

    [...collections.points.features, 
     ...collections.lines.features, 
     ...collections.polygons.features].forEach(feature => {
      processGeometry(feature.geometry);
    });

    // Add padding
    const dx = (maxX - minX) * this.BOUNDS_PADDING;
    const dy = (maxY - minY) * this.BOUNDS_PADDING;

    return {
      minX: minX - dx,
      minY: minY - dy,
      maxX: maxX + dx,
      maxY: maxY + dy
    };
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
