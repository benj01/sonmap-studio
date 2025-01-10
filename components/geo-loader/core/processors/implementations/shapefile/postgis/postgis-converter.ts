import { Feature } from 'geojson';
import { PostGISGeometry, PostGISFeature } from '../../../../../types/postgis';
import { ShapeType } from '../types';
import { ValidationError } from '../../../../errors/types';

export class PostGISConverter {
  /**
   * Convert shapefile records to PostGIS format
   */
  async convertToPostGIS(records: any[], srid: number = 4326): Promise<PostGISFeature[]> {
    return Promise.all(records.map(async (record): Promise<PostGISFeature> => {
      const geometry = await this.convertGeometryToPostGIS(record, srid);
      return {
        geometry,
        properties: record.attributes || {},
        srid
      };
    }));
  }

  /**
   * Convert shapefile geometry to PostGIS format
   */
  private async convertGeometryToPostGIS(record: any, srid: number): Promise<PostGISGeometry> {
    const { shapeType, data } = record;
    const coordinates = data.coordinates;
    
    let type: string;
    switch (shapeType) {
      case ShapeType.POINT:
      case ShapeType.POINTZ:
      case ShapeType.POINTM:
        type = 'POINT';
        break;
      case ShapeType.POLYLINE:
      case ShapeType.POLYLINEZ:
      case ShapeType.POLYLINEM:
        type = 'LINESTRING';
        break;
      case ShapeType.POLYGON:
      case ShapeType.POLYGONZ:
      case ShapeType.POLYGONM:
        type = 'POLYGON';
        break;
      case ShapeType.MULTIPOINT:
      case ShapeType.MULTIPOINTZ:
      case ShapeType.MULTIPOINTM:
        type = 'MULTIPOINT';
        break;
      default:
        throw new ValidationError(
          `Unsupported shape type: ${shapeType}`,
          'SHAPEFILE_PARSE_ERROR',
          undefined,
          { shapeType }
        );
    }

    return {
      type: type as any,
      coordinates,
      srid
    };
  }

  /**
   * Create SQL for spatial index
   */
  createSpatialIndexSQL(tableName: string, schemaName: string = 'public'): string {
    const indexName = `${tableName}_geometry_idx`;
    return `CREATE INDEX IF NOT EXISTS ${indexName} ON ${schemaName}.${tableName} USING GIST (geometry)`;
  }

  /**
   * Generate batch insert SQL
   */
  generateBatchInsertSQL(
    tableName: string, 
    features: PostGISFeature[], 
    schemaName: string = 'public'
  ): string {
    const valueStrings = features.map((feature, index) => {
      const propertiesJson = JSON.stringify(feature.properties);
      return `(
        ST_SetSRID(ST_GeomFromGeoJSON('${JSON.stringify(feature.geometry)}'), ${feature.srid}),
        '${propertiesJson}'::jsonb
      )`;
    });

    return `
      INSERT INTO ${schemaName}.${tableName} (geometry, properties)
      VALUES ${valueStrings.join(',\n')}
    `;
  }

  /**
   * Generate table creation SQL
   */
  generateCreateTableSQL(tableName: string, schemaName: string = 'public'): string {
    return `
      CREATE TABLE IF NOT EXISTS ${schemaName}.${tableName} (
        id SERIAL PRIMARY KEY,
        geometry geometry(Geometry, 4326),
        properties jsonb DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;
  }

  /**
   * Generate update trigger SQL
   */
  generateUpdateTriggerSQL(tableName: string, schemaName: string = 'public'): string {
    const triggerName = `${tableName}_update_timestamp`;
    return `
      CREATE OR REPLACE FUNCTION ${schemaName}.${triggerName}()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';

      DROP TRIGGER IF EXISTS ${triggerName} ON ${schemaName}.${tableName};
      
      CREATE TRIGGER ${triggerName}
      BEFORE UPDATE ON ${schemaName}.${tableName}
      FOR EACH ROW
      EXECUTE FUNCTION ${schemaName}.${triggerName}();
    `;
  }

  /**
   * Calculate statistics for imported features
   */
  calculateImportStats(features: PostGISFeature[]): {
    totalFeatures: number;
    geometryTypes: Record<string, number>;
    averageVertices: number;
    totalProperties: number;
  } {
    const stats = {
      totalFeatures: features.length,
      geometryTypes: {} as Record<string, number>,
      averageVertices: 0,
      totalProperties: 0
    };

    let totalVertices = 0;

    features.forEach(feature => {
      // Count geometry types
      const type = feature.geometry.type;
      stats.geometryTypes[type] = (stats.geometryTypes[type] || 0) + 1;

      // Count vertices
      totalVertices += this.countVertices(feature.geometry);

      // Count properties
      stats.totalProperties += Object.keys(feature.properties).length;
    });

    stats.averageVertices = totalVertices / features.length;

    return stats;
  }

  /**
   * Count vertices in a geometry
   */
  private countVertices(geometry: PostGISGeometry): number {
    switch (geometry.type) {
      case 'POINT':
        return 1;
      case 'LINESTRING':
        return (geometry.coordinates as number[][]).length;
      case 'POLYGON':
        return (geometry.coordinates as number[][][]).reduce((sum, ring) => sum + ring.length, 0);
      case 'MULTIPOINT':
        return (geometry.coordinates as number[][]).length;
      case 'MULTILINESTRING':
        return (geometry.coordinates as number[][][]).reduce((sum, line) => sum + line.length, 0);
      case 'MULTIPOLYGON':
        return (geometry.coordinates as number[][][][]).reduce(
          (sum: number, polygon: number[][][]) => sum + polygon.reduce(
            (ringSum: number, ring: number[][]) => ringSum + ring.length, 
            0
          ), 
          0
        );
      default:
        return 0;
    }
  }
}
