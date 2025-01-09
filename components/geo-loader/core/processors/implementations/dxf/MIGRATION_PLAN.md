 # DXF Processor Migration Plan: GeoJSON to PostGIS

This document outlines the plan for migrating the DXF processor from using GeoJSON as an intermediate format to directly importing into PostGIS.

## Current Architecture Analysis

### Core Components

1. **DXF Parser**
   - Uses 'dxf-parser' npm package
   - DxfParserWrapper handles conversion to internal format
   - Currently converts to GeoJSON before database import

2. **Processing Pipeline**
   ```
   DXF File → DXF Parser → Internal Format → GeoJSON → PostGIS
   ```

3. **File Structure**
   ```
   dxf/
   ├── dxf-processor.ts          # Main processor
   ├── parser.ts                 # Core parsing logic
   ├── types.ts                  # Type definitions
   ├── modules/                  # Core modules
   ├── parsers/                  # Parser implementations
   └── utils/                    # Utility functions
   ```

## Identified Issues

1. **Redundant Code**
   - Multiple entity parsing implementations
   - Duplicate geometry handling
   - Unnecessary GeoJSON conversion step

2. **Performance Impact**
   - Double conversion (DXF → GeoJSON → PostGIS)
   - Memory overhead from intermediate formats

3. **Maintenance Burden**
   - Multiple codepaths for similar functionality
   - Scattered geometry handling logic

## Migration Plan

### 1. Files to Delete

**Redundant/Deprecated Files:**
- parsers/services/geo-json-converter.ts
- utils/entity-parser/ (entire directory)
- utils/geometry/ (entire directory)

**Reason:** These files handle conversion to GeoJSON or duplicate functionality that will be simplified with direct PostGIS conversion.

### 2. Files to Modify

#### database/client.ts
- Update importFeatures method to accept PostGIS geometries:
  ```typescript
  class PostGISClient {
    // Replace
    - async importFeatures(layerId: string, features: any[]): Promise<number>
    + async importFeatures(layerId: string, features: PostGISGeometry[]): Promise<number>

    // Add new methods
    + async createGeometry(wkt: string, srid: number): Promise<void>
    + async transformGeometry(geometry: string, sourceSrid: number, targetSrid: number): Promise<string>
  }
  ```
- Add batch import optimization
- Add SRID transformation support
- Add geometry validation methods

#### dxf-processor.ts
- Remove GeoJSON conversion methods
- Enhance PostGIS import functionality
- Update preview generation to use PostGIS queries

#### parsers/dxf-parser-wrapper.ts
- Add direct PostGIS geometry conversion
- Remove GeoJSON conversion logic
- Enhance error handling for PostGIS operations

#### modules/entity-processor.ts
- Replace GeoJSON types with PostGIS geometry types
- Update entity conversion methods:
  ```typescript
  class DxfEntityProcessor {
    // Replace
    - static entityToFeature(entity: DxfEntity): Feature
    + static entityToPostGIS(entity: DxfEntity): PostGISGeometry
    
    // Replace
    - static entitiesToFeatures(entities: DxfEntity[]): Feature[]
    + static entitiesToPostGIS(entities: DxfEntity[]): PostGISGeometry[]
    
    // Keep but update validation
    static validateEntity(entity: any): entity is DxfEntity
  }
  ```
- Add PostGIS-specific geometry creation:
  ```typescript
  // New methods
  private static createPoint(x: number, y: number): string
  private static createLineString(points: [number, number][]): string
  private static createPolygon(rings: [number, number][][]): string
  private static createCircle(center: [number, number], radius: number): string
  ```
- Update validation rules for PostGIS compatibility
- Add SRID handling for coordinate systems

### 3. Files to Keep

**Essential Components:**
- modules/analyzer.ts (Coordinate system detection)
- modules/coordinate-handler.ts (Coordinate transformations)
- modules/layer-processor.ts (Layer management)
- parsers/entity-parser.ts (Core entity parsing)

**Reason:** These components provide core functionality independent of the storage format.

## Implementation Steps

1. **Phase 1: Cleanup**
   - [x] Remove deprecated GeoJSON converter
   - [x] Remove redundant entity parser
   - [x] Remove unused geometry utilities
   - [x] Update type definitions

