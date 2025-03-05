import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'CoordinateSystemsEndpoint';
const logManager = LogManager.getInstance();

const logger = {
  info: (message: string, data?: any) => {
    console.info(`[${SOURCE}] ${message}`, data);
    logManager.info(SOURCE, message, data);
  },
  error: (message: string, error?: any) => {
    console.error(`[${SOURCE}] ${message}`, error);
    logManager.error(SOURCE, message, error);
  }
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const srid = searchParams.get('srid');

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