import { Pool, PoolClient } from 'pg';
import {
  PostGISGeometry,
  PostGISFeature,
  PostGISFeatureCollection,
  PostGISLayer,
  PostGISImportOptions,
  PostGISPoint,
  PostGISLineString,
  PostGISPolygon,
  PostGISMultiPoint,
  PostGISMultiLineString,
  PostGISMultiPolygon,
  PostGISGeometryCollection
} from '../processors/implementations/dxf/types/postgis';

/**
 * PostGIS database client configuration
 */
export interface PostGISConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  maxConnections?: number;
}

/**
 * Client for interacting with PostGIS database
 */
export class PostGISClient {
  private pool: Pool;
  private client: PoolClient | null = null;

  constructor(config: PostGISConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: config.maxConnections || 10,
      // Add SSL if needed based on config
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
    });
  }

  /**
   * Connect to the database
   */
  async connect(): Promise<void> {
    try {
      this.client = await this.pool.connect();
    } catch (error: any) {
      throw new Error(`Failed to connect to PostGIS: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Disconnect from the database
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.release();
      this.client = null;
    }
    await this.pool.end();
  }

  /**
   * Execute a query
   */
  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.client) {
      throw new Error('Not connected to database');
    }
    try {
      const result = await this.client.query(sql, params);
      return result.rows;
    } catch (error: any) {
      throw new Error(`Query failed: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Create a new feature collection
   */
  async createFeatureCollection(
    projectFileId: string,
    name: string,
    description?: string
  ): Promise<string> {
    const result = await this.query<{ id: string }>(
      'INSERT INTO feature_collections (project_file_id, name, description) VALUES ($1, $2, $3) RETURNING id',
      [projectFileId, name, description]
    );
    return result[0].id;
  }

  /**
   * Create a new layer in a feature collection
   */
  async createLayer(collectionId: string, name: string, type: string): Promise<string> {
    const result = await this.query<{ id: string }>(
      'INSERT INTO layers (collection_id, name, type) VALUES ($1, $2, $3) RETURNING id',
      [collectionId, name, type]
    );
    return result[0].id;
  }

  /**
   * Import features into a layer with PostGIS geometries
   */
  async importFeatures(layerId: string, features: PostGISFeature[], options: PostGISImportOptions = {}): Promise<number> {
    const {
      validateGeometry = true,
      transformCoordinates = false,
      targetSrid,
      batchSize = 1000
    } = options;

    await this.client!.query('BEGIN');
    try {
      let importedCount = 0;
      const batches = [];
      
      // Prepare features in batches
      for (let i = 0; i < features.length; i += batchSize) {
        const batch = features.slice(i, i + batchSize);
        const values = batch.map((feature, idx) => {
          const paramOffset = idx * 4;
          return `($${paramOffset + 1}, $${paramOffset + 2}, $${paramOffset + 3}, $${paramOffset + 4})`;
        }).join(',');
        
        const params = batch.flatMap(feature => [
          layerId,
          feature.geometry.wkt,
          feature.geometry.srid,
          feature.properties || {}
        ]);
        
        let query = `
          INSERT INTO geo_features (layer_id, geometry, srid, properties)
          VALUES ${values}
        `;

        // Add geometry validation if requested
        if (validateGeometry) {
          query = query.replace('VALUES', 'SELECT layer_id, ST_GeomFromText(wkt, srid), srid, properties FROM (VALUES');
          query += ') AS tmp(layer_id, wkt, srid, properties) WHERE ST_IsValid(ST_GeomFromText(wkt, srid))';
        }

        // Add coordinate transformation if requested
        if (transformCoordinates && targetSrid) {
          query = query.replace('ST_GeomFromText(wkt, srid)', 
            `ST_Transform(ST_GeomFromText(wkt, srid), ${targetSrid})`);
        }

        batches.push({ query, params });
      }

      // Execute batches
      for (const batch of batches) {
        const result = await this.client!.query(batch.query, batch.params);
        importedCount += result.rowCount ?? 0;
      }

      await this.client!.query('COMMIT');
      return importedCount;
    } catch (error: any) {
      await this.client!.query('ROLLBACK');
      throw new Error(`Import failed: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Parse WKT string to coordinates
   */
  private parseWKTToCoordinates(wkt: string): number[] | number[][] | number[][][] | number[][][][] {
    // Remove geometry type prefix and parentheses
    const coordsStr = wkt.replace(/^[A-Z]+\s*\(+|\)+$/g, '');
    
    // Split into coordinate pairs/groups
    const parseCoordPair = (str: string): [number, number] => {
      const [x, y] = str.trim().split(' ').map(Number);
      return [x, y];
    };

    const parseCoordList = (str: string): [number, number][] => {
      return str.split(',').map(pair => parseCoordPair(pair.trim()));
    };

    const parsePolygon = (str: string): [number, number][][] => {
      return str.split('),(').map(ring => parseCoordList(ring));
    };

    const parseMultiPolygon = (str: string): [number, number][][][] => {
      return str.split(')),((').map(poly => parsePolygon(poly));
    };

    if (!coordsStr.includes('(')) {
      // Point
      return parseCoordPair(coordsStr);
    } else if (!coordsStr.includes('),(')) {
      // LineString or MultiPoint
      return parseCoordList(coordsStr);
    } else if (!coordsStr.includes(')),((')) {
      // Polygon or MultiLineString
      return parsePolygon(coordsStr);
    } else {
      // MultiPolygon
      return parseMultiPolygon(coordsStr);
    }
  }

  /**
   * Create a geometry in PostGIS format
   */
  async createGeometry(wkt: string, srid: number): Promise<PostGISGeometry> {
    const result = await this.query<{ type: string; srid: number; wkt: string }>(
      'SELECT ST_GeometryType(geom) as type, ST_SRID(geom) as srid, ST_AsText(geom) as wkt ' +
      'FROM (SELECT ST_GeomFromText($1, $2) as geom) tmp',
      [wkt, srid]
    );

    if (!result.length) {
      throw new Error('Failed to create geometry');
    }

    const type = result[0].type.replace('ST_', '') as PostGISGeometry['type'];
    const coordinates = this.parseWKTToCoordinates(result[0].wkt);
    const baseGeometry = {
      srid: result[0].srid,
      wkt: result[0].wkt,
    };

    switch (type) {
      case 'POINT': {
        const point: PostGISPoint = {
          ...baseGeometry,
          type,
          coordinates: coordinates as [number, number]
        };
        return point;
      }
      case 'LINESTRING': {
        const lineString: PostGISLineString = {
          ...baseGeometry,
          type,
          coordinates: coordinates as [number, number][]
        };
        return lineString;
      }
      case 'POLYGON': {
        const polygon: PostGISPolygon = {
          ...baseGeometry,
          type,
          coordinates: coordinates as [number, number][][]
        };
        return polygon;
      }
      case 'MULTIPOINT': {
        const multiPoint: PostGISMultiPoint = {
          ...baseGeometry,
          type,
          coordinates: coordinates as [number, number][]
        };
        return multiPoint;
      }
      case 'MULTILINESTRING': {
        const multiLineString: PostGISMultiLineString = {
          ...baseGeometry,
          type,
          coordinates: coordinates as [number, number][][]
        };
        return multiLineString;
      }
      case 'MULTIPOLYGON': {
        const multiPolygon: PostGISMultiPolygon = {
          ...baseGeometry,
          type,
          coordinates: coordinates as [number, number][][][]
        };
        return multiPolygon;
      }
      case 'GEOMETRYCOLLECTION': {
        const collection: PostGISGeometryCollection = {
          ...baseGeometry,
          type,
          geometries: [] // TODO: Implement geometry collection parsing if needed
        };
        return collection;
      }
      default:
        throw new Error(`Unsupported geometry type: ${type}`);
    }
  }

  /**
   * Transform geometry to different SRID
   */
  async transformGeometry(geometry: PostGISGeometry, targetSrid: number): Promise<PostGISGeometry> {
    const result = await this.query<{ type: string; srid: number; wkt: string }>(
      'SELECT ST_GeometryType(geom) as type, ST_SRID(geom) as srid, ST_AsText(geom) as wkt ' +
      'FROM (SELECT ST_Transform(ST_GeomFromText($1, $2), $3) as geom) tmp',
      [geometry.wkt, geometry.srid, targetSrid]
    );

    if (!result.length) {
      throw new Error('Failed to transform geometry');
    }

    // Create new geometry with transformed coordinates
    return this.createGeometry(result[0].wkt, targetSrid);
  }

  /**
   * Validate geometry
   */
  async validateGeometry(geometry: PostGISGeometry): Promise<boolean> {
    const result = await this.query<{ isValid: boolean }>(
      'SELECT ST_IsValid(ST_GeomFromText($1, $2)) as isValid',
      [geometry.wkt, geometry.srid]
    );

    return result[0]?.isValid || false;
  }

  /**
   * Get features from a layer with optional spatial query
   */
  async getFeatures(layerId: string, bbox?: [number, number, number, number], srid: number = 4326): Promise<PostGISFeature[]> {
    let query = `
      SELECT 
        id,
        ST_AsText(geometry) as wkt,
        ST_SRID(geometry) as srid,
        ST_GeometryType(geometry) as type,
        properties
      FROM geo_features 
      WHERE layer_id = $1
    `;
    const params: any[] = [layerId];

    if (bbox) {
      query += ' AND ST_Intersects(geometry, ST_MakeEnvelope($2, $3, $4, $5, $6))';
      params.push(...bbox, srid);
    }

    const features = await this.query(query, params);
    
    // Process features sequentially to handle geometry creation
    const processedFeatures: PostGISFeature[] = [];
    for (const f of features) {
      const geometry = await this.createGeometry(f.wkt, f.srid);
      processedFeatures.push({
        type: 'Feature',
        id: f.id,
        layerId,
        geometry,
        properties: f.properties || {}
      });
    }
    
    return processedFeatures;
  }
}
