import { createClient } from '@/utils/supabase/client';
import type { Database } from '@/types/supabase';
import { dbLogger } from '@/utils/logging/dbLogger';
// import { handleDbError } from '@/utils/errors/dbErrors';

// Type aliases for convenience
export type LayerRow = Database['public']['Tables']['layers']['Row'];
export type LayerInsert = Database['public']['Tables']['layers']['Insert'];
export type LayerUpdate = Database['public']['Tables']['layers']['Update'];

// Type for structured logging context
export type DbLoggerContext = {
  userId?: string;
  requestId?: string;
  importLogId?: string;
  [key: string]: unknown;
};

export async function getAllLayers(context?: DbLoggerContext): Promise<{ data: LayerRow[] | null; error: Error | null }> {
  const supabase = createClient();
  await dbLogger.info('getAllLayers: start', undefined, { ...(context || {}), source: 'DbLayers' });
  try {
    const { data, error } = await supabase.from('layers').select('*');
    if (error) throw error;
    await dbLogger.info('getAllLayers: success', { count: data?.length }, { ...(context || {}), source: 'DbLayers' });
    return { data, error: null };
  } catch (error: unknown) {
    await dbLogger.error('getAllLayers: failed', { error: error instanceof Error ? error.message : error }, { ...(context || {}), source: 'DbLayers' });
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

export async function getLayerById(id: string): Promise<{ data: LayerRow | null; error: Error | null }> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase.from('layers').select('*').eq('id', id).single();
    if (error) throw error;
    return { data, error: null };
  } catch (error: unknown) {
    // No dbLogger call here, but if you want to add, uncomment and use:
    // await dbLogger.error('getLayerById failed', { error: error instanceof Error ? error.message : error, id }, { source: 'DbLayers' });
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

export async function insertLayer(layer: LayerInsert, context?: DbLoggerContext): Promise<{ data: LayerRow | null; error: Error | null }> {
  const supabase = createClient();
  await dbLogger.info('insertLayer: start', { layer }, { ...(context || {}), source: 'DbLayers' });
  try {
    const { data, error } = await supabase.from('layers').insert(layer).select('*').single();
    if (error) throw error;
    await dbLogger.info('insertLayer: success', { data }, { ...(context || {}), source: 'DbLayers' });
    return { data, error: null };
  } catch (error: unknown) {
    await dbLogger.error('insertLayer: failed', { error: error instanceof Error ? error.message : error, layer }, { ...(context || {}), source: 'DbLayers' });
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

export async function updateLayer(id: string, updates: LayerUpdate, context?: DbLoggerContext): Promise<{ data: LayerRow | null; error: Error | null }> {
  const supabase = createClient();
  await dbLogger.info('updateLayer: start', { id, updates }, { ...(context || {}), source: 'DbLayers' });
  try {
    const { data, error } = await supabase.from('layers').update(updates).eq('id', id).select('*').single();
    if (error) throw error;
    await dbLogger.info('updateLayer: success', { data }, { ...(context || {}), source: 'DbLayers' });
    return { data, error: null };
  } catch (error: unknown) {
    await dbLogger.error('updateLayer: failed', { error: error instanceof Error ? error.message : error, id, updates }, { ...(context || {}), source: 'DbLayers' });
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

export async function deleteLayer(id: string, context?: DbLoggerContext): Promise<{ data: LayerRow | null; error: Error | null }> {
  const supabase = createClient();
  await dbLogger.info('deleteLayer: start', { id }, { ...(context || {}), source: 'DbLayers' });
  try {
    const { data, error } = await supabase.from('layers').delete().eq('id', id).select('*').single();
    if (error) throw error;
    await dbLogger.info('deleteLayer: success', { data }, { ...(context || {}), source: 'DbLayers' });
    return { data, error: null };
  } catch (error: unknown) {
    await dbLogger.error('deleteLayer: failed', { error: error instanceof Error ? error.message : error, id }, { ...(context || {}), source: 'DbLayers' });
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

export async function getLayersByProject(projectId: string): Promise<{ data: LayerRow[] | null; error: Error | null }> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase.from('layers').select('*').eq('project_id', projectId);
    if (error) throw error;
    return { data, error: null };
  } catch (error: unknown) {
    // No dbLogger call here, but if you want to add, uncomment and use:
    // await dbLogger.error('getLayersByProject failed', { error: error instanceof Error ? error.message : error, projectId }, { source: 'DbLayers' });
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
  }
} 