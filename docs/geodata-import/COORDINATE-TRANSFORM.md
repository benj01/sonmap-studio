# Coordinate Transformation Analysis

## Overview
After examining the codebase, this document outlines the various places where coordinate transformations occur in the application. The system handles geospatial data from various sources and transforms coordinates between different coordinate systems, with a particular focus on Swiss coordinate systems and WGS84.

## Coordinate Systems Defined
The application defines several coordinate systems in `core/coordinates/coordinates.ts`:

```typescript
export const COORDINATE_SYSTEMS = {
  /** No specific coordinate system (treated as WGS84) */
  NONE: 'none',
  /** WGS84 (EPSG:4326) - Global latitude/longitude */
  WGS84: 'EPSG:4326',
  /** Swiss LV95 (EPSG:2056) - Swiss coordinates, newer system */
  SWISS_LV95: 'EPSG:2056',
  /** Swiss LV03 (EPSG:21781) - Swiss coordinates, older system */
  SWISS_LV03: 'EPSG:21781',
  /** Web Mercator (EPSG:3857) - Web mapping projection */
  WEB_MERCATOR: 'EPSG:3857'
} as const;
```

## Transformation Locations

### 1. GeoJSON Parser (`core/processors/geojson-parser.ts`)
The GeoJSON parser transforms coordinates during the parsing process:

- **Definition**: Line 10 defines the Swiss LV95 coordinate system (EPSG:2056) using proj4
- **Transformation functions**:
  - `transformCoordinates()` (lines 58-65): transforms individual coordinate pairs
  - `transformGeometry()` (lines 70-108): transforms entire geometries based on their type
- **Transformation Process** (lines 216-232):
  - If a source CRS is detected, transforms from that CRS to WGS84
  - If no CRS is found, assumes Swiss coordinates (CH1903+/LV95) and transforms using a hardcoded proj4 string

### 2. Shapefile Parser (`core/processors/shapefile-parser.ts`)
Similar to the GeoJSON parser, the Shapefile parser handles coordinate transformations:

- **Definition**: Line 9 defines EPSG:2056
- **Transformation functions**:
  - `transformCoordinates()` (lines 37-54): transforms coordinates from a specified SRID to WGS84
  - `transformGeometry()` (lines 59-102): handles different geometry types
- **SRID Detection**: Lines 216-230 attempt to detect Swiss coordinates based on value ranges
- **Coordinate Transformation**: Lines 232-240 transform coordinates if a valid SRID is detected

### 3. GeoImport Dialog (`components/geo-import/components/geo-import-dialog.tsx`)
During the import process:

- Lines 202-225 handle the coordinate transformation process where coordinates are sent to PostGIS
- Import parameters (lines 203-214) include:
  - `p_source_srid`: The source SRID (defaults to 2056 if not specified)
  - `p_target_srid`: The target SRID (hardcoded to 4326, which is WGS84)

### 4. Map Preview (`components/geo-import/components/map-preview.tsx`)
The map preview component uses transformed coordinates to display features on a MapBox map, handling bounds calculation and map fitting.

## Hardcoded Values
Several coordinate system definitions and transformations are hardcoded:

1. **Swiss LV95 (EPSG:2056)** appears in multiple locations:
   - `geojson-parser.ts` (line 10)
   - `shapefile-parser.ts` (line 9)
   - Default fallback in `geojson-parser.ts` (line 226)
   - Default SRID in `geo-import-dialog.tsx` (line 212)

2. **Target SRID** is hardcoded to 4326 (WGS84) in `geo-import-dialog.tsx` (line 213)

3. **Swiss coordinate detection** uses hardcoded ranges in `shapefile-parser.ts` (line 224):
```typescript
if (x >= 2485000 && x <= 2834000 && y >= 1075000 && y <= 1299000) {
  this.logger.info('Detected Swiss coordinates based on coordinate ranges', { x, y });
  this.srid = 2056;
}
```

## Data Flow
1. **Upload**: User uploads geospatial data (GeoJSON, Shapefile)
2. **Parsing**: The appropriate parser detects the coordinate system and transforms coordinates to WGS84 for preview
3. **Preview**: Transformed coordinates are displayed on the MapBox preview map
4. **Import**: During actual import, the original geometries are sent to PostGIS along with source and target SRIDs
5. **Storage**: PostGIS performs the final transformation and stores the data in the database

## Summary
Coordinate transformations occur in two main places:
- During initial parsing for preview (client-side using proj4.js)
- During final import to the database (server-side using PostGIS)

The system has a strong bias toward Swiss coordinate systems, with EPSG:2056 (Swiss LV95) being the default assumption when no coordinate system is specified. The target coordinate system is consistently WGS84 (EPSG:4326).