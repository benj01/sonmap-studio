import { Feature, GeoJsonProperties, Point } from 'geojson';
import { CoordinateSystem } from '../types/coordinates';
import { coordinateSystemManager } from '../core/coordinate-systems/coordinate-system-manager';
import { LogManager } from '../core/logging/log-manager';
import { COORDINATE_SYSTEMS } from '../types/coordinates';
import { SamplingStrategy } from './types/preview';
import { GeoFeature } from '../../../types/geo';
import { Bounds } from '../core/feature-manager/bounds';
import { PreviewCollections } from './types/preview';

export class FeatureProcessor {
  private readonly BOUNDS_PADDING = 0.1; // 10% padding
  private readonly coordinateSystemManager = coordinateSystemManager;
  private readonly logger = LogManager.getInstance();

  // Add coordinate system tracking
  private currentCoordinateSystem: CoordinateSystem = COORDINATE_SYSTEMS.SWISS_LV95;
  private transformedCoordinateSystem: CoordinateSystem | null = null;

  createSamplingStrategy(maxFeatures: number, smartSampling: boolean): SamplingStrategy {
    if (!smartSampling) {
      return {
        shouldIncludeFeature: () => true,
        reset: () => {} // Add empty reset for non-smart sampling
      };
    }

    // Enhanced sampling strategy for large files
    const gridSize = Math.ceil(Math.sqrt(maxFeatures));
    const grid = new Map<string, number>();
    let totalFeatures = 0;

    return {
      shouldIncludeFeature: (feature: Feature<any, GeoJsonProperties>) => {
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
      },
      reset: () => {
        grid.clear();
        totalFeatures = 0;
      }
    };
  }

