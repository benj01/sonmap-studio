import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const { feature_id, terrain_source } = req.query;
    if (!feature_id || !terrain_source) return res.status(400).json({ error: 'feature_id and terrain_source required' });

    const { data, error } = await supabase
      .from('feature_terrain_cache')
      .select('*')
      .eq('feature_id', feature_id)
      .eq('terrain_source', terrain_source)
      .single();

    if (error || !data) return res.status(404).json({ error: error?.message || 'Not found' });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { feature_id, terrain_source, heights, metadata } = req.body;
    if (!feature_id || !terrain_source || !heights) return res.status(400).json({ error: 'Missing required fields' });

    const { error } = await supabase
      .from('feature_terrain_cache')
      .upsert([{ feature_id, terrain_source, heights, metadata: metadata || {} }]);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
} 