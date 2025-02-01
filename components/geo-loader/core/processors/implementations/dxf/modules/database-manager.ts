/**
 * Database Manager for DXF Processing
 * Handles complex database operations specific to DXF file imports.
 * Uses the extended PostGISClient for advanced geometry operations.
 * 
 * This manager is specifically designed for DXF processing where:
 * - Complex geometries need to be handled
 * - Feature collections and layers need to be managed
 * - Coordinate transformations are required
 * - Geometry validation is critical
 */
import { PostGISClient } from '@/components/geo-loader/core/database/client';
import { DxfEntity } from '../types';
import {
  PostGISFeature,
  PostGISImportOptions,
  PostGISGeometry,
} from '../types/postgis';
import { ValidationError } from '../../../../errors/types';
import { DatabaseImportResult } from '../types/database';
import { RequiredBounds } from '../types/bounds';
import { PostGISConverter } from './postgis-converter';

/**
 * Manages database operations for DXF processing
 */
export class DatabaseManager {
  private client: PostGISClient;
  private layerMap: Map<string, string>;

  constructor(client: PostGISClient) {
    this.client = client;
    this.layerMap = new Map();
  }

  /**
   * Create a new feature collection
   */
  private async createCollection(
    projectFileId: string,
    name: string,
    description?: string
  ): Promise<string> {
    return this.client.createFeatureCollection(projectFileId, name, description);
  }

  /**
   * Create a new layer
   */
  private async createLayer(collectionId: string, name: string, type: string): Promise<string> {
    const layerId = await this.client.createLayer(collectionId, name, type);
    this.layerMap.set(name, layerId);
    return layerId;
  }

  /**
   * Import features in batches by layer
   */
  private async importFeaturesByLayer(
    layerId: string,
    features: PostGISFeature[],
    options: PostGISImportOptions
  ): Promise<number> {
    try {
      return await this.client.importFeatures(layerId, features, options);
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new ValidationError(
        `Failed to import features: ${errorMessage}`,
        'IMPORT_ERROR',
        undefined,
        { layerId, featureCount: features.length }
      );
    }
  }

  /**
   * Create geometry in PostGIS format
   */
  async createGeometry(wkt: string, srid: number): Promise<PostGISGeometry> {
    return this.client.createGeometry(wkt, srid);
  }

  /**
   * Get feature bounds using PostGIS
   */
  async getFeatureBounds(feature: PostGISFeature): Promise<RequiredBounds> {
    try {
      const result = await this.client.query<{ box: string }>(
        'SELECT ST_Extent(ST_GeomFromText($1, $2)) as box',
        [feature.geometry.wkt, feature.geometry.srid]
      );

      if (!result?.[0]?.box) {
        throw new ValidationError('Failed to calculate bounds', 'GEOMETRY_ERROR');
      }

      // Parse box string format: BOX(minx miny, maxx maxy)
      const match = result[0].box.match(/BOX\(([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.-]+)\)/);
      if (!match) {
        throw new ValidationError('Invalid bounds format', 'GEOMETRY_ERROR');
      }

      return {
        minX: parseFloat(match[1]),
        minY: parseFloat(match[2]),
        maxX: parseFloat(match[3]),
        maxY: parseFloat(match[4])
      };
    } catch (error) {
      throw new ValidationError(
        'Failed to calculate feature bounds',
        'GEOMETRY_ERROR',
        undefined,
        { originalError: error }
      );
    }
  }

  /**
   * Import entities to database
   */
  async importEntities(
    projectFileId: string,
    entities: DxfEntity[],
    layers: string[],
    options: PostGISImportOptions & {
      sourceSrid?: number;
      targetSrid?: number;
      chunkSize?: number;
      validateGeometry?: boolean;
    }
  ): Promise<DatabaseImportResult & { features: PostGISFeature[] }> {
    console.debug('[DEBUG] Starting database import');
    const startTime = Date.now();

    try {
      // Create collection
      const collectionId = await this.createCollection(
        projectFileId,
        'DXF Import',
        `Imported from DXF file at ${new Date().toISOString()}`
      );

      // Validate SRID settings
      const sourceSrid = options.sourceSrid || 4326;
      const targetSrid = options.targetSrid || sourceSrid;
      const needsTransform = sourceSrid !== targetSrid;

      console.debug(`[DEBUG] SRID: source=${sourceSrid}, target=${targetSrid}, transform=${needsTransform}`);

      // Create layers
      const layerIds: string[] = [];
      for (const layerName of layers) {
        const layerId = await this.createLayer(collectionId, layerName, 'dxf');
        layerIds.push(layerId);
      }

      // Convert entities to features
      const features: PostGISFeature[] = [];
      const failedFeatures: Array<{ entity: DxfEntity; error: string }> = [];

      for (const entity of entities) {
        try {
          if (!PostGISConverter.validateEntityData(entity)) {
            throw new ValidationError('Invalid entity data', 'VALIDATION_ERROR');
          }

          const wkt = PostGISConverter.entityToWKT(entity);
          // Create and potentially transform geometry
          let geometry = await this.client.createGeometry(wkt, sourceSrid);
          
          if (needsTransform) {
            geometry = await this.client.transformGeometry(geometry, targetSrid);
          }

          // Validate geometry if requested
          if (options.validateGeometry) {
            const isValid = await this.client.validateGeometry(geometry);
            if (!isValid) {
              throw new ValidationError('Invalid geometry', 'GEOMETRY_ERROR');
            }
          }

          const baseFeature = PostGISConverter.createFeature(entity, geometry, targetSrid);
          const feature: PostGISFeature = {
            ...baseFeature,
            properties: {
              ...entity.attributes,
              entityType: entity.type,
              _importTime: new Date().toISOString()
            }
          };
          features.push(feature);
        } catch (error: any) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          failedFeatures.push({
            entity,
            error: errorMessage || 'Unknown error'
          });
        }
      }

      // Group features by layer and prepare for database
      const featuresByLayer = new Map<string, PostGISFeature[]>();
      features.forEach(feature => {
        const layerName = (feature.properties?.layer as string) || '0';
        const layerId = this.layerMap.get(layerName);
        if (layerId) {
          feature.layerId = layerId;
          const layerFeatures = featuresByLayer.get(layerId) || [];
          layerFeatures.push(feature);
          featuresByLayer.set(layerId, layerFeatures);
        }
      });

      // Import features in batches by layer
      let importedFeatures = 0;
      for (const [layerId, layerFeatures] of featuresByLayer) {
        try {
          const importOptions: PostGISImportOptions = {
            validateGeometry: options.validateGeometry ?? true,
            transformCoordinates: needsTransform,
            sourceSrid,
            targetSrid,
            batchSize: options.chunkSize || 1000,
            preserveAttributes: true
          };
          const count = await this.importFeaturesByLayer(layerId, layerFeatures, importOptions);
          importedFeatures += count;
        } catch (error: any) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          failedFeatures.push(...layerFeatures.map(f => ({
            entity: entities[features.indexOf(f)],
            error: errorMessage || 'Unknown error'
          })));
        }
      }

      return {
        importedFeatures,
        collectionId,
        layerIds,
        failedFeatures,
        statistics: {
          importTime: Date.now() - startTime,
          validatedCount: entities.length,
          transformedCount: importedFeatures
        },
        features: features.filter(f => !failedFeatures.some(ff => ff.entity === entities[features.indexOf(f)]))
      };
    } catch (error) {
      const err = error instanceof Error ? error : new ValidationError(
        String(error),
        'IMPORT_ERROR',
        undefined,
        { originalError: error }
      );
      throw err;
    }
  }
}
