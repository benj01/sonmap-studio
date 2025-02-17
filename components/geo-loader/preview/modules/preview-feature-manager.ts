import { Feature, FeatureCollection, Geometry, Position, Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon } from 'geojson';
import { FeatureManager } from '../../core/feature-manager';
import { GeoFeature } from '../../../../types/geo';
import { PreviewCollections } from '../types';
import { FeatureProcessor } from '../feature-processor';
import { LogManager } from '../../core/logging/log-manager';
import { Bounds } from '../../core/feature-manager/bounds';
import { isPointInBounds, calculateBoundsFromPoints } from '../../utils/geometry';

const DEFAULT_MAX_FEATURES = 5000;

interface PreviewFeatureManagerOptions {
  enableCaching?: boolean;
  smartSampling?: boolean;
  maxFeatures?: number;
}

type GeometryType = Geometry['type'];
type GeometryWithCoords = Point | LineString | Polygon | MultiPoint | MultiLineString | MultiPolygon;

const GEOMETRY_TYPES = {
  POINT: 'Point' as GeometryType,
  LINE_STRING: 'LineString' as GeometryType,
  POLYGON: 'Polygon' as GeometryType,
  MULTI_POINT: 'MultiPoint' as GeometryType,
  MULTI_LINE_STRING: 'MultiLineString' as GeometryType,
  MULTI_POLYGON: 'MultiPolygon' as GeometryType
};

interface GeometryWithCoordinates {
  type: GeometryType;
  coordinates: Position | Position[] | Position[][] | Position[][][];
}

export class PreviewFeatureManager {
  private readonly logger = LogManager.getInstance();
  private readonly featureManager: FeatureManager;
  private readonly featureProcessor: FeatureProcessor;
  private maxFeatures: number;
  private visibleLayers: string[] = ['shapes'];
  private features: GeoFeature[] = [];
  private featureBounds: Map<GeoFeature, Bounds> = new Map();

  constructor(maxFeatures: number, visibleLayers: string[] = []) {
    this.maxFeatures = maxFeatures;
    this.visibleLayers = visibleLayers;
    this.featureProcessor = new FeatureProcessor();
    this.featureManager = new FeatureManager({
      chunkSize: Math.max(1, Math.min(100, Math.ceil(this.maxFeatures / 10))),
      maxMemoryMB: 512,
      monitorMemory: true,
      streamingMode: false
    });

    if (this.visibleLayers.length > 0) {
      this.featureManager.setVisibleLayers(this.visibleLayers);
    }
  }

  private sanitizeFeature(feature: GeoFeature) {
    if (!feature) return null;
    return {
      type: feature.geometry?.type,
      layer: feature.properties?.layer || 'shapes',
      hasCoordinates: feature.geometry && 'coordinates' in feature.geometry,
      propertiesCount: feature.properties ? Object.keys(feature.properties).length : 0,
      id: feature.id
    };
  }

