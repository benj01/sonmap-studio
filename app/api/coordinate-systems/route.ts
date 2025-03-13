import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { createLogger } from '@/utils/logger';

const SOURCE = 'CoordinateSystemsEndpoint';
const logger = createLogger(SOURCE);

// Add rate limiting for coordinate system requests
const requestCache = new Map<string, number>();
const RATE_LIMIT_MS = 60000; // Only log once per minute per SRID
const DEBUG_MODE = process.env.NODE_ENV === 'development';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const srid = searchParams.get('srid');

  if (!srid) {
    return NextResponse.json(
      { error: 'SRID parameter is required' },
      { status: 400 }
    );
  }

  // Only log in debug mode and respect rate limiting
  if (DEBUG_MODE) {
    const now = Date.now();
    const lastLog = requestCache.get(srid);
    
    if (!lastLog || now - lastLog > RATE_LIMIT_MS) {
      logger.debug('Coordinate system request', { srid });
      requestCache.set(srid, now);
    }
  }

  try {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('spatial_ref_sys')
      .select('srid, auth_name, auth_srid, srtext, proj4text')
      .eq('srid', srid)
      .single();

    if (error) {
      logger.error('Failed to fetch coordinate system', { error, srid });
      return NextResponse.json(
        { error: 'Failed to fetch coordinate system' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Coordinate system not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      srid: data.srid,
      authority: data.auth_name,
      authorityCode: data.auth_srid,
      wkt: data.srtext,
      proj4: data.proj4text
    });
  } catch (error) {
    logger.error('Unexpected error fetching coordinate system', { error, srid });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 