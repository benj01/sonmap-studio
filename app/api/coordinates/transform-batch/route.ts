import { NextResponse } from 'next/server';
import axios from 'axios';

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
async function transformSingleCoordinate(coordinate: CoordinateInput): Promise<TransformResponse> {
  try {
    const { eastingLv95, northingLv95, lhn95Height } = coordinate;
    
    // First API call: LHN95 to Bessel
    const besselUrl = `https://geodesy.geo.admin.ch/reframe/lhn95tobessel?easting=${eastingLv95}&northing=${northingLv95}&altitude=${lhn95Height}&format=json`;
    const besselResponse = await axios.get(besselUrl);
    
    if (besselResponse.status !== 200) {
      throw new Error(`Bessel API failed: ${besselResponse.statusText}`);
    }
    
    const besselHeight = besselResponse.data.altitude;
    
    if (besselHeight === undefined) {
      throw new Error('Bessel API missing altitude in response');
    }
    
    // Second API call: LV95 to WGS84
    const wgs84Url = `https://geodesy.geo.admin.ch/reframe/lv95towgs84?easting=${eastingLv95}&northing=${northingLv95}&altitude=${besselHeight}&format=json`;
    const wgs84Response = await axios.get(wgs84Url);
    
    if (wgs84Response.status !== 200) {
      throw new Error(`WGS84 API failed: ${wgs84Response.statusText}`);
    }
    
    // Extract and format result
    const result = {
      lon: wgs84Response.data.easting,
      lat: wgs84Response.data.northing,
      ell_height: wgs84Response.data.altitude
    };
    
    return {
      input: coordinate,
      result
    };
  } catch (error) {
    console.error('Coordinate transformation error:', error);
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
  try {
    const { coordinates } = await request.json();
    
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length === 0) {
      return NextResponse.json(
        { error: 'Invalid or empty coordinates array' },
        { status: 400 }
      );
    }
    
    // Limit batch size to prevent overloading
    const MAX_BATCH_SIZE = 100;
    if (coordinates.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE}` },
        { status: 400 }
      );
    }
    
    // Process each coordinate
    const results = await Promise.all(
      coordinates.map(async (coord: CoordinateInput) => {
        const { eastingLv95, northingLv95, lhn95Height } = coord;
        
        // Validate input
        if (!eastingLv95 || !northingLv95 || lhn95Height === undefined) {
          return { 
            input: coord,
            error: 'Invalid coordinate - missing required values' 
          };
        }
        
        // Transform the coordinate
        return await transformSingleCoordinate(coord);
      })
    );
    
    // Generate summary statistics
    const successCount = results.filter(r => r.result).length;
    const failureCount = results.filter(r => r.error).length;
    
    return NextResponse.json({
      results,
      summary: {
        total: coordinates.length,
        success: successCount,
        failed: failureCount
      }
    });
  } catch (error) {
    console.error('Batch coordinate transformation error:', error);
    return NextResponse.json(
      { error: 'Batch transformation failed' },
      { status: 500 }
    );
  }
} 