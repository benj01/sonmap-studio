import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { feature_id, geometry, terrain_source } = req.body;
  if (!feature_id || !geometry || !terrain_source) return res.status(400).json({ error: 'Missing required fields' });

  // 1. Extract coordinates (assume Polygon for now)
  const coords = geometry?.coordinates?.[0];
  if (!coords || !Array.isArray(coords)) return res.status(400).json({ error: 'Invalid geometry' });

  // 2. Sample terrain heights (stub: set all heights to 0)
  const heights = coords.map(() => 0); // Replace with real sampling logic

  // 3. Cache the result by calling the POST endpoint
  await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/feature-terrain-cache`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feature_id, terrain_source, heights }),
  });

  // 4. Return the heights
  return res.status(200).json({ heights });
} 