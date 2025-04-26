# 3D Geometry Support

## Overview

This document outlines the implementation of full 3D geometry support in Sonmap Studio. The system now preserves Z coordinates from source data while maintaining efficient 2D geometries for spatial operations.

## Database Schema Enhancement

The `geo_features` table has been enhanced with a new column:

| Column | Type | Description |
|--------|------|-------------|
| `geometry_3d` | geometry(GeometryZ, 4326) | The WGS84 3D geometry with Z coordinates preserved |

This column complements the existing `geometry_2d` column, which stores the 2D projection for efficient querying and rendering.

## Key Components

### Database Functions

1. **transform_and_store_geometries**
   - Handles coordinate transformation from source CRS to WGS84
   - Creates both 2D and 3D versions of geometries
   - Returns both geometries for insertion

2. **get_layer_features_geojson** and **get_layer_features**
   - Updated to prioritize `geometry_3d` when available
   - Falls back to `geometry_2d` when 3D geometry isn't available

3. **import_geo_features_with_transform** and **import_single_feature**
   - Updated to store both 2D and 3D geometries
   - Properly extracts and preserves height information

### Z-Coordinate Detection

The Z-coordinate detection algorithm has been improved to:

1. Prioritize LV95 stored heights in properties
2. Check for Z values in 3D geometries
3. Provide more accurate detection for Swiss coordinates
4. Handle special cases like MultiPolygonZ and LineStringZ

## Benefits

This implementation offers several advantages:

1. **Data Fidelity**: Preserves original Z values from source data
2. **Compatibility**: Maintains efficient 2D operations for spatial queries
3. **Flexibility**: Allows height data to come from either geometry or properties
4. **Swiss Coordinate Support**: Better handling of Swiss LV95 height data

## Technical Details

### Migration Files

The implementation consists of two main migration files:

1. `20250516000000_add_geometry_3d_column.sql`
   - Adds the `geometry_3d` column
   - Creates the transform_and_store_geometries function
   - Updates feature retrieval functions

2. `20250517000000_update_import_functions.sql`
   - Updates import functions to use the new column and transformation function
   - Ensures both 2D and 3D geometries are properly stored

### Z-Coordinate Detection Logic

The detection logic in `components/map/dialogs/height-configuration/utils.ts` has been enhanced to:

1. Check for LV95 stored heights in properties
2. Examine geometry Z coordinates when property values aren't available
3. Use relaxed thresholds to better detect valid Z data
4. Provide more informative messages about height sources

### Height Configuration Dialog

The height configuration dialog has been updated to:

1. Better prioritize Z values from different sources
2. Provide clearer feedback about height detection
3. Configure appropriate defaults based on detected height sources
4. Handle object height attributes intelligently

## Future Considerations

1. **Performance Optimization**: Monitor and optimize the storage of dual geometries
2. **Visualization Enhancements**: Utilize 3D geometries for advanced visualizations
3. **Export Options**: Add options to export with or without Z values 