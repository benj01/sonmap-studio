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

  calculateBounds(collections: PreviewCollections): Required<Bounds> {
    console.debug('[FeatureProcessor] Starting bounds calculation');
    
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let hasValidCoordinates = false;

    const updateBounds = (coords: number[]) => {
      if (!Array.isArray(coords) || coords.length < 2) {
        console.warn('[FeatureProcessor] Invalid coordinates:', coords);
        return;
      }

      const [x, y] = coords;
      if (!isFinite(x) || !isFinite(y)) {
        console.warn('[FeatureProcessor] Non-finite coordinates:', { x, y });
        return;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      hasValidCoordinates = true;

      console.debug('[FeatureProcessor] Updated bounds:', {
        x, y, minX, minY, maxX, maxY
      });
    };

    const processGeometry = (geometry: any) => {
      if (!geometry || !geometry.type) {
        console.warn('[FeatureProcessor] Invalid geometry:', geometry);
        return;
      }

      try {
        if ('coordinates' in geometry) {
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
            default:
              console.warn('[FeatureProcessor] Unknown geometry type:', geometry.type);
          }
        } else if (geometry.type === 'GeometryCollection') {
          geometry.geometries.forEach(processGeometry);
        } else {
          console.warn('[FeatureProcessor] Unsupported geometry type:', geometry.type);
        }
      } catch (error) {
        console.error('[FeatureProcessor] Error processing geometry:', {
          error,
          geometry
        });
      }
    };

    [...collections.points.features, 
     ...collections.lines.features, 
     ...collections.polygons.features].forEach(feature => {
      if (feature?.geometry) {
        processGeometry(feature.geometry);
      }
    });

    // If no valid coordinates were processed, use Switzerland bounds
    if (!hasValidCoordinates) {
      console.warn('[FeatureProcessor] No valid coordinates found, using default bounds');
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

    console.debug('[FeatureProcessor] Final bounds:', bounds);
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
