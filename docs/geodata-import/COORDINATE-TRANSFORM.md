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
The application defines coordinate systems in two ways:

1. **Static Definitions** (Legacy)
In `core/coordinates/coordinates.ts`:
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

2. **Dynamic Loading** (New)
Using the new coordinate system service:
```typescript
import { getCoordinateSystem } from '@/lib/coordinate-systems';

// Fetch coordinate system definition
const coordSystem = await getCoordinateSystem(2056);
// Use with proj4js
proj4.defs(coordSystem.srid.toString(), coordSystem.proj4);
```

## Migration Plan
The application is transitioning from hardcoded coordinate system definitions to dynamic loading from PostGIS. The migration involves:

1. **Phase 1** (✓ Completed):
   - Implementation of `/api/coordinate-systems` endpoint
   - Creation of client-side utilities for coordinate system management
   - Client-side caching implementation

2. **Phase 2** (✓ Completed):
   - Replacing hardcoded proj4 strings with dynamic loading in GeoJSON parser
   - Updating Shapefile parser to use the coordinate system service
   - Adding proper error handling and fallbacks
   - Implementing coordinate system detection improvements

3. **Phase 3** (In Progress):
   - Removal of remaining hardcoded coordinate system definitions
   - Testing with various coordinate systems
   - Performance monitoring and optimization
   - Documentation updates

### Implementation Details

#### API Endpoint
The new `/api/coordinate-systems` endpoint provides access to PostGIS's spatial reference system definitions:
```typescript
// Example response for SRID 2056 (Swiss LV95)
{
  "srid": 2056,
  "authority": "EPSG",
  "authorityCode": 2056,
  "wkt": "PROJCS[\"CH1903+ / LV95\",...",
  "proj4": "+proj=somerc +lat_0=46.95240555555556 ..."
}
```

#### Client-Side Utilities
New coordinate system management utilities in `lib/coordinate-systems.ts`:
```typescript
// Fetch coordinate system with caching
const coordSystem = await getCoordinateSystem(2056);
// Use with proj4js
proj4.defs(coordSystem.srid.toString(), coordSystem.proj4);

// Preload commonly used systems
await preloadCommonCoordinateSystems();
```

#### Parser Updates
Both GeoJSON and Shapefile parsers now use dynamic coordinate system loading:
- Improved coordinate system detection from PRJ files and coordinate ranges
- Fallback to Swiss LV95 (EPSG:2056) when no system is detected
- Proper error handling with meaningful messages
- Client-side caching to improve performance

## Transformation Locations

### 1. GeoJSON Parser (`core/processors/geojson-parser.ts`)
The GeoJSON parser transforms coordinates during the parsing process:

- **Definition**: Uses dynamic coordinate system loading from PostGIS
- **Transformation functions**:
  - `transformCoordinates()`: transforms individual coordinate pairs using proj4js
  - `transformGeometry()`: transforms entire geometries based on their type
- **Transformation Process**:
  - If a source CRS is detected, transforms from that CRS to WGS84
  - If no CRS is found, assumes Swiss coordinates (CH1903+/LV95)

### 2. Shapefile Parser (`core/processors/shapefile-parser.ts`)
Similar to the GeoJSON parser, the Shapefile parser handles coordinate transformations:

- **Definition**: Uses dynamic coordinate system loading from PostGIS
- **Transformation functions**:
  - `transformCoordinates()`: transforms coordinates from a specified SRID to WGS84
  - `transformGeometry()`: handles different geometry types
- **SRID Detection**: Attempts to detect coordinate system from:
  1. PRJ file content
  2. Coordinate value ranges
  3. Fallback to Swiss LV95
- **Coordinate Transformation**: Transforms coordinates if a valid SRID is detected

### 3. GeoImport Dialog (`components/geo-import/components/geo-import-dialog.tsx`)
During the import process:

- Lines 202-225 handle the coordinate transformation process where coordinates are sent to PostGIS
- Import parameters (lines 203-214) include:
  - `p_source_srid`: The source SRID (defaults to 2056 if not specified)
  - `p_target_srid`: The target SRID (hardcoded to 4326, which is WGS84)

### 4. Map Preview (`components/geo-import/components/map-preview.tsx`)
The map preview component uses transformed coordinates to display features on a MapBox map, handling bounds calculation and map fitting.

## Data Flow
1. **Upload**: User uploads geospatial data (GeoJSON, Shapefile)
2. **Parsing**: The appropriate parser detects the coordinate system and transforms coordinates to WGS84 for preview
3. **Preview**: Transformed coordinates are displayed on the MapBox preview map
4. **Import**: During actual import, the original geometries are sent to PostGIS along with source and target SRIDs
5. **Storage**: PostGIS performs the final transformation and stores the data in the database

## Summary
The application has successfully transitioned from hardcoded coordinate system definitions to a more flexible approach using PostGIS's comprehensive coordinate system database. This change makes the application more maintainable and capable of handling a wider range of coordinate systems. The implementation includes:

- Dynamic coordinate system loading from PostGIS
- Client-side caching for improved performance
- Improved coordinate system detection
- Proper error handling and fallbacks
- Comprehensive documentation

The system maintains its strong support for Swiss coordinate systems while being more flexible and maintainable for future additions.