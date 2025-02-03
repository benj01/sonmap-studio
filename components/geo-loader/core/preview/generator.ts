import { Feature, FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import { LogManager } from '../logging/log-manager';
import { ProcessorMetadata, LayerInfo } from '../processors/base/interfaces';
import { CoordinateSystem } from '../../types/coordinates';
import { CoordinateSystemManager } from '../coordinate-systems/coordinate-system-manager';

export interface PreviewOptions {
  maxFeatures?: number;
  targetSystem?: CoordinateSystem;
  simplifyGeometry?: boolean;
  simplificationTolerance?: number;
  includeAttributes?: boolean;
  styleOptions?: {
    defaultColor?: string;
    defaultOpacity?: number;
    colorByProperty?: string;
    colorScale?: string[];
  };
}

export interface PreviewResult {
  features: Feature[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  layers: LayerInfo[];
  metadata: ProcessorMetadata;
  style: {
    colors: string[];
    propertyRanges?: Record<string, { min: number; max: number }>;
    categoricalValues?: Record<string, Set<string>>;
  };
}

export class PreviewGenerator {
  private readonly logger = LogManager.getInstance();
  private readonly coordinateManager = CoordinateSystemManager.getInstance();

  /**
   * Generate a preview from features
   */
  public async generatePreview(
    features: Feature[],
    metadata: ProcessorMetadata,
    options: PreviewOptions = {}
  ): Promise<PreviewResult> {
    try {
      // Sample features if needed
      const sampledFeatures = this.sampleFeatures(features, options.maxFeatures);

      // Transform coordinates if needed
      let transformedFeatures = sampledFeatures;
      if (options.targetSystem) {
        transformedFeatures = await this.transformFeatures(sampledFeatures, metadata, options.targetSystem);
      }

      // Simplify geometries if requested
      if (options.simplifyGeometry) {
        transformedFeatures = this.simplifyGeometries(
          transformedFeatures,
          options.simplificationTolerance || 0.1
        );
      }

      // Calculate bounds
      const bounds = this.calculateBounds(transformedFeatures);

      // Create layer structure
      const layers = this.createLayers(transformedFeatures, metadata);

      // Generate style information
      const style = this.generateStyle(transformedFeatures, options.styleOptions);

      return {
        features: transformedFeatures,
        bounds,
        layers,
        metadata,
        style
      };
    } catch (error) {
      this.logger.error('Error generating preview:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Sample features for preview
   */
  private sampleFeatures(features: Feature[], maxFeatures: number = 1000): Feature[] {
    if (!maxFeatures || features.length <= maxFeatures) {
      return features;
    }

    const step = Math.max(1, Math.floor(features.length / maxFeatures));
    return features.filter((_, index) => index % step === 0).slice(0, maxFeatures);
  }

  /**
   * Transform features to target coordinate system
   */
  private async transformFeatures(
    features: Feature[],
    metadata: ProcessorMetadata,
    targetSystem: CoordinateSystem
  ): Promise<Feature[]> {
    try {
      const sourceSystem = metadata.crs as CoordinateSystem;
      if (!sourceSystem || sourceSystem === targetSystem) {
        return features;
      }

      return await this.coordinateManager.transform(features, sourceSystem, targetSystem);
    } catch (error) {
      this.logger.error('Error transforming features:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Simplify geometries for preview
   */
  private simplifyGeometries(features: Feature[], tolerance: number): Feature[] {
    // TODO: Implement geometry simplification
    // This would use something like Ramer-Douglas-Peucker algorithm
    return features;
  }

  /**
   * Calculate bounds from features
   */
  private calculateBounds(features: Feature[]): PreviewResult['bounds'] {
    if (!features.length) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    const bounds = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity
    };

    for (const feature of features) {
      if (!feature.geometry) continue;

      const coords = this.extractCoordinates(feature.geometry);
      for (const [x, y] of coords) {
        bounds.minX = Math.min(bounds.minX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.maxY = Math.max(bounds.maxY, y);
      }
    }

    if (!isFinite(bounds.minX) || !isFinite(bounds.minY) || 
        !isFinite(bounds.maxX) || !isFinite(bounds.maxY)) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    return bounds;
  }

  /**
   * Extract coordinates from geometry
   */
  private extractCoordinates(geometry: Geometry): Array<[number, number]> {
    const coordinates: Array<[number, number]> = [];

    const processCoordinate = (coord: any) => {
      if (Array.isArray(coord) && typeof coord[0] === 'number' && coord.length >= 2) {
        coordinates.push([coord[0], coord[1]]);
      } else if (Array.isArray(coord)) {
        coord.forEach(processCoordinate);
      }
    };

    if ('coordinates' in geometry) {
      processCoordinate(geometry.coordinates);
    }

    return coordinates;
  }

  /**
   * Create layer structure
   */
  private createLayers(features: Feature[], metadata: ProcessorMetadata): LayerInfo[] {
    const geometryTypes = new Set<string>();
    const attributeTypes = new Map<string, Set<string>>();
    const attributeSamples = new Map<string, any>();

    // Analyze features
    for (const feature of features) {
      if (feature.geometry) {
        geometryTypes.add(feature.geometry.type);
      }

      if (feature.properties) {
        for (const [key, value] of Object.entries(feature.properties)) {
          if (!attributeTypes.has(key)) {
            attributeTypes.set(key, new Set());
          }
          attributeTypes.get(key)?.add(typeof value);
          if (!attributeSamples.has(key)) {
            attributeSamples.set(key, value);
          }
        }
      }
    }

    // Create layer info
    return Array.from(geometryTypes).map(geometryType => ({
      name: geometryType.toLowerCase(),
      featureCount: features.filter(f => f.geometry?.type === geometryType).length,
      geometryType,
      attributes: Array.from(attributeTypes.entries()).map(([name, types]) => ({
        name,
        type: Array.from(types)[0],
        sample: attributeSamples.get(name)
      })),
      bounds: this.calculateBounds(
        features.filter(f => f.geometry?.type === geometryType)
      )
    }));
  }

  /**
   * Generate style information
   */
  private generateStyle(
    features: Feature[],
    options: PreviewOptions['styleOptions'] = {}
  ): PreviewResult['style'] {
    const style: PreviewResult['style'] = {
      colors: options.colorScale || [
        '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
        '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
      ]
    };

    // If color by property is specified, analyze property values
    if (options.colorByProperty) {
      const values = features
        .map(f => f.properties?.[options.colorByProperty!])
        .filter(v => v !== undefined && v !== null);

      if (values.length > 0) {
        if (typeof values[0] === 'number') {
          // Numerical values - calculate range
          const numbers = values as number[];
          style.propertyRanges = {
            [options.colorByProperty]: {
              min: Math.min(...numbers),
              max: Math.max(...numbers)
            }
          };
        } else {
          // Categorical values - collect unique values
          style.categoricalValues = {
            [options.colorByProperty]: new Set(values.map(String))
          };
        }
      }
    }

    return style;
  }
} 