import { NextResponse } from 'next/server';
import axios from 'axios';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'api/coordinates/transform';
const logManager = LogManager.getInstance();

export async function POST(request: Request) {
  try {
    const requestBody = await request.json();
    const { eastingLv95, northingLv95, lhn95Height } = requestBody;
    
    // Generate a unique request ID for tracking
    const requestId = `transform_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    // Log incoming request details
    logManager.info(SOURCE, `Swiss transformation request received ${requestId}`, {
      requestId,
      input: { eastingLv95, northingLv95, lhn95Height }
    });
    
    // Validate input
    if (!eastingLv95 || !northingLv95 || lhn95Height === undefined) {
      logManager.warn(SOURCE, `Invalid transformation request ${requestId} - missing parameters`, {
        requestId,
        parameters: { eastingLv95, northingLv95, lhn95Height }
      });
      
      return NextResponse.json(
        { error: 'Missing required coordinates' },
        { status: 400 }
      );
    }
    
    // First API call: LHN95 to Bessel
    const besselUrl = `https://geodesy.geo.admin.ch/reframe/lhn95tobessel?easting=${eastingLv95}&northing=${northingLv95}&altitude=${lhn95Height}&format=json`;
    
    // Log the first API call
    logManager.debug(SOURCE, `Making first API call to Swiss Reframe (LHN95 to Bessel) ${requestId}`, {
      requestId,
      url: besselUrl,
      input: { eastingLv95, northingLv95, altitude: lhn95Height }
    });
    
    const besselStart = Date.now();
    const besselResponse = await axios.get(besselUrl);
    const besselDuration = Date.now() - besselStart;
    
    // Log the first API response
    logManager.debug(SOURCE, `Received Bessel response ${requestId}`, {
      requestId,
      status: besselResponse.status,
      duration: `${besselDuration}ms`,
      responseData: besselResponse.data
    });
    
    if (besselResponse.status !== 200) {
      logManager.error(SOURCE, `Bessel API failed ${requestId}:`, {
        requestId,
        status: besselResponse.status,
        statusText: besselResponse.statusText,
        url: besselUrl
      });
      
      return NextResponse.json(
        { error: 'Bessel transformation API failed' },
        { status: 502 }
      );
    }
    
    const besselHeight = besselResponse.data.altitude;
    
    if (besselHeight === undefined) {
      logManager.error(SOURCE, `Invalid Bessel API response ${requestId}:`, {
        requestId,
        responseData: besselResponse.data,
        url: besselUrl
      });
      
      return NextResponse.json(
        { error: 'Invalid response from Bessel API' },
        { status: 502 }
      );
    }
    
    // Second API call: LV95 to WGS84
    const wgs84Url = `https://geodesy.geo.admin.ch/reframe/lv95towgs84?easting=${eastingLv95}&northing=${northingLv95}&altitude=${besselHeight}&format=json`;
    
    // Log the second API call
    logManager.debug(SOURCE, `Making second API call to Swiss Reframe (LV95 to WGS84) ${requestId}`, {
      requestId,
      url: wgs84Url,
      input: { eastingLv95, northingLv95, altitude: besselHeight }
    });
    
    const wgs84Start = Date.now();
    const wgs84Response = await axios.get(wgs84Url);
    const wgs84Duration = Date.now() - wgs84Start;
    
    // Log the second API response
    logManager.debug(SOURCE, `Received WGS84 response ${requestId}`, {
      requestId,
      status: wgs84Response.status,
      duration: `${wgs84Duration}ms`,
      responseData: wgs84Response.data
    });
    
    if (wgs84Response.status !== 200) {
      logManager.error(SOURCE, `WGS84 API failed ${requestId}:`, {
        requestId,
        status: wgs84Response.status,
        statusText: wgs84Response.statusText,
        url: wgs84Url
      });
      
      return NextResponse.json(
        { error: 'WGS84 transformation API failed' },
        { status: 502 }
      );
    }
    
    // Extract and format result
    const result = {
      lon: wgs84Response.data.easting,
      lat: wgs84Response.data.northing,
      ell_height: wgs84Response.data.altitude
    };
    
    // Log successful transformation with complete input/output data
    const totalDuration = besselDuration + wgs84Duration;
    logManager.info(SOURCE, `Transformation complete ${requestId}`, {
      requestId,
      input: { eastingLv95, northingLv95, lhn95Height },
      intermediate: { besselHeight },
      output: result,
      duration: {
        total: `${totalDuration}ms`,
        besselCall: `${besselDuration}ms`,
        wgs84Call: `${wgs84Duration}ms`
      }
    });
    
    return NextResponse.json(result);
  } catch (error) {
    // Generate error ID for tracking
    const errorId = `err_${Date.now()}`;
    
    logManager.error(SOURCE, `Coordinate transformation error ${errorId}`, {
      errorId,
      error: error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack
      } : error
    });
    
    return NextResponse.json(
      { error: 'Coordinate transformation failed', errorId },
      { status: 500 }
    );
  }
} 