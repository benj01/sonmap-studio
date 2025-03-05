# Coordinate Transformation Analysis

## Overview
After examining the codebase, this document outlines the various places where coordinate transformations occur in the application. The system handles geospatial data from various sources and transforms coordinates between different coordinate systems, with a particular focus on Swiss coordinate systems and WGS84.

## Coordinate Systems Management

### PostGIS Integration
The application leverages PostGIS's `spatial_ref_sys` table for coordinate system definitions. This table contains:
- `srid`: The Spatial Reference ID (e.g., 2056 for Swiss LV95)
- `auth_name`: The authority (usually "EPSG")
- `auth_srid`: The authority's ID for this system
- `srtext`: The Well-Known Text (WKT) representation
- `proj4text`: The proj4 string definition

A new API endpoint (`/api/coordinate-systems`) provides access to these definitions, with client-side caching for improved performance.

### Client-Side Implementation
The application now uses a centralized approach for coordinate system management:

1. **Core Coordinate System Definitions** (`core/coordinates/coordinates.ts`):
```typescript
export const EPSG = {
  WGS84: 4326,
  WEB_MERCATOR: 3857,
  SWISS_LV95: 2056,
  SWISS_LV03: 21781
} as const;

export const COORDINATE_SYSTEMS = {
  NONE: 'none',
  WGS84: `EPSG:${EPSG.WGS84}`,
  SWISS_LV95: `EPSG:${EPSG.SWISS_LV95}`,
  SWISS_LV03: `EPSG:${EPSG.SWISS_LV03}`,
  WEB_MERCATOR: `EPSG:${EPSG.WEB_MERCATOR}`
} as const;
```

2. **Coordinate System Detection** (`core/coordinates/coordinate-detection.ts`):
```typescript
// Coordinate range detection
export const COORDINATE_RANGES = [{
  minX: 2485000, maxX: 2834000,
  minY: 1075000, maxY: 1299000,
  srid: 2056,
  name: 'Swiss LV95'
}];

// WKT pattern detection
export const WKT_PATTERNS = [{
  srid: 2056,
  pattern: /CH1903\+|LV95|EPSG:2056/i,
  name: 'Swiss LV95'
}, /* ... */];

// Fallback detection
export const FALLBACK_PATTERNS = [{
  keywords: ['Switzerland', 'Swiss', 'CH', 'LV95'],
  srid: 2056,
  name: 'Swiss LV95'
}];
```

3. **Dynamic Loading** (`lib/coordinate-systems.ts`):
```typescript
// Fetch and cache coordinate system definitions
export async function getCoordinateSystem(srid: number): Promise<CoordinateSystem>;

// Preload common systems
const COMMON_SRIDS = [
  EPSG.WGS84,
  EPSG.WEB_MERCATOR,
  EPSG.SWISS_LV95,
  EPSG.SWISS_LV03
];
```

## Migration Status

1. **Phase 1** (✓ Completed):
   - Implementation of `/api/coordinate-systems` endpoint
   - Creation of client-side utilities for coordinate system management
   - Client-side caching implementation

2. **Phase 2** (✓ Completed):
   - Replacing hardcoded proj4 strings with dynamic loading in GeoJSON parser
   - Updating Shapefile parser to use the coordinate system service
   - Adding proper error handling and fallbacks
   - Implementing coordinate system detection improvements

3. **Phase 3** (✓ Completed):
   - Removal of hardcoded coordinate system definitions
   - Creation of centralized coordinate system configuration
   - Implementation of flexible coordinate detection system
   - Improved coordinate system management utilities

### Implementation Details

#### Coordinate System Detection
The application now uses a three-tiered approach for detecting coordinate systems:

1. **PRJ/WKT Content Analysis**:
   - Pattern matching against common WKT formats
   - Keyword detection for specific coordinate systems
   - Fallback patterns for ambiguous cases

2. **Coordinate Range Analysis**:
   - Checking coordinate values against known ranges
   - Support for multiple coordinate system ranges
   - Configurable through `COORDINATE_RANGES`

3. **Metadata Analysis**:
   - QGIS metadata file parsing
   - File format specific metadata extraction
   - Default fallback to Swiss LV95 when no system is detected

#### Parser Updates
Both GeoJSON and Shapefile parsers now use:
- Dynamic coordinate system loading from PostGIS
- Improved coordinate system detection
- Proper error handling with meaningful messages
- Client-side caching for better performance

#### Import Process
The import process has been updated to:
1. Detect source coordinate system using the new detection system
2. Transform coordinates to WGS84 during parsing
3. Store features in WGS84 format in PostGIS
4. Maintain original coordinate system information in metadata

## Data Flow
1. **Upload**: User uploads geospatial data (GeoJSON, Shapefile)
2. **Detection**: System detects coordinate system using the new detection utilities
3. **Parsing**: Parser transforms coordinates to WGS84 using dynamically loaded definitions
4. **Preview**: Transformed coordinates are displayed on the MapBox preview map
5. **Import**: Features are stored in PostGIS in WGS84 format
6. **Display**: Features are displayed correctly on the main map

## Summary
The application has successfully transitioned from hardcoded coordinate system definitions to a flexible, maintainable approach using:
- PostGIS's comprehensive coordinate system database
- Centralized coordinate system configuration
- Dynamic coordinate system loading with caching
- Improved coordinate system detection
- Proper error handling and fallbacks

The system maintains strong support for Swiss coordinate systems while being more flexible and maintainable for future additions.