  private countFeatureTypes(features: GeoFeature[]): Record<string, number> {
    return features.reduce((acc, feature) => {
      const type = feature.geometry?.type || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  public async setFeatures(features: GeoFeature[]): Promise<void> {
    this.logger.info('PreviewFeatureManager', 'Setting features', {
      count: features.length,
      firstFeature: features[0] ? {
        type: features[0].geometry?.type,
        coordinates: this.getGeometryCoordinates(features[0].geometry),
        properties: features[0].properties,
        transformedCoordinates: features[0].properties?._transformedCoordinates,
        fromSystem: features[0].properties?._fromSystem,
        toSystem: features[0].properties?._toSystem
      } : null
    });

    this.features = features;
  }

  public async getFeatures(): Promise<GeoFeature[]> {
    return this.features;
  }

  public async getVisibleFeatures(): Promise<GeoFeature[]> {
    const features = await this.getFeatures();
    
    this.logger.info('PreviewFeatureManager', 'Getting visible features', {
      totalFeatures: features.length,
      visibleLayers: this.visibleLayers,
      firstFeature: features[0] ? {
        type: features[0].geometry?.type,
        layer: features[0].properties?.layer,
        isVisible: this.visibleLayers.includes(features[0].properties?.layer || 'shapes')
      } : null
    });

    return features.filter((f: GeoFeature) => 
      this.visibleLayers.includes(f.properties?.layer || 'shapes')
    );
  }

  public setVisibleLayers(layers: string[]): void {
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug('PreviewFeatureManager', 'Setting visible layers', {
        oldLayers: this.visibleLayers,
        newLayers: layers
      });
    }
    this.visibleLayers = layers;
    this.featureManager.setVisibleLayers(layers);
  }

  public getVisibleLayers(): string[] {
    return [...this.visibleLayers];
  }

  public async categorizeFeatures(features: GeoFeature[]): Promise<PreviewCollections> {
    this.logger.debug('PreviewFeatureManager', 'Categorizing features', {
      count: features.length,
      types: features.map(f => f.geometry?.type),
      layers: features.map(f => f.properties?.layer),
      firstFeature: features[0] ? {
        type: features[0].geometry?.type,
        coordinates: this.getGeometryCoordinates(features[0].geometry),
        properties: features[0].properties,
        transformedCoordinates: features[0].properties?._transformedCoordinates
      } : null
    });

    return this.featureProcessor.categorizeFeatures(features);
  }

  public calculateBounds(collections: PreviewCollections) {
    return this.featureProcessor.calculateBounds(collections);
  }

  public dispose(): void {
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug('PreviewFeatureManager', 'Disposing');
    }
    this.featureManager.dispose();
    this.visibleLayers = [];
  }

  private getGeometryCoordinates(geometry: Point | LineString | Polygon | MultiPoint | MultiLineString | MultiPolygon | null): number[][] | null {
    if (!geometry) return null;
    
    switch (geometry.type) {
      case 'Point':
        return [geometry.coordinates];
      case 'LineString':
        return geometry.coordinates;
      case 'Polygon':
        return geometry.coordinates[0];
      case 'MultiPoint':
        return geometry.coordinates;
      case 'MultiLineString':
        return geometry.coordinates[0];
      case 'MultiPolygon':
        return geometry.coordinates[0][0];
      default:
        return null;
    }
  }

  /**
   * Process features and return collections for preview
   */
  public async processFeatures(
    features: GeoFeature[],
    options: PreviewFeatureManagerOptions = {}
  ): Promise<PreviewCollections> {
    const {
      enableCaching = true,
      smartSampling = true,
      maxFeatures = DEFAULT_MAX_FEATURES
    } = options;

    try {
      // Store features for viewport queries if caching is enabled
      if (enableCaching) {
        this.features = features;
        this.updateFeatureBounds(features);
      }

      // Apply smart sampling if enabled
      const processedFeatures = smartSampling
        ? this.sampleFeatures(features, maxFeatures)
        : features;

      // Categorize features
      const collections = await this.categorizeFeatures(processedFeatures);

      this.logger.debug('PreviewFeatureManager', 'Features processed', {
        originalCount: features.length,
        processedCount: processedFeatures.length,
        pointCount: collections.points.features.length,
        lineCount: collections.lines.features.length,
        polygonCount: collections.polygons.features.length
      });

      return collections;
    } catch (error) {
      this.logger.error('PreviewFeatureManager', 'Error processing features', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get features within bounds
   */
  public getFeaturesInBounds(bounds: Bounds): GeoFeature[] {
    return this.features.filter(feature => {
      const featureBounds = this.featureBounds.get(feature);
      if (!featureBounds) {
        // If bounds not cached, calculate them
        if (!this.isGeometryWithCoords(feature.geometry)) return false;
        const coords = this.extractCoordinates(feature.geometry);
        const newBounds = calculateBoundsFromPoints(coords);
        this.featureBounds.set(feature, newBounds);
        return this.doBoundsIntersect(bounds, newBounds);
      }
      return this.doBoundsIntersect(bounds, featureBounds);
    });
  }

  /**
   * Sample features based on density and importance
   */
  private sampleFeatures(features: GeoFeature[], maxFeatures: number): GeoFeature[] {
    if (features.length <= maxFeatures) return features;

    // Calculate feature importance scores
    const scoredFeatures = features.map(feature => ({
      feature,
      score: this.calculateFeatureImportance(feature)
    }));

    // Sort by importance and take top features
    scoredFeatures.sort((a, b) => b.score - a.score);
    return scoredFeatures.slice(0, maxFeatures).map(sf => sf.feature);
  }

  /**
   * Calculate feature importance score
   */
  private calculateFeatureImportance(feature: GeoFeature): number {
    let score = 1;

    // Prioritize features with more properties
    if (feature.properties) {
      score += Object.keys(feature.properties).length * 0.1;
    }

    // Prioritize more complex geometries
    if (this.isGeometryWithCoords(feature.geometry)) {
      const coords = this.extractCoordinates(feature.geometry);
      score += Math.log(coords.length + 1);
    }

    // Prioritize certain feature types
    switch (feature.geometry?.type as GeometryType) {
      case GEOMETRY_TYPES.POINT:
        score *= 1.2;
        break;
      case GEOMETRY_TYPES.LINE_STRING:
        score *= 1.1;
        break;
      case GEOMETRY_TYPES.POLYGON:
        score *= 1.0;
        break;
      default:
        score *= 0.9;
    }

    return score;
  }

  /**
   * Categorize features by geometry type
   */
  private async categorizeFeatures(features: GeoFeature[]): Promise<PreviewCollections> {
    const collections: PreviewCollections = {
      points: { type: 'FeatureCollection', features: [] },
      lines: { type: 'FeatureCollection', features: [] },
      polygons: { type: 'FeatureCollection', features: [] },
      totalCount: features.length
    };

    for (const feature of features) {
      if (!feature.geometry) continue;

      switch (feature.geometry.type as GeometryType) {
        case GEOMETRY_TYPES.POINT:
        case GEOMETRY_TYPES.MULTI_POINT:
          collections.points.features.push(feature);
          break;
        case GEOMETRY_TYPES.LINE_STRING:
        case GEOMETRY_TYPES.MULTI_LINE_STRING:
          collections.lines.features.push(feature);
          break;
        case GEOMETRY_TYPES.POLYGON:
        case GEOMETRY_TYPES.MULTI_POLYGON:
          collections.polygons.features.push(feature);
          break;
      }
    }

    return collections;
  }

  /**
   * Check if geometry has coordinates
   */
  private isGeometryWithCoords(geometry: Geometry | null): geometry is GeometryWithCoords {
    if (!geometry) return false;
    return ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'].includes(geometry.type);
  }

  /**
   * Extract coordinates from geometry
   */
  private extractCoordinates(geometry: GeometryWithCoords): Position[] {
    const geom = geometry as GeometryWithCoordinates;
    if (!geom.coordinates) return [];

    switch (geom.type) {
      case GEOMETRY_TYPES.POINT:
        return [geom.coordinates as Position];
      case GEOMETRY_TYPES.LINE_STRING:
        return geom.coordinates as Position[];
      case GEOMETRY_TYPES.POLYGON:
        return (geom.coordinates as Position[][]).flat();
      case GEOMETRY_TYPES.MULTI_POINT:
        return geom.coordinates as Position[];
      case GEOMETRY_TYPES.MULTI_LINE_STRING:
        return (geom.coordinates as Position[][]).flat();
      case GEOMETRY_TYPES.MULTI_POLYGON:
        return (geom.coordinates as Position[][][]).flat(2);
      default:
        return [];
    }
  }

  /**
   * Update feature bounds cache
   */
  private updateFeatureBounds(features: GeoFeature[]): void {
    this.featureBounds.clear();
    for (const feature of features) {
      if (this.isGeometryWithCoords(feature.geometry)) {
        const coords = this.extractCoordinates(feature.geometry);
        if (coords.length > 0) {
          this.featureBounds.set(feature, calculateBoundsFromPoints(coords));
        }
      }
    }
  }

  /**
   * Check if two bounds intersect
   */
  private doBoundsIntersect(a: Bounds, b: Bounds): boolean {
    return !(
      a.maxX < b.minX ||
      a.minX > b.maxX ||
      a.maxY < b.minY ||
      a.minY > b.maxY
    );
  }
}
