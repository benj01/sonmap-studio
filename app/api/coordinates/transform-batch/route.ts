import { NextResponse } from 'next/server';
import axios from 'axios';
import { dbLogger } from '@/utils/logging/dbLogger';
import { v4 as uuidv4 } from 'uuid';

interface CoordinateInput {
  eastingLv95: number;
  northingLv95: number;
  lhn95Height: number;
  id?: string | number; // Optional identifier for tracking
}

interface TransformResult {
  lon: number;
  lat: number;
  ell_height: number;
}

interface TransformResponse {
  input: CoordinateInput;
  result?: TransformResult;
  error?: string;
}

/**
 * Transforms a single coordinate from LV95 to WGS84
 */
async function transformSingleCoordinate(coordinate: CoordinateInput, requestId: string): Promise<TransformResponse> {
  try {
    const { eastingLv95, northingLv95, lhn95Height } = coordinate;
    await dbLogger.info('Starting single coordinate transformation', { requestId, coordinate });
    // First API call: LHN95 to Bessel
    const besselUrl = `https://geodesy.geo.admin.ch/reframe/lhn95tobessel?easting=${eastingLv95}&northing=${northingLv95}&altitude=${lhn95Height}&format=json`;
    const besselResponse = await axios.get(besselUrl);
    if (besselResponse.status !== 200) {
      await dbLogger.error('Bessel API failed', { requestId, coordinate, status: besselResponse.status, statusText: besselResponse.statusText });
      throw new Error(`Bessel API failed: ${besselResponse.statusText}`);
    }
    const besselHeight = besselResponse.data.altitude;
    if (besselHeight === undefined) {
      await dbLogger.error('Bessel API missing altitude in response', { requestId, coordinate, response: besselResponse.data });
      throw new Error('Bessel API missing altitude in response');
    }
    // Second API call: LV95 to WGS84
    const wgs84Url = `https://geodesy.geo.admin.ch/reframe/lv95towgs84?easting=${eastingLv95}&northing=${northingLv95}&altitude=${besselHeight}&format=json`;
    const wgs84Response = await axios.get(wgs84Url);
    if (wgs84Response.status !== 200) {
      await dbLogger.error('WGS84 API failed', { requestId, coordinate, status: wgs84Response.status, statusText: wgs84Response.statusText });
      throw new Error(`WGS84 API failed: ${wgs84Response.statusText}`);
    }
    // Extract and format result
    const result: TransformResult = {
      lon: wgs84Response.data.easting,
      lat: wgs84Response.data.northing,
      ell_height: wgs84Response.data.altitude
    };
    await dbLogger.info('Coordinate transformation successful', { requestId, coordinate, result });
    return {
      input: coordinate,
      result
    };
  } catch (error) {
    await dbLogger.error('Coordinate transformation error', {
      requestId,
      coordinate,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return {
      input: coordinate,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Batch endpoint for transforming multiple coordinates
 */
export async function POST(request: Request) {
  const requestId = uuidv4();
  try {
    await dbLogger.info('Received batch coordinate transformation request', { requestId });
    const { coordinates }: { coordinates: CoordinateInput[] } = await request.json();
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length === 0) {
      await dbLogger.warn('Invalid or empty coordinates array', { requestId, coordinates });
      return NextResponse.json(
        { error: 'Invalid or empty coordinates array' },
        { status: 400 }
      );
    }
    // Limit batch size to prevent overloading
    const MAX_BATCH_SIZE = 100;
    if (coordinates.length > MAX_BATCH_SIZE) {
      await dbLogger.warn('Batch size exceeds maximum', { requestId, batchSize: coordinates.length });
      return NextResponse.json(
        { error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE}` },
        { status: 400 }
      );
    }
    // Process each coordinate
    const results: TransformResponse[] = await Promise.all(
      coordinates.map(async (coord: CoordinateInput) => {
        const { eastingLv95, northingLv95, lhn95Height } = coord;
        // Validate input
        if (typeof eastingLv95 !== 'number' || typeof northingLv95 !== 'number' || typeof lhn95Height !== 'number') {
          await dbLogger.warn('Invalid coordinate - missing required values', { requestId, coord });
          return {
            input: coord,
            error: 'Invalid coordinate - missing required values'
          };
        }
        // Transform the coordinate
        return await transformSingleCoordinate(coord, requestId);
      })
    );
    // Generate summary statistics
    const successCount = results.filter(r => r.result).length;
    const failureCount = results.filter(r => r.error).length;
    await dbLogger.info('Batch transformation complete', { requestId, total: coordinates.length, success: successCount, failed: failureCount });
    return NextResponse.json({
      results,
      summary: {
        total: coordinates.length,
        success: successCount,
        failed: failureCount
      }
    });
  } catch (error) {
    await dbLogger.error('Batch coordinate transformation error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(
      { error: 'Batch transformation failed: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
} 