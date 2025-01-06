import { CoordinateSystem, COORDINATE_SYSTEMS } from '../../../../../types/coordinates';

/**
 * Common WKT projection strings and their corresponding coordinate systems
 */
const PROJECTION_MAP: Record<string, CoordinateSystem> = {
  'PROJCS["CH1903+_LV95"': COORDINATE_SYSTEMS.SWISS_LV95,  // Add this line
  'CH1903+_LV95': COORDINATE_SYSTEMS.SWISS_LV95,           // Add this line
  'CH1903+': COORDINATE_SYSTEMS.SWISS_LV95,
  'CH1903': COORDINATE_SYSTEMS.SWISS_LV03,
  'EPSG:2056': COORDINATE_SYSTEMS.SWISS_LV95,
  'EPSG:21781': COORDINATE_SYSTEMS.SWISS_LV03,
  'PROJCS["CH1903+': COORDINATE_SYSTEMS.SWISS_LV95,
  'PROJCS["CH1903': COORDINATE_SYSTEMS.SWISS_LV03,
  'WGS84': COORDINATE_SYSTEMS.WGS84,
  'EPSG:4326': COORDINATE_SYSTEMS.WGS84,
  'GEOGCS["GCS_WGS_1984"': COORDINATE_SYSTEMS.WGS84
};

/**
 * Handles reading and parsing of PRJ (projection) files
 */
export class PrjReader {
  /**
   * Read and parse PRJ file content to detect coordinate system
   */
  async detectCoordinateSystem(content: string): Promise<CoordinateSystem | null> {
    // Clean up content
    const normalizedContent = content.trim();
    
    // Parse WKT and check for CH1903+_LV95
    const wktInfo = this.parseWKT(normalizedContent);
    if (wktInfo.projection && wktInfo.projection.includes('CH1903+_LV95')) {
      return COORDINATE_SYSTEMS.SWISS_LV95;
    }
    
    // Try partial matches
    for (const [key, value] of Object.entries(PROJECTION_MAP)) {
      if (normalizedContent.includes(key)) {
        return value;
      }
    }
    
    // Try to extract EPSG code
    const epsgMatch = normalizedContent.match(/EPSG[:\[](\d+)/i);
    if (epsgMatch) {
      const epsgCode = epsgMatch[1];
      switch (epsgCode) {
        case '2056':
          return COORDINATE_SYSTEMS.SWISS_LV95;
        case '21781':
          return COORDINATE_SYSTEMS.SWISS_LV03;
        case '4326':
          return COORDINATE_SYSTEMS.WGS84;
      }
    }
    
    // No known coordinate system detected
    return null;
  }

  /**
   * Parse WKT projection string to extract key information
   */
  private parseWKT(wkt: string): Record<string, string> {
    const info: Record<string, string> = {};
    
    // Extract projection name
    const projMatch = wkt.match(/PROJCS\["([^"]+)"/);
    if (projMatch) {
      info.projection = projMatch[1];
    }
    
    // Extract geographic coordinate system
    const geoMatch = wkt.match(/GEOGCS\["([^"]+)"/);
    if (geoMatch) {
      info.geogcs = geoMatch[1];
    }
    
    // Extract datum
    const datumMatch = wkt.match(/DATUM\["([^"]+)"/);
    if (datumMatch) {
      info.datum = datumMatch[1];
    }
    
    // Extract spheroid
    const spheroidMatch = wkt.match(/SPHEROID\["([^"]+)"/);
    if (spheroidMatch) {
      info.spheroid = spheroidMatch[1];
    }
    
    return info;
  }

  /**
   * Read PRJ file content
   */
  async readPrjContent(file: File): Promise<string> {
    return await file.text();
  }
}

// Export singleton instance
export const prjReader = new PrjReader();
