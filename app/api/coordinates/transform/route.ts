import { NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request: Request) {
  try {
    const { eastingLv95, northingLv95, lhn95Height } = await request.json();
    
    // Validate input
    if (!eastingLv95 || !northingLv95 || lhn95Height === undefined) {
      return NextResponse.json(
        { error: 'Missing required coordinates' },
        { status: 400 }
      );
    }
    
    // First API call: LHN95 to Bessel
    const besselUrl = `https://geodesy.geo.admin.ch/reframe/lhn95tobessel?easting=${eastingLv95}&northing=${northingLv95}&altitude=${lhn95Height}&format=json`;
    const besselResponse = await axios.get(besselUrl);
    
    if (besselResponse.status !== 200) {
      console.error('Bessel API failed:', besselResponse.statusText);
      return NextResponse.json(
        { error: 'Bessel transformation API failed' },
        { status: 502 }
      );
    }
    
    const besselHeight = besselResponse.data.altitude;
    
    if (besselHeight === undefined) {
      console.error('Bessel API missing altitude in response:', besselResponse.data);
      return NextResponse.json(
        { error: 'Invalid response from Bessel API' },
        { status: 502 }
      );
    }
    
    // Second API call: LV95 to WGS84
    const wgs84Url = `https://geodesy.geo.admin.ch/reframe/lv95towgs84?easting=${eastingLv95}&northing=${northingLv95}&altitude=${besselHeight}&format=json`;
    const wgs84Response = await axios.get(wgs84Url);
    
    if (wgs84Response.status !== 200) {
      console.error('WGS84 API failed:', wgs84Response.statusText);
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
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Coordinate transformation error:', error);
    return NextResponse.json(
      { error: 'Coordinate transformation failed' },
      { status: 500 }
    );
  }
} 