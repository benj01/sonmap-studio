# Coordinate Transformation Concept

## Overview
This document outlines how coordinate transformations are handled throughout the application, from import to visualization. The system supports multiple coordinate systems with special handling for Swiss coordinate systems.

## Supported Coordinate Systems
```typescript
// From core/coordinates/coordinates.ts
export const EPSG = {
  WGS84: 4326,        // Global latitude/longitude
  WEB_MERCATOR: 3857, // Web mapping projection
  SWISS_LV95: 2056,   // Swiss coordinates, newer system
  SWISS_LV03: 21781   // Swiss coordinates, older system
} as const;
```

## Transformation Flow

### 1. Import Preview
**Files involved:**
- `core/processors/geojson-parser.ts`
- `core/processors/shapefile-parser.ts`

**Process:**
- Only a subset of features (first 50-100) are transformed for preview
- Uses `proj4` library for client-side transformations
- Transforms to WGS84 (EPSG:4326) for visualization
- Preserves original coordinates in source SRID

### 2. Server-Side Import
**Files involved:**
- `supabase/migrations/20250509225800_create_final_import_functions.sql`
- `supabase/functions/transform-coordinates/index.ts`

**Process:**
1. **Geometry Processing:**
   ```sql
   -- Parse geometry and set source SRID
   v_raw_geometry := ST_GeomFromGeoJSON(v_feature->'geometry');
   v_raw_geometry := ST_SetSRID(v_raw_geometry, p_source_srid);
   ```

2. **Transformation:**
   ```sql
   -- Transform to WGS84 for 2D visualization
   v_geometry_2d := ST_Force2D(ST_Transform(v_validated_geometry, 4326));
   ```

3. **Swiss Special Cases:**
   - Uses SwissTopo's official services for height transformations
   - Endpoints:
     - `https://geodesy.geo.admin.ch/reframe/lhn95tobessel`
     - `https://geodesy.geo.admin.ch/reframe/lv95towgs84`

### 3. Database Storage
**Files involved:**
- `supabase/migrations/20250409225649_04_create_core_tables.sql`

**Structure:**
- Original geometry stored in source SRID
- 2D geometry stored in WGS84 (EPSG:4326)
- Coordinate system information in `spatial_ref_sys` table

### 4. Visualization
**Files involved:**
- `core/services/geo-import/processors/coordinate-transformer.ts`
- Various map view components

**Process:**
- Uses WGS84 coordinates for all visualizations
- Transforms coordinates on-the-fly if needed
- Maintains original coordinates for data integrity

## Error Handling

### Client-Side
```typescript
try {
  // Transform coordinates
  result = proj4(`EPSG:${fromSrid}`, `EPSG:${toSrid}`, coords);
} catch (error) {
  logger.warn('Failed to transform coordinates', { error, fromSrid, toSrid });
  throw error;
}
```

### Server-Side
```sql
BEGIN
  v_geometry_2d := ST_Force2D(ST_Transform(v_validated_geometry, 4326));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Exception during ST_Transform: %. Skipping.', SQLERRM;
  v_failed_count := v_failed_count + 1;
  CONTINUE;
END;
```

## Performance Considerations

1. **Batch Processing:**
   - Features processed in batches (default 1000)
   - Reduces memory usage and improves performance

2. **Caching:**
   - Common coordinate systems preloaded
   - PostGIS transformations cached

3. **Selective Transformation:**
   - Only transforms when necessary
   - Preserves original coordinates

## Security

1. **Function Security:**
   - Proper SECURITY DEFINER settings
   - RLS policies in place

2. **Data Validation:**
   - Input validation for all transformations
   - Error handling for invalid coordinates

## Best Practices

1. **Data Integrity:**
   - Always preserve original coordinates
   - Transform only for visualization

2. **Error Handling:**
   - Comprehensive error logging
   - Fallback mechanisms

3. **Performance:**
   - Batch processing
   - Selective transformation
   - Caching where possible

## Future Considerations

1. **Potential Improvements:**
   - Support for more coordinate systems
   - Advanced PostGIS transformations
   - Custom transformation pipelines

2. **Monitoring:**
   - Track transformation performance
   - Monitor error rates
   - Optimize batch sizes 