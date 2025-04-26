# Swiss Height Transformation

## Overview

Sonmap Studio includes specialized functionality for transforming Swiss coordinate heights. This document outlines how the system handles the transformation of Swiss LV95 heights to WGS84 ellipsoidal heights for accurate 3D visualization.

## Swiss Coordinate Systems

- **LV95 (Landesvermessung 1995)**: The Swiss national coordinate system
- **LHN95 (Landeshöhennetz 1995)**: The height reference system for Switzerland
- **WGS84**: Global coordinate system used by Cesium for 3D visualization

The height transformation is necessary because Swiss coordinates use orthometric heights (height above geoid), while WGS84 uses ellipsoidal heights.

## Transformation Methods

### API-based Transformation

- Uses direct calls to the SwissTopo Reframe API
- Endpoints:
  - `https://geodesy.geo.admin.ch/reframe/lhn95tobessel`
  - `https://geodesy.geo.admin.ch/reframe/lv95towgs84`
- Highest precision but slower for large datasets
- One API call per coordinate

### Delta-based Transformation

- Uses a reference point to calculate transformation offsets
- Applied to nearby features based on spatial proximity
- More efficient for large datasets
- One API call per geographic region rather than per feature

### Automatic Selection

The system automatically selects the appropriate method based on:
- Dataset size (features count)
- Feature distribution
- Performance requirements

## Implementation Details

### Swiss Coordinate Detection

The system automatically detects Swiss coordinates using:
- Coordinate ranges (2000000-3000000 for easting, 1000000-2000000 for northing)
- Presence of LV95-specific properties
- Vertical datum information

The detection occurs during height configuration to provide appropriate options.

### SwissTransformationInfo Component

This component in the Height Configuration Dialog provides:
- Information about detected Swiss coordinates
- Options for transformation method selection
- Explanation of the processing approach

### Delta-based Processing

For efficiency with large datasets, the system:
1. Groups features by spatial proximity
2. Selects reference points for each group
3. Transforms reference points using the API
4. Applies calculated deltas to nearby features
5. Caches results for reuse

### Coordinate Caching

The system implements caching to improve performance:
- Transformation results are cached by geographic grid cells
- Cache has configurable expiration (default: 24 hours)
- Cached results are reused for nearby coordinates

## Integration Points

### Height Configuration Dialog

The Swiss transformation functionality is integrated with the Height Configuration Dialog:
- Automatic detection and information display
- Method selection options
- Progress tracking during transformation

### HeightTransformBatchService

The batch service supports Swiss-specific transformations:
- Enhanced to handle delta-based processing
- Optimized for large Swiss datasets
- Includes progress tracking specific to transformation steps

### API Endpoints

The system includes specialized endpoints for Swiss transformations:
- Batch transformation endpoint for efficient processing
- Status tracking for Swiss-specific transformations

## Performance Considerations

### Spatial Grouping

The system optimizes performance through spatial grouping:
- Features are grouped by 1km grid cells
- Each group uses a single reference transformation
- Reduces API calls dramatically for dense feature sets

### Batch Processing

For large datasets, the system implements:
- Chunked processing for memory efficiency
- Parallel processing where appropriate
- Progress tracking for user feedback

## Future Enhancements

Planned improvements for the Swiss transformation system:
1. **Enhanced Spatial Grouping**: Improved algorithms for reference point selection
2. **Persistent Caching**: Cache persistence between application sessions
3. **Performance Metrics**: Better reporting of performance gains
4. **Offline Transformation**: Support for offline processing using pre-calculated grids 