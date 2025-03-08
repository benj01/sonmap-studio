import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'CoordinateSystemsEndpoint';
const logManager = LogManager.getInstance();

// Add rate limiting for coordinate system requests
const requestCache = new Map<string, number>();
const RATE_LIMIT_MS = 5000; // Only log once every 5 seconds per SRID

const logger = {
  info: (message: string, data?: any) => {
    const key = `${message}:${JSON.stringify(data)}`;
    const now = Date.now();
    const lastLog = requestCache.get(key);
    
    // Only log if we haven't logged this exact message recently
    if (!lastLog || now - lastLog > RATE_LIMIT_MS) {
      logManager.info(SOURCE, message, data);
      requestCache.set(key, now);
    }
  },
  error: (message: string, error?: any) => {
    console.error(`[${SOURCE}] ${message}`, error);
    logManager.error(SOURCE, message, error);
  }
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const srid = searchParams.get('srid');

  // Only log coordinate system requests in debug mode
  logger.info('Coordinate system request', { srid });

  if (!srid) {
    return NextResponse.json(
      { error: 'SRID parameter is required' },
      { status: 400 }
    );
  }

  try {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('spatial_ref_sys')
      .select('srid, auth_name, auth_srid, srtext, proj4text')
      .eq('srid', srid)
      .single();

    if (error) {
      logger.error('Database error', error);
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
  } catch (error: any) {
    logger.error('Unexpected error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 