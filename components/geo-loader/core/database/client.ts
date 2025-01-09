import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';

export class GeoClient {
  private static instance: GeoClient;
  private supabase;

  private constructor() {
    this.supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }

  public static getInstance(): GeoClient {
    if (!GeoClient.instance) {
      GeoClient.instance = new GeoClient();
    }
    return GeoClient.instance;
  }

  public async query<T = any>(
    query: string,
    params?: any[]
  ) {
    return await this.supabase.rpc('postgis_query', {
      query_text: query,
      query_params: params
    });
  }

  public async createFeatureCollection(name: string, description: string, fileType: string, coordinateSystem?: string) {
    return await this.supabase
      .from('feature_collections')
      .insert({
        name,
        description,
        file_type: fileType,
        coordinate_system: coordinateSystem
      })
      .select()
      .single();
  }

  public async createLayer(collectionId: number, name: string, style?: any) {
    return await this.supabase
      .from('layers')
      .insert({
        collection_id: collectionId,
        name,
        style
      })
      .select()
      .single();
  }

  public async insertFeatures(layerId: number, features: any[]) {
    return await this.supabase
      .from('geo_features')
      .insert(
        features.map(f => ({
          layer_id: layerId,
          feature_type: f.geometry.type,
          properties: f.properties,
          geometry: f.geometry
        }))
      );
  }
}

// Export a singleton instance
export const geoClient = GeoClient.getInstance(); 