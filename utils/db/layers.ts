import { createClient } from '@/utils/supabase/client';
import type { Database } from '@/types/supabase';
import { dbLogger } from '@/utils/logging/dbLogger';
// import { handleDbError } from '@/utils/errors/dbErrors';

// Type aliases for convenience
export type LayerRow = Database['public']['Tables']['layers']['Row'];
export type LayerInsert = Database['public']['Tables']['layers']['Insert'];
export type LayerUpdate = Database['public']['Tables']['layers']['Update'];

export async function getAllLayers(context?: any) {
  const supabase = createClient();
  await dbLogger.info('getAllLayers: start', undefined, context);
  try {
    const { data, error } = await supabase.from('layers').select('*');
    if (error) throw error;
    await dbLogger.info('getAllLayers: success', { count: data?.length }, context);
    return { data, error: null };
  } catch (error) {
    await dbLogger.error('getAllLayers: failed', { error }, context);
    return { data: null, error };
  }
}

export async function getLayerById(id: string) {
  const supabase = createClient();
  try {
    const { data, error } = await supabase.from('layers').select('*').eq('id', id).single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    // dbLogger.error('getLayerById failed', { error, id });
    // return handleDbError(error);
    return { data: null, error };
  }
}

export async function insertLayer(layer: LayerInsert, context?: any) {
  const supabase = createClient();
  await dbLogger.info('insertLayer: start', { layer }, context);
  try {
    const { data, error } = await supabase.from('layers').insert(layer).select('*').single();
    if (error) throw error;
    await dbLogger.info('insertLayer: success', { data }, context);
    return { data, error: null };
  } catch (error) {
    await dbLogger.error('insertLayer: failed', { error, layer }, context);
    return { data: null, error };
  }
}

export async function updateLayer(id: string, updates: LayerUpdate, context?: any) {
  const supabase = createClient();
  await dbLogger.info('updateLayer: start', { id, updates }, context);
  try {
    const { data, error } = await supabase.from('layers').update(updates).eq('id', id).select('*').single();
    if (error) throw error;
    await dbLogger.info('updateLayer: success', { data }, context);
    return { data, error: null };
  } catch (error) {
    await dbLogger.error('updateLayer: failed', { error, id, updates }, context);
    return { data: null, error };
  }
}

export async function deleteLayer(id: string, context?: any) {
  const supabase = createClient();
  await dbLogger.info('deleteLayer: start', { id }, context);
  try {
    const { data, error } = await supabase.from('layers').delete().eq('id', id).select('*').single();
    if (error) throw error;
    await dbLogger.info('deleteLayer: success', { data }, context);
    return { data, error: null };
  } catch (error) {
    await dbLogger.error('deleteLayer: failed', { error, id }, context);
    return { data: null, error };
  }
}

export async function getLayersByProject(projectId: string) {
  const supabase = createClient();
  try {
    const { data, error } = await supabase.from('layers').select('*').eq('project_id', projectId);
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    // dbLogger.error('getLayersByProject failed', { error, projectId });
    // return handleDbError(error);
    return { data: null, error };
  }
} 