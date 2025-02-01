/**
 * Primary PostGIS database client focused on transaction management and basic operations.
 * This client is used by processors that need transaction support and batch operations.
 * Features:
 * - Connection pooling
 * - Transaction management (begin, commit, rollback)
 * - Batch feature insertion
 * - Basic PostGIS operations
 */
import { Pool, PoolClient } from 'pg';
import { PostGISFeature, PostGISGeometry, PostGISBatchOptions } from '../types/postgis';

/**
 * PostGIS client configuration
 */
export interface PostGISConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  max?: number; // Maximum number of clients in pool
}

/**
 * PostGIS client implementation with connection pooling and transaction support
 */
export class PostGISClient {
  private pool: Pool;
  private activeClient: PoolClient | null = null;
  private transactionActive = false;

  constructor(config: PostGISConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl,
      max: config.max || 20,
    });

    // Error handling
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }

  /**
   * Get a client from the pool
   */
  async getClient(): Promise<PoolClient> {
    if (this.activeClient && this.transactionActive) {
      return this.activeClient;
    }
    return await this.pool.connect();
  }

  /**
   * Begin a transaction
   */
  async beginTransaction(): Promise<void> {
    if (this.transactionActive) {
      throw new Error('Transaction already active');
    }
    this.activeClient = await this.getClient();
    await this.activeClient.query('BEGIN');
    this.transactionActive = true;
  }

  /**
   * Commit a transaction
   */
  async commitTransaction(): Promise<void> {
    if (!this.transactionActive || !this.activeClient) {
      throw new Error('No active transaction');
    }
    await this.activeClient.query('COMMIT');
    this.activeClient.release();
    this.activeClient = null;
    this.transactionActive = false;
  }

  /**
   * Rollback a transaction
   */
  async rollbackTransaction(): Promise<void> {
    if (!this.transactionActive || !this.activeClient) {
      throw new Error('No active transaction');
    }
    await this.activeClient.query('ROLLBACK');
    this.activeClient.release();
    this.activeClient = null;
    this.transactionActive = false;
  }

  /**
   * Insert features in batches
   */
  async insertFeatures(
    tableName: string,
    features: PostGISFeature[],
    options: PostGISBatchOptions = {}
  ): Promise<{ inserted: number; failed: number }> {
    const {
      batchSize = 1000,
      useTransaction = true,
      onProgress,
      onBatchComplete,
    } = options;

    let inserted = 0;
    let failed = 0;
    const totalBatches = Math.ceil(features.length / batchSize);

    try {
      if (useTransaction) {
        await this.beginTransaction();
      }

      for (let i = 0; i < features.length; i += batchSize) {
        const batch = features.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;

        try {
          const values = batch.map((feature) => this.createInsertValues(feature));
          const query = this.createBatchInsertQuery(tableName, values);
          const client = await this.getClient();
          
          try {
            await client.query(query);
            inserted += batch.length;
          } finally {
            if (!this.transactionActive) {
              client.release();
            }
          }

          if (onProgress) {
            onProgress((i + batch.length) / features.length);
          }

          if (onBatchComplete) {
            onBatchComplete(batchNumber, totalBatches);
          }
        } catch (error) {
          failed += batch.length;
          if (!useTransaction) {
            console.error(`Batch ${batchNumber} failed:`, error);
          } else {
            throw error; // Re-throw to trigger rollback
          }
        }
      }

      if (useTransaction) {
        await this.commitTransaction();
      }
    } catch (error) {
      if (useTransaction && this.transactionActive) {
        await this.rollbackTransaction();
      }
      throw error;
    }

    return { inserted, failed };
  }

  /**
   * Create PostGIS geometry from WKT
   */
  private createGeometryFromWKT(geometry: PostGISGeometry): string {
    // Convert coordinates to WKT format
    const coordsToWKT = (coords: any[]): string => {
      if (!Array.isArray(coords[0])) {
        return coords.join(' ');
      }
      return coords.map((c) => `(${coordsToWKT(c)})`).join(',');
    };

    const wkt = `${geometry.type}(${coordsToWKT(geometry.coordinates)})`;
    return `ST_SetSRID(ST_GeomFromText('${wkt}'), ${geometry.srid})`;
  }

  /**
   * Create values for INSERT query
   */
  private createInsertValues(feature: PostGISFeature): {
    geometry: string;
    properties: Record<string, any>;
  } {
    return {
      geometry: this.createGeometryFromWKT(feature.geometry),
      properties: feature.properties,
    };
  }

  /**
   * Create batch INSERT query
   */
  private createBatchInsertQuery(
    tableName: string,
    values: Array<{ geometry: string; properties: Record<string, any> }>
  ): string {
    const columns = ['geometry', 'properties'];
    const valueStrings = values
      .map(
        (v) =>
          `(${v.geometry}, '${JSON.stringify(v.properties)}'::jsonb)`
      )
      .join(',');

    return `
      INSERT INTO ${tableName} (${columns.join(',')})
      VALUES ${valueStrings}
    `;
  }

  /**
   * Execute a raw SQL query
   */
  async executeQuery(query: string, values?: any[]): Promise<any> {
    const client = await this.getClient();
    try {
      return await client.query(query, values);
    } finally {
      if (!this.transactionActive) {
        client.release();
      }
    }
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    if (this.transactionActive) {
      await this.rollbackTransaction();
    }
    await this.pool.end();
  }
}
