/**
 * Configuration for coordinate system detection
 */

/**
 * Coordinate ranges for different coordinate systems
 */
export interface CoordinateRange {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  srid: number;
  name: string;
}

export const COORDINATE_RANGES: CoordinateRange[] = [
  {
    // Swiss LV95
    minX: 2485000,
    maxX: 2834000,
    minY: 1075000,
    maxY: 1299000,
    srid: 2056,
    name: 'Swiss LV95'
  },
  // Add more coordinate ranges here as needed
];

/**
 * WKT patterns for coordinate system detection
 */
export interface WKTPattern {
  srid: number;
  pattern: RegExp;
  name: string;
}

export const WKT_PATTERNS: WKTPattern[] = [
  {
    srid: 2056,
    pattern: /CH1903\+|LV95|EPSG:2056/i,
    name: 'Swiss LV95'
  },
  {
    srid: 21781,
    pattern: /CH1903|LV03|EPSG:21781/i,
    name: 'Swiss LV03'
  },
  {
    srid: 4326,
    pattern: /WGS84|EPSG:4326/i,
    name: 'WGS84'
  },
  {
    srid: 3857,
    pattern: /Web_Mercator|EPSG:3857/i,
    name: 'Web Mercator'
  }
];

/**
 * Keywords for fallback coordinate system detection
 */
export interface FallbackPattern {
  keywords: string[];
  srid: number;
  name: string;
}

export const FALLBACK_PATTERNS: FallbackPattern[] = [
  {
    keywords: ['Switzerland', 'Swiss', 'CH', 'LV95'],
    srid: 2056,
    name: 'Swiss LV95'
  }
];

/**
 * Detect SRID based on coordinate ranges
 */
export function detectSRIDFromCoordinates(x: number, y: number): { srid: number; name: string } | null {
  for (const range of COORDINATE_RANGES) {
    if (x >= range.minX && x <= range.maxX && y >= range.minY && y <= range.maxY) {
      return { srid: range.srid, name: range.name };
    }
  }
  return null;
}

/**
 * Detect SRID from WKT/PRJ content
 */
export function detectSRIDFromWKT(wktContent: string): { srid: number; name: string } | null {
  // Check WKT patterns first
  for (const pattern of WKT_PATTERNS) {
    if (pattern.pattern.test(wktContent)) {
      return { srid: pattern.srid, name: pattern.name };
    }
  }

  // Try fallback patterns if no WKT pattern matches
  for (const fallback of FALLBACK_PATTERNS) {
    if (fallback.keywords.some(keyword => wktContent.includes(keyword))) {
      return { srid: fallback.srid, name: fallback.name };
    }
  }

  return null;
} 