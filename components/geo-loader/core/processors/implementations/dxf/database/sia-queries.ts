import { Pool, QueryResult } from 'pg';
import { SiaLayer, SiaHeader } from '../types/sia';

/**
 * Interface for SIA layer database record
 */
interface SiaLayerRecord {
  id: number;
  name: string;
  sia_agent: string;
  sia_element: string;
  sia_presentation: string;
  sia_scale?: string;
  sia_phase?: string;
  sia_status?: string;
  sia_location?: string;
  sia_projection?: string;
  sia_free_typing?: any;
  sia_metadata?: any;
}

/**
 * Interface for SIA header database record
 */
interface SiaHeaderRecord {
  id: number;
  file_id: number;
  obj_file: string;
  proj_file: string;
  file_name: string;
  text_file?: string;
  date_file: string;
  ver_file: string;
  agent_file: string;
  ver_sia2014: string;
  custom_keys?: any;
  created_at: Date;
  updated_at: Date;
}

/**
 * Class for handling SIA-related database operations
 */
export class SiaQueries {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Save SIA layer information
   */
  async saveSiaLayer(
    layerId: number,
    siaLayer: SiaLayer
  ): Promise<void> {
    const query = `
      UPDATE dxf_layers
      SET 
        sia_agent = $1,
        sia_element = $2,
        sia_presentation = $3,
        sia_scale = $4,
        sia_phase = $5,
        sia_status = $6,
        sia_location = $7,
        sia_projection = $8,
        sia_free_typing = $9,
        sia_metadata = $10
      WHERE id = $11
    `;

    const values = [
      siaLayer.agent.content,
      siaLayer.element.content,
      siaLayer.presentation.content,
      siaLayer.scale?.content,
      siaLayer.phase?.content,
      siaLayer.status?.content,
      siaLayer.location?.content,
      siaLayer.projection?.content,
      JSON.stringify(siaLayer.freeTyping || []),
      JSON.stringify({
        agent_prefix: siaLayer.agent.prefix,
        element_prefix: siaLayer.element.prefix,
        presentation_prefix: siaLayer.presentation.prefix,
        scale_prefix: siaLayer.scale?.prefix,
        phase_prefix: siaLayer.phase?.prefix,
        status_prefix: siaLayer.status?.prefix,
        location_prefix: siaLayer.location?.prefix,
        projection_prefix: siaLayer.projection?.prefix
      }),
      layerId
    ];

    await this.pool.query(query, values);
  }

  /**
   * Save SIA header information
   */
  async saveSiaHeader(
    fileId: number,
    header: SiaHeader
  ): Promise<number> {
    const query = `
      INSERT INTO dxf_sia_headers (
        file_id,
        obj_file,
        proj_file,
        file_name,
        text_file,
        date_file,
        ver_file,
        agent_file,
        ver_sia2014,
        custom_keys
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `;

    const values = [
      fileId,
      header.OBJFILE,
      header.PROJFILE,
      header.FILE,
      header.TEXTFILE,
      header.DATEFILE,
      header.VERFILE,
      header.AGENTFILE,
      header.VERSIA2014,
      JSON.stringify(Object.entries(header)
        .filter(([key]) => key.startsWith('KEY'))
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {}))
    ];

    const result = await this.pool.query(query, values);
    return result.rows[0].id;
  }

  /**
   * Get SIA layer information
   */
  async getSiaLayer(layerId: number): Promise<SiaLayerRecord | null> {
    const query = `
      SELECT 
        id,
        name,
        sia_agent,
        sia_element,
        sia_presentation,
        sia_scale,
        sia_phase,
        sia_status,
        sia_location,
        sia_projection,
        sia_free_typing,
        sia_metadata
      FROM dxf_layers
      WHERE id = $1
    `;

    const result = await this.pool.query(query, [layerId]);
    return result.rows[0] || null;
  }

  /**
   * Get SIA header information
   */
  async getSiaHeader(fileId: number): Promise<SiaHeaderRecord | null> {
    const query = `
      SELECT *
      FROM dxf_sia_headers
      WHERE file_id = $1
    `;

    const result = await this.pool.query(query, [fileId]);
    return result.rows[0] || null;
  }

  /**
   * Search layers by SIA fields
   */
  async searchSiaLayers(params: {
    agent?: string;
    element?: string;
    presentation?: string;
    scale?: string;
    phase?: string;
    status?: string;
    location?: string;
    projection?: string;
  }): Promise<SiaLayerRecord[]> {
    const query = `
      SELECT * FROM search_sia_layers(
        $1, $2, $3, $4, $5, $6, $7, $8
      )
    `;

    const values = [
      params.agent,
      params.element,
      params.presentation,
      params.scale,
      params.phase,
      params.status,
      params.location,
      params.projection
    ];

    const result = await this.pool.query(query, values);
    return result.rows;
  }

  /**
   * Get all layers for a file with SIA information
   */
  async getFileSiaLayers(fileId: number): Promise<SiaLayerRecord[]> {
    const query = `
      SELECT 
        l.*,
        h.obj_file,
        h.proj_file,
        h.ver_sia2014,
        h.custom_keys
      FROM dxf_layers l
      LEFT JOIN dxf_files f ON l.file_id = f.id
      LEFT JOIN dxf_sia_headers h ON f.id = h.file_id
      WHERE f.id = $1
    `;

    const result = await this.pool.query(query, [fileId]);
    return result.rows;
  }

  /**
   * Update SIA metadata for a layer
   */
  async updateSiaMetadata(
    layerId: number,
    metadata: Record<string, any>
  ): Promise<void> {
    const query = `
      UPDATE dxf_layers
      SET sia_metadata = sia_metadata || $1::jsonb
      WHERE id = $2
    `;

    await this.pool.query(query, [JSON.stringify(metadata), layerId]);
  }

  /**
   * Delete SIA information for a layer
   */
  async deleteSiaLayer(layerId: number): Promise<void> {
    const query = `
      UPDATE dxf_layers
      SET 
        sia_agent = NULL,
        sia_element = NULL,
        sia_presentation = NULL,
        sia_scale = NULL,
        sia_phase = NULL,
        sia_status = NULL,
        sia_location = NULL,
        sia_projection = NULL,
        sia_free_typing = NULL,
        sia_metadata = NULL
      WHERE id = $1
    `;

    await this.pool.query(query, [layerId]);
  }

  /**
   * Delete SIA header for a file
   */
  async deleteSiaHeader(fileId: number): Promise<void> {
    const query = `
      DELETE FROM dxf_sia_headers
      WHERE file_id = $1
    `;

    await this.pool.query(query, [fileId]);
  }
} 