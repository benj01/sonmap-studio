import { Pool, PoolClient } from 'pg';

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
  async createFeatureCollection(name: string, description?: string): Promise<string> {
    const result = await this.query<{ id: string }>(
      'INSERT INTO feature_collections (name, description) VALUES ($1, $2) RETURNING id',
      [name, description]
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
   * Import features into a layer
   */
  async importFeatures(layerId: string, features: any[]): Promise<number> {
    // Start a transaction for bulk import
    await this.client!.query('BEGIN');
    try {
      let importedCount = 0;
      for (const feature of features) {
        await this.client!.query(
          'INSERT INTO geo_features (layer_id, geometry, properties) VALUES ($1, ST_GeomFromGeoJSON($2), $3)',
          [layerId, JSON.stringify(feature.geometry), feature.properties]
        );
        importedCount++;
      }
      await this.client!.query('COMMIT');
      return importedCount;
    } catch (error: any) {
      await this.client!.query('ROLLBACK');
      throw new Error(`Import failed: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Get features from a layer with optional spatial query
   */
  async getFeatures(layerId: string, bbox?: [number, number, number, number]): Promise<any[]> {
    let query = 'SELECT id, ST_AsGeoJSON(geometry) as geometry, properties FROM geo_features WHERE layer_id = $1';
    const params: any[] = [layerId];

    if (bbox) {
      query += ' AND ST_Intersects(geometry, ST_MakeEnvelope($2, $3, $4, $5, 4326))';
      params.push(...bbox);
    }

    const features = await this.query(query, params);
    return features.map(f => ({
      type: 'Feature',
      id: f.id,
      geometry: JSON.parse(f.geometry),
      properties: f.properties
    }));
  }
}