  public categorizeFeatures(features: GeoFeature[]): PreviewCollections {
    this.logger.debug('FeatureProcessor', 'Starting feature categorization', {
      totalFeatures: features.length,
      firstFeature: features[0],
      coordinateSystems: features.map(f => ({
        fromSystem: f.properties?._fromSystem,
        toSystem: f.properties?._toSystem,
        transformed: f.properties?._transformedCoordinates
      }))
    });

    const points: GeoFeature[] = [];
    const lines: GeoFeature[] = [];
    const polygons: GeoFeature[] = [];

    for (const feature of features) {
      if (!feature.geometry) {
        this.logger.warn('FeatureProcessor', 'Feature missing geometry', { feature });
        continue;
      }

      // Use the appropriate geometry based on transformation status
      const effectiveGeometry = feature.properties?._transformedCoordinates
        ? feature.geometry
        : (feature.properties?._originalGeometry || feature.geometry);

      const geometryType = effectiveGeometry.type.toLowerCase();
      
      this.logger.debug('FeatureProcessor', 'Processing feature', {
        type: geometryType,
        coordinates: 'coordinates' in effectiveGeometry ? effectiveGeometry.coordinates : null,
        transformationInfo: {
          fromSystem: feature.properties?._fromSystem,
          toSystem: feature.properties?._toSystem,
          transformed: feature.properties?._transformedCoordinates
        },
        properties: feature.properties
      });

      // Create processed feature with effective geometry
      const processedFeature: GeoFeature = {
        ...feature,
        geometry: effectiveGeometry,
        properties: {
          ...feature.properties,
          layer: feature.properties?.layer || 'shapes'
        }
      };

      switch (geometryType) {
        case 'point':
        case 'multipoint':
          points.push(processedFeature);
          break;
        case 'linestring':
        case 'multilinestring':
          lines.push(processedFeature);
          break;
        case 'polygon':
        case 'multipolygon':
          polygons.push(processedFeature);
          break;
        default:
          this.logger.warn('FeatureProcessor', 'Unknown geometry type', { geometryType });
      }
    }

    const result: PreviewCollections = {
      points: { type: 'FeatureCollection' as const, features: points },
      lines: { type: 'FeatureCollection' as const, features: lines },
      polygons: { type: 'FeatureCollection' as const, features: polygons }
    };

    this.logger.debug('FeatureProcessor', 'Categorization complete', {
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
   * Set the current coordinate system and handle transformations
   */
  public async setCoordinateSystem(system: CoordinateSystem, transform: boolean = true): Promise<void> {
    const previousSystem = this.currentCoordinateSystem;
    
    this.logger.debug('FeatureProcessor', 'Setting coordinate system', {
      from: previousSystem,
      to: system,
      transform
    });

    this.currentCoordinateSystem = system;
    
    // If we're transforming coordinates, store the original system
    if (transform) {
      this.transformedCoordinateSystem = previousSystem;
    } else {
      this.transformedCoordinateSystem = null;
    }
  }

  /**
   * Get the effective coordinate system for validation
   */
  private getEffectiveSystem(): CoordinateSystem {
    // If coordinates have been transformed, use the current system for validation
    // since the coordinates are now in that system
    return this.currentCoordinateSystem;
  }

  /**
   * Calculate bounds for a collection of features
   */
  public calculateBounds(collections: PreviewCollections): Bounds {
    // Check if features are already transformed
    const firstFeature = collections.points?.features?.[0] || 
                        collections.lines?.features?.[0] || 
                        collections.polygons?.features?.[0];
    
    if (firstFeature?.properties?._transformedCoordinates) {
      this.logger.debug('FeatureProcessor', 'Detected transformed features', {
        fromSystem: firstFeature.properties._fromSystem,
        toSystem: firstFeature.properties._toSystem,
        currentSystem: this.currentCoordinateSystem
      });
      
      // Update our coordinate system tracking
      if (firstFeature.properties._fromSystem && firstFeature.properties._toSystem) {
        this.transformedCoordinateSystem = firstFeature.properties._fromSystem as CoordinateSystem;
        this.currentCoordinateSystem = firstFeature.properties._toSystem as CoordinateSystem;
        
        this.logger.debug('FeatureProcessor', 'Updated coordinate systems', {
          transformedFrom: this.transformedCoordinateSystem,
          currentSystem: this.currentCoordinateSystem,
          effectiveSystem: this.getEffectiveSystem()
        });
      }
    }

    const effectiveSystem = this.getEffectiveSystem();
    
    this.logger.debug('FeatureProcessor', 'Calculating bounds for collections', {
      collections,
      pointCount: collections.points?.features?.length ?? 0,
      lineCount: collections.lines?.features?.length ?? 0,
      polygonCount: collections.polygons?.features?.length ?? 0,
      currentSystem: this.currentCoordinateSystem,
      transformedFrom: this.transformedCoordinateSystem,
      effectiveSystem,
      hasTransformedFeatures: !!firstFeature?.properties?._transformedCoordinates
    });

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let hasValidBounds = false;

    const processCoordinate = (coord: number[]): void => {
      if (!Array.isArray(coord) || coord.length < 2) {
        this.logger.warn('FeatureProcessor', 'Invalid coordinate', { coord });
        return;
      }
      
      const x = coord[0];
      const y = coord[1];
      
      if (!isFinite(x) || !isFinite(y)) {
        this.logger.warn('FeatureProcessor', 'Non-finite coordinate values', { x, y });
        return;
      }

      // Check coordinate ranges based on effective coordinate system
      if (effectiveSystem === COORDINATE_SYSTEMS.SWISS_LV95) {
        if (x < 2000000 || x > 3000000 || y < 1000000 || y > 1400000) {
          this.logger.warn('FeatureProcessor', 'Coordinate out of range for Swiss LV95', {
            x, y,
            allowedRanges: {
              x: { min: 2000000, max: 3000000 },
              y: { min: 1000000, max: 1400000 }
            },
            effectiveSystem,
            transformedFrom: this.transformedCoordinateSystem
          });
          return;
        }
      } else if (effectiveSystem === COORDINATE_SYSTEMS.WGS84) {
        if (x < -180 || x > 180 || y < -90 || y > 90) {
          this.logger.warn('FeatureProcessor', 'Coordinate out of range for WGS84', {
            x, y,
            allowedRanges: {
              x: { min: -180, max: 180 },
              y: { min: -90, max: 90 }
            },
            effectiveSystem,
            transformedFrom: this.transformedCoordinateSystem
          });
          return;
        }
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      hasValidBounds = true;

      this.logger.debug('FeatureProcessor', 'Processed coordinate', {
        x, y,
        currentBounds: { minX, minY, maxX, maxY },
        effectiveSystem,
        transformedFrom: this.transformedCoordinateSystem
      });
    };

    const processGeometry = (geometry: any): void => {
      if (!geometry || !geometry.coordinates) {
        this.logger.warn('FeatureProcessor', 'Invalid geometry', { geometry });
        return;
      }

      const coords = geometry.coordinates;
      if (!Array.isArray(coords)) {
        this.logger.warn('FeatureProcessor', 'Coordinates not an array', { coords });
        return;
      }

      this.logger.debug('FeatureProcessor', 'Processing geometry', {
        type: geometry.type,
        coordsLength: coords.length,
        sample: Array.isArray(coords[0]) ? coords[0] : coords
      });

      // Handle different geometry types
      try {
        switch (geometry.type) {
          case 'Point':
            processCoordinate(coords);
            break;
          case 'MultiPoint':
          case 'LineString':
            coords.forEach((coord, index) => {
              try {
                processCoordinate(coord);
              } catch (error) {
                this.logger.warn('FeatureProcessor', 'Error processing coordinate at index', {
                  error: error instanceof Error ? error.message : String(error),
                  coordinate: coord
                });
              }
            });
            break;
          case 'MultiLineString':
          case 'Polygon':
            coords.forEach((line, lineIndex) => {
              if (!Array.isArray(line)) {
                this.logger.warn('FeatureProcessor', 'Invalid line at index', { lineIndex });
                return;
              }
              line.forEach((coord, coordIndex) => {
                try {
                  processCoordinate(coord);
                } catch (error) {
                  this.logger.warn('FeatureProcessor', 'Error processing coordinate at line', {
                    lineIndex, coordIndex
                  });
                }
              });
            });
            break;
          case 'MultiPolygon':
            coords.forEach((poly, polyIndex) => {
              if (!Array.isArray(poly)) {
                this.logger.warn('FeatureProcessor', 'Invalid polygon at index', { polyIndex });
                return;
              }
              poly.forEach((ring, ringIndex) => {
                if (!Array.isArray(ring)) {
                  this.logger.warn('FeatureProcessor', 'Invalid ring at polygon', { polyIndex, ringIndex });
                  return;
                }
                ring.forEach((coord, coordIndex) => {
                  try {
                    processCoordinate(coord);
                  } catch (error) {
                    this.logger.warn('FeatureProcessor', 'Error processing coordinate at polygon', {
                      polyIndex, ringIndex, coordIndex
                    });
                  }
                });
              });
            });
            break;
          default:
            this.logger.warn('FeatureProcessor', 'Unknown geometry type', { geometryType: geometry.type });
        }
      } catch (error) {
        this.logger.error('FeatureProcessor', 'Error processing geometry', {
          error: error instanceof Error ? error.message : String(error),
          geometry
        });
      }
    };

    // Process all collections
    Object.values(collections).forEach(collection => {
      if (!collection || !Array.isArray(collection.features)) {
        this.logger.warn('FeatureProcessor', 'Invalid collection', { collection });
        return;
      }
      
      collection.features.forEach((feature: GeoFeature, index: number) => {
        if (!feature || !feature.geometry) {
          this.logger.warn('FeatureProcessor', 'Invalid feature at index', { index });
          return;
        }
        try {
          processGeometry(feature.geometry);
        } catch (error) {
          this.logger.error('FeatureProcessor', 'Error processing feature at index', {
            error: error instanceof Error ? error.message : String(error),
            feature
          });
        }
      });
    });

    this.logger.debug('FeatureProcessor', 'Calculated raw bounds', {
      hasValidBounds,
      bounds: { minX, minY, maxX, maxY },
      effectiveSystem,
      transformedFrom: this.transformedCoordinateSystem
    });

    // If no valid bounds found, use appropriate bounds for the effective system
    if (!hasValidBounds || !isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      this.logger.warn('FeatureProcessor', 'No valid bounds found or bounds contain non-finite values, using default bounds', {
        effectiveSystem,
        transformedFrom: this.transformedCoordinateSystem
      });

      if (effectiveSystem === COORDINATE_SYSTEMS.SWISS_LV95) {
        return {
          minX: 2485000,  // Min X for Switzerland in LV95
          minY: 1075000,  // Min Y for Switzerland in LV95
          maxX: 2834000,  // Max X for Switzerland in LV95
          maxY: 1299000   // Max Y for Switzerland in LV95
        };
      } else if (effectiveSystem === COORDINATE_SYSTEMS.WGS84) {
        return {
          minX: 5.9559,   // Min X for Switzerland in WGS84
          minY: 45.8179,  // Min Y for Switzerland in WGS84
          maxX: 10.4922,  // Max X for Switzerland in WGS84
          maxY: 47.8084   // Max Y for Switzerland in WGS84
        };
      }
    }

    // Add padding
    const dx = (maxX - minX) * this.BOUNDS_PADDING;
    const dy = (maxY - minY) * this.BOUNDS_PADDING;

    // Use system-appropriate minimum padding
    const minPadding = effectiveSystem === COORDINATE_SYSTEMS.WGS84 ? 0.0001 : 1;
    
    const bounds = {
      minX: minX - Math.max(minPadding, dx),
      minY: minY - Math.max(minPadding, dy),
      maxX: maxX + Math.max(minPadding, dx),
      maxY: maxY + Math.max(minPadding, dy)
    };

    this.logger.debug('FeatureProcessor', 'Final bounds with padding', {
      rawBounds: { minX, minY, maxX, maxY },
      padding: { 
        dx: Math.max(minPadding, dx), 
        dy: Math.max(minPadding, dy),
        system: effectiveSystem,
        minPadding
      },
      finalBounds: bounds,
      effectiveSystem,
      transformedFrom: this.transformedCoordinateSystem
    });
    
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
