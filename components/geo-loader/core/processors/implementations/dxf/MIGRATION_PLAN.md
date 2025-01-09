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
   - [ ] Remove deprecated GeoJSON converter
   - [ ] Remove redundant entity parser
   - [ ] Remove unused geometry utilities
   - [ ] Update type definitions

2. **Phase 2: PostGIS Integration**
   - [ ] Create initial database schema
   ```sql
   -- migrations/001_initial_schema.sql
   -- Enable PostGIS extension
   CREATE EXTENSION IF NOT EXISTS postgis;

   -- Feature collections table
   CREATE TABLE feature_collections (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     name TEXT NOT NULL,
     description TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );

   -- Layers table
   CREATE TABLE layers (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     collection_id UUID NOT NULL REFERENCES feature_collections(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     type TEXT NOT NULL,
     properties JSONB DEFAULT '{}',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );

   -- Geo features table with PostGIS geometry
   CREATE TABLE geo_features (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     layer_id UUID NOT NULL REFERENCES layers(id) ON DELETE CASCADE,
     geometry GEOMETRY NOT NULL,
     properties JSONB DEFAULT '{}',
     srid INTEGER NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT valid_geometry CHECK (ST_IsValid(geometry))
   );

   -- Indexes for better query performance
   CREATE INDEX geo_features_layer_id_idx ON geo_features(layer_id);
   CREATE INDEX geo_features_geometry_idx ON geo_features USING GIST(geometry);
   CREATE INDEX layers_collection_id_idx ON layers(collection_id);

   -- Update timestamp triggers
   CREATE OR REPLACE FUNCTION update_updated_at()
   RETURNS TRIGGER AS $$
   BEGIN
     NEW.updated_at = NOW();
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;

   CREATE TRIGGER update_feature_collections_updated_at
     BEFORE UPDATE ON feature_collections
     FOR EACH ROW EXECUTE FUNCTION update_updated_at();

   CREATE TRIGGER update_layers_updated_at
     BEFORE UPDATE ON layers
     FOR EACH ROW EXECUTE FUNCTION update_updated_at();

   CREATE TRIGGER update_geo_features_updated_at
     BEFORE UPDATE ON geo_features
     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
   ```
   - [ ] Create PostGIS geometry type definitions
   ```typescript
   // types/postgis.ts
   interface PostGISGeometry {
     srid: number;
     type: 'POINT' | 'LINESTRING' | 'POLYGON' | 'MULTIPOLYGON';
     coordinates: string; // WKT format
   }
   ```
   - [ ] Implement direct PostGIS geometry conversion
   - [ ] Add SRID management and validation
   - [ ] Update preview generation to use PostGIS queries
   - [ ] Implement efficient batch import strategies

3. **Phase 3: Testing**
   - [ ] Add test data files
     ```
     test-data/dxf/
     ├── testlinie.dxf           # Existing test file
     ├── points.dxf              # Point entities test
     ├── polylines.dxf           # LineString/Polygon test
     ├── circles.dxf             # Circular geometry test
     ├── mixed.dxf              # Mixed geometry types
     ├── large.dxf              # Performance testing
     └── invalid.dxf            # Error handling test
     ```

   - [ ] Update test environment
     ```typescript
     // __tests__/setup.ts
     import { Pool } from 'pg';
     
     export const testPool = new Pool({
       database: 'test_geo_db',
       // ... test configuration
     });
     
     beforeAll(async () => {
       // Setup test database
       await testPool.query(`
         CREATE EXTENSION IF NOT EXISTS postgis;
         -- Additional setup
       `);
     });
     
     afterAll(async () => {
       await testPool.end();
     });
     ```
   
   - [ ] Update parser tests
     ```typescript
     // __tests__/parser.test.ts
     describe('PostGIS Integration', () => {
       it('should convert DXF entities to PostGIS geometries', async () => {
         const entity = // ... test entity
         const geometry = await processor.entityToPostGIS(entity);
         expect(geometry.type).toBe('LINESTRING');
         expect(geometry.srid).toBeDefined();
       });
     
       it('should validate PostGIS geometries', async () => {
         // Test geometry validation
       });
     
       it('should handle coordinate transformations', async () => {
         // Test SRID transformations
       });
     });
     ```
   
   - [ ] Add database integration tests
     ```typescript
     // __tests__/database.test.ts
     describe('Database Operations', () => {
       it('should import features in batches', async () => {
         // Test batch import
       });
     
       it('should handle large datasets', async () => {
         // Test performance with large files
       });
     
       it('should maintain data integrity', async () => {
         // Test constraints and validation
       });
     });
     ```
   
   - [ ] Performance benchmarks
     ```typescript
     // __tests__/benchmarks.test.ts
     describe('Performance Tests', () => {
       it('should meet import speed requirements', async () => {
         const startTime = Date.now();
         // Test import performance
         const duration = Date.now() - startTime;
         expect(duration).toBeLessThan(IMPORT_TIMEOUT);
       });
     });
     ```

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
- [ ] Implementation Started
- [ ] Testing Complete
- [ ] Migration Complete
