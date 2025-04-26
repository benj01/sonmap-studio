# Height Transformation Troubleshooting Guide

This document provides solutions to common issues encountered with the height transformation system in Sonmap Studio.

## Common Issues

### "Failed to initialize batch" Error

#### Symptoms
- Error message: `[HeightTransformBatchService] Failed to initialize batch {}`
- 404 error when calling `/api/height-transformation/initialize`
- Console shows: `No features found in layer <layerId>`

#### Causes
1. **Empty Layer**: The layer contains no features at all.
2. **Missing Height Mode**: Features exist but none have `height_mode` set to `lv95_stored`.
3. **Database Permission Issues**: The API endpoint can't access features due to RLS policies.

#### Diagnostic Steps
1. Use the diagnostic endpoint to check feature counts:
   ```
   GET /api/height-transformation/feature-counts?layerId=<your-layer-id>
   ```

2. Check the response for:
   - `total_features`: Should be > 0
   - `lv95_stored_features`: Should be > 0 for Swiss transformations
   - `height_mode_counts`: Distribution of height modes

3. Check the database directly:
   ```sql
   SELECT COUNT(*) FROM geo_features WHERE layer_id = '<your-layer-id>';
   SELECT COUNT(*) FROM geo_features WHERE layer_id = '<your-layer-id>' AND height_mode = 'lv95_stored';
   ```

#### Solutions
1. **For Empty Layers**:
   - Import features into the layer before attempting transformation.
   - The UI should now handle this gracefully without erroring.

2. **For Missing LV95 Height Mode**:
   - Ensure features have the correct `height_mode = 'lv95_stored'` in the database.
   - Check if `properties` JSON column contains valid LV95 coordinates:
     - `lv95_easting` (should be ~2.5-2.8M)
     - `lv95_northing` (should be ~1.1-1.3M)
     - `lv95_height` (elevation in meters)

3. **For Permission Issues**:
   - Ensure the authenticated user has access to both the layer and its features.
   - Check database RLS policies for the `geo_features` table.

### Swiss Coordinate Transformation Issues

#### Symptoms
- Successful batch initialization but features not transformed
- Missing or incorrect height values after transformation
- Transformation marked as complete but geometry is flat

#### Causes
1. **Invalid Swiss Coordinates**: LV95 coordinates outside valid ranges.
2. **API Connection Issues**: Cannot connect to the Swiss Reframe API.
3. **Mismatched Coordinate Systems**: Features imported with wrong SRID.

#### Diagnostic Steps
1. Check the validity of LV95 coordinates:
   ```sql
   SELECT 
     properties->>'lv95_easting' as easting, 
     properties->>'lv95_northing' as northing,
     properties->>'lv95_height' as height 
   FROM geo_features 
   WHERE layer_id = '<your-layer-id>' 
   LIMIT 5;
   ```

2. Valid LV95 coordinates should be:
   - Easting: ~2,450,000 to 2,850,000
   - Northing: ~1,050,000 to 1,350,000
   - Height: ~0 to 4,500 (Swiss elevation range)

#### Solutions
1. **For Invalid Coordinates**:
   - Re-import the data with correct coordinate system parameters.
   - Manually update the coordinates if only a few features are affected.

2. **For API Connection Issues**:
   - Check network connectivity to `geodesy.geo.admin.ch`.
   - The system will fall back to approximation for development environments.

## Recent Improvements

The height transformation system was recently enhanced to better handle edge cases:

1. **Better Error Handling**:
   - Improved error messages with specific causes
   - Graceful handling of empty layers and missing features
   - Enhanced validation before attempting transformation

2. **Diagnostic Tools**:
   - New API endpoint `/api/height-transformation/feature-counts` for diagnosing feature issues
   - Enhanced database functions to count features by height mode

3. **SQL Functions**:
   - `count_layer_features`: Count all features in a layer
   - `count_features_by_height_mode`: Count features with a specific height mode
   - `count_lv95_features`: Count features with LV95 stored height data
   - `get_height_mode_distribution`: Get distribution of height modes

4. **Improved Client-Side Validation**:
   - Better detection of Swiss coordinates
   - Pre-checks for features with LV95 stored heights
   - More informative logging and error reporting

## Testing Height Transformations

To verify height transformations are working correctly:

1. **Create Test Features**:
   - Import known Swiss LV95 coordinates (e.g., from swisstopo)
   - Ensure `height_mode` is set to `lv95_stored`
   - Include valid `lv95_easting`, `lv95_northing`, and `lv95_height` values

2. **Run Transformation**:
   - Apply height settings with Z Coordinates source
   - Check the transformation logs in the console
   - Verify 3D visualization shows expected elevation

3. **Verify Results**:
   - Check that `base_elevation_ellipsoidal` has been set
   - `height_mode` should change from `lv95_stored` to `absolute_ellipsoidal`
   - Features should be visible at correct heights in 3D view 