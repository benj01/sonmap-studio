import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { dbLogger } from '@/utils/logging/dbLogger';

const LOG_SOURCE = 'feature-terrain-cache';

// Validate required environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  const missingVars = [
    !supabaseUrl && 'SUPABASE_URL',
    !supabaseServiceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY'
  ].filter(Boolean).join(', ');
  
  throw new Error(`Missing required environment variables: ${missingVars}`);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const { feature_id, terrain_source } = req.query;
    if (!feature_id || !terrain_source) {
      await dbLogger.warn('feature-terrain-cache.missingParams', {
        source: LOG_SOURCE,
        params: { feature_id, terrain_source }
      });
      return res.status(400).json({ error: 'feature_id and terrain_source required' });
    }

    try {
      const { data, error } = await supabase
        .from('feature_terrain_cache')
        .select('*')
        .eq('feature_id', feature_id)
        .eq('terrain_source', terrain_source)
        .single();

      if (error || !data) {
        await dbLogger.warn('feature-terrain-cache.notFound', {
          source: LOG_SOURCE,
          error: error?.message,
          params: { feature_id, terrain_source }
        });
        return res.status(404).json({ error: error?.message || 'Not found' });
      }
      
      return res.status(200).json(data);
    } catch (err) {
      await dbLogger.error('feature-terrain-cache.getError', {
        source: LOG_SOURCE,
        error: err instanceof Error ? err : new Error('Unknown error'),
        params: { feature_id, terrain_source }
      });
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'POST') {
    const { feature_id, terrain_source, heights, metadata } = req.body;
    if (!feature_id || !terrain_source || !heights) {
      await dbLogger.warn('feature-terrain-cache.missingFields', {
        source: LOG_SOURCE,
        params: { feature_id, terrain_source, hasHeights: !!heights }
      });
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      const { error } = await supabase
        .from('feature_terrain_cache')
        .upsert([{ feature_id, terrain_source, heights, metadata: metadata || {} }]);

      if (error) {
        await dbLogger.error('feature-terrain-cache.upsertError', {
          source: LOG_SOURCE,
          error,
          params: { feature_id, terrain_source }
        });
        return res.status(500).json({ error: error.message });
      }
      
      return res.status(200).json({ success: true });
    } catch (err) {
      await dbLogger.error('feature-terrain-cache.postError', {
        source: LOG_SOURCE,
        error: err instanceof Error ? err : new Error('Unknown error'),
        params: { feature_id, terrain_source }
      });
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  await dbLogger.warn('feature-terrain-cache.methodNotAllowed', {
    source: LOG_SOURCE,
    method: req.method
  });
  res.status(405).json({ error: 'Method not allowed' });
} 