2. **Phase 2: PostGIS Integration**
   - [x] Create initial database schema
   - [x] Create PostGIS type definitions with strict typing
   - [x] Update database client with type-safe geometry handling
   - [x] Implement coordinate system handling
   - [x] Add type conversion utilities
   - [x] Modularize coordinate system management
   - [x] Implement type-safe geometry conversion
   - [x] Complete direct geometry conversion
   - [x] Add support for ARC, ELLIPSE, SPLINE entities
   - [x] Add 3D coordinate support
   - [x] Implement BLOCK reference handling
   - [ ] Begin testing phase

   ```typescript
   // types/postgis.ts
   type PostGISGeometryType = 
     | 'POINT'
     | 'LINESTRING'
     | 'POLYGON'
     | 'MULTIPOINT'
     | 'MULTILINESTRING'
     | 'MULTIPOLYGON'
     | 'GEOMETRYCOLLECTION';

   // Coordinate types for different geometry types
   type Point = [number, number];
   type LineString = Point[];
   type Polygon = LineString[];
   type MultiPoint = Point[];
   type MultiLineString = LineString[];
   type MultiPolygon = Polygon[];

   // Base geometry interface
   interface PostGISGeometryBase {
     srid: number;
     wkt: string;
     attributes?: {
       layer?: string;
       lineType?: string;
       color?: number;
       lineWeight?: number;
       [key: string]: unknown;
     };
   }

   // Type-safe geometry interfaces
   interface PostGISPoint extends PostGISGeometryBase {
     type: 'POINT';
     coordinates: Point;
   }

   interface PostGISLineString extends PostGISGeometryBase {
     type: 'LINESTRING';
     coordinates: LineString;
   }

   interface PostGISPolygon extends PostGISGeometryBase {
     type: 'POLYGON';
     coordinates: Polygon;
   }

   interface PostGISMultiPoint extends PostGISGeometryBase {
     type: 'MULTIPOINT';
     coordinates: MultiPoint;
   }

   interface PostGISMultiLineString extends PostGISGeometryBase {
     type: 'MULTILINESTRING';
     coordinates: MultiLineString;
   }

   interface PostGISMultiPolygon extends PostGISGeometryBase {
     type: 'MULTIPOLYGON';
     coordinates: MultiPolygon;
   }

   interface PostGISGeometryCollection extends PostGISGeometryBase {
     type: 'GEOMETRYCOLLECTION';
     geometries: PostGISGeometry[];
   }

   // Union type for all geometry types
   type PostGISGeometry = 
     | PostGISPoint 
     | PostGISLineString 
     | PostGISPolygon 
     | PostGISMultiPoint 
     | PostGISMultiLineString 
     | PostGISMultiPolygon 
     | PostGISGeometryCollection;
   ```

3. **Phase 3: Testing**
   - [ ] Add test data files
   - [ ] Setup test environment
   - [ ] Update parser tests
   - [ ] Add database integration tests
   - [ ] Run performance benchmarks

4. **Phase 4: Documentation**
   - [ ] Update API documentation
   - [ ] Add migration guide
   - [ ] Document new PostGIS features

## Benefits

1. **Performance**
   - Eliminates double conversion
   - Reduces memory usage
   - Faster import process

2. **Maintainability**
   - Single source of truth for geometry handling
   - Clearer code organization
   - Reduced complexity

3. **Reliability**
   - Direct validation against PostGIS
   - Better error handling
   - Consistent data format

## Entity Support

### Supported DXF Entities

1. **Basic Entities**
   - POINT: Direct conversion to PostGIS POINT
   - LINE: Direct conversion to PostGIS LINESTRING
   - POLYLINE/LWPOLYLINE: Converted to LINESTRING or POLYGON based on closed flag
   - CIRCLE: Interpolated to PostGIS POLYGON

2. **Advanced Entities**
   - ARC: Interpolated to PostGIS LINESTRING with configurable segments
   - ELLIPSE: Interpolated to PostGIS POLYGON with configurable segments
   - SPLINE: Interpolated to PostGIS LINESTRING using B-spline basis functions
   - BLOCK: References expanded before conversion

### Coordinate System Support

1. **2D and 3D Coordinates**
   - Full support for x, y coordinates
   - Optional z coordinate support
   - Automatic handling of missing z values
   - Proper WKT formatting for both 2D and 3D points

2. **Coordinate Transformations**
   - Automatic SRID detection and assignment
   - Support for common coordinate systems:
     * WGS84 (SRID: 4326)
     * Swiss LV95 (SRID: 2056)
     * Swiss LV03 (SRID: 21781)
   - Coordinate system validation
   - Automatic transformation between systems

### Entity Conversion Details

1. **ARC Entity**
   ```typescript
   interface ArcData {
     x: number;        // Center X
     y: number;        // Center Y
     z?: number;       // Optional Z coordinate
     radius: number;   // Arc radius
     startAngle: number; // Start angle in degrees
     endAngle: number;   // End angle in degrees
   }
   ```
   - Converted to LINESTRING
   - Interpolated using configurable segments
   - Preserves 3D information if available

2. **ELLIPSE Entity**
   ```typescript
   interface EllipseData {
     x: number;        // Center X
     y: number;        // Center Y
     z?: number;       // Optional Z coordinate
     majorAxis: {      // Major axis vector
       x: number;
       y: number;
     };
     ratio: number;    // Minor/Major axis ratio
   }
   ```
   - Converted to POLYGON
   - Maintains ellipse properties through interpolation
   - Handles rotation via major axis vector

3. **SPLINE Entity**
   ```typescript
   interface SplineData {
     controlPoints: Array<{x: number; y: number; z?: number}>;
     knots?: number[];    // Knot vector
     weights?: number[];  // Control point weights
   }
   ```
   - Converted to LINESTRING
   - Uses B-spline interpolation
   - Supports weighted control points
   - Handles both 2D and 3D control points

4. **BLOCK References**
   - Expanded before conversion
   - Maintains transformation properties:
     * Scale
     * Rotation
     * Translation
   - Preserves nested block structures

## Notes

- Test Data Requirements:
  1. Points: Simple and grouped point entities
  2. Lines: Single lines, polylines, and line patterns
  3. Polygons: Simple and complex polygons with holes
  4. Circles/Arcs: Various radius and angle combinations
  5. Text: Text entities with different properties
  6. Blocks: Nested and referenced block definitions
  7. Layers: Multiple layer configurations
  8. Edge Cases: Invalid geometries, empty layers, large coordinates

- Maintain backward compatibility during migration
- Consider implementing feature flags for gradual rollout
- Monitor performance metrics during migration
- Keep test coverage high

## Status

- [x] Plan Created
- [x] Implementation Started
- [ ] Testing Complete
- [ ] Migration Complete
