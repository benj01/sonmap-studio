# Swiss Height Transformation System

## Overview

This document outlines how Sonmap Studio handles the transformation of Swiss LV95 heights to WGS84 ellipsoidal heights for accurate 3D visualization. It covers both the current implementation and proposed optimizations for better performance with large datasets.

## Current Implementation

### Architecture

The current height transformation system operates as follows:

1. **During Import**: 
   - LV95 coordinates are automatically stored in feature properties with `height_mode: 'lv95_stored'`
   - Original coordinates are preserved: `lv95_easting`, `lv95_northing`, `lv95_height`

2. **API Endpoint**: 
   - Next.js API route at `/api/coordinates/transform` handles the transformation
   - Makes HTTP requests to the SwissTopo Reframe API:
     - `https://geodesy.geo.admin.ch/reframe/lhn95tobessel`
     - `https://geodesy.geo.admin.ch/reframe/lv95towgs84`

3. **Transformation Process**:
   - Each feature is processed individually
   - For each feature, the original LV95 coordinates are sent to the API endpoint
   - The API returns WGS84 coordinates with ellipsoidal height
   - Results are applied to the feature's properties as `base_elevation_ellipsoidal`
   - `height_mode` is updated to `absolute_ellipsoidal`

4. **Batch Processing**:
   - `HeightTransformBatchService` breaks down processing into smaller chunks
   - Progress is tracked and reported to the UI
   - Features are processed in parallel within each chunk

### Current Limitations

1. **Redundant API Calls**: Each feature requires its own API call, even when features are spatially close.
2. **No Caching**: Results aren't cached, requiring repeated API calls for the same areas.
3. **Performance Issues**: Large datasets with thousands of features can take significant time to process.
4. **Tight Coupling with Rendering**: Transforms may occur during or close to rendering cycles.

## Proposed Enhancements

### 1. Delta-Based Transformation

Instead of transforming each coordinate individually, calculate a transformation delta for a reference point and apply it to nearby features:

```typescript
interface HeightDelta {
  refLv95: { x: number, y: number, z: number };
  refWgs84: { lon: number, lat: number, ellHeight: number };
  heightOffset: number; // Difference between LHN95 and WGS84 ellipsoidal height
  timestamp: number;
  validRadius: number; // Radius in meters where this delta is valid
}
```

This approach dramatically reduces API calls for dense feature sets.

### 2. Spatial Grouping

Group features by spatial proximity before processing:

1. Identify clusters of features that are close to each other
2. For each cluster, select a reference feature
3. Transform the reference feature using the API
4. Apply the resulting delta to all features in the cluster

### 3. Height Transformation Caching

Implement a caching system for transformation results:

1. Store deltas by geographic grid cells
2. Use cached deltas for new transformations within their valid radius
3. Implement cache expiration to ensure accuracy over time
4. Optionally persist the cache between sessions

### 4. User-Controlled Transformation

Make the transformation process explicit and user-controlled through the Height Configuration Dialog:

1. Detect Swiss coordinates automatically
2. Present Swiss-specific transformation options:
   - Enable/disable Swiss height transformation
   - Choose transformation method (API vs. delta-based)
   - Option to cache results

### 5. One-Time Processing

Transform coordinates once and store results permanently:

1. Process features when the user configures height settings
2. Store results in feature properties and the database
3. Use pre-calculated values during rendering without any additional processing

## Implementation Plan

### 1. Enhance Height Configuration Dialog

Update the dialog to include Swiss transformation options:

```typescript
// Add to HeightSource interface
export interface HeightSource {
  // existing fields...
  
  // Add Swiss-specific configuration
  swissHeightTransformation?: {
    enabled: boolean;           // Whether to use Swiss height transformation
    transformationMethod: 'api' | 'delta'; // Use API directly or delta calculation
    cacheResults: boolean;      // Whether to cache results for future use
  };
}
```

Create a new component for Swiss transformation settings:

```tsx
function SwissHeightTransformationSettings({ 
  sourceType, 
  showSwissOptions,
  settings,
  onSettingsChange
}) {
  if (!showSwissOptions) return null;
  
  return (
    <div className="p-4 border rounded-md mt-4">
      <h3 className="text-lg font-medium mb-2">Swiss Height Transformation</h3>
      {/* Settings UI */}
    </div>
  );
}
```

### 2. Implement Delta Calculation System

Create utility functions for delta-based transformations:

```typescript
// In core/utils/coordinates.ts

// Cache for height deltas
const heightDeltaCache: Map<string, HeightDelta> = new Map();

/**
 * Gets a cached height delta or calculates a new one
 */
export async function getHeightDelta(
  eastingLv95: number,
  northingLv95: number,
  lhn95Height: number
): Promise<HeightDelta> {
  // Implementation details
}

/**
 * Applies a height delta to transform a coordinate
 */
export function applyHeightDelta(
  eastingLv95: number,
  northingLv95: number,
  lhn95Height: number,
  delta: HeightDelta
): TransformResult {
  // Implementation details
}
```

### 3. Update Batch Processing Service

Enhance the batch service to use the new delta-based approach:

```typescript
/**
 * Process features using delta-based transformation
 */
private async processFeaturesWithDelta(
  features: Feature[], 
  cacheResults: boolean
): Promise<void> {
  // Group features by spatial proximity
  const spatialGroups = this.groupFeaturesByProximity(features);
  
  // Process each group
  for (const group of spatialGroups) {
    // Process reference feature
    // Apply delta to related features
  }
}
```

### 4. Create Batch API Endpoint

Add an API endpoint for processing multiple coordinates at once:

```typescript
// In app/api/coordinates/transform-batch/route.ts

export async function POST(request: Request) {
  // Accept array of coordinates
  // Process coordinates efficiently
  // Return batch results
}
```

### 5. Implement Result Persistence

Store transformed heights permanently:

```typescript
/**
 * Apply and permanently store transformation results
 */
private async storeTransformationResults(
  layerId: string,
  featureIds: string[],
  transformedProperties: Record<string, any>[]
): Promise<void> {
  // Update database with transformed heights
}
```

### 6. Update Rendering Process

Simplify the rendering flow to use pre-calculated values:

```typescript
function prepareFeatureForRendering(feature: Feature): CesiumEntity {
  // Use pre-calculated ellipsoidal height
  const position = Cesium.Cartesian3.fromDegrees(
    feature.geometry.coordinates[0],
    feature.geometry.coordinates[1],
    feature.properties.base_elevation_ellipsoidal || 0
  );
  
  // Create entity...
}
```

## Benefits

1. **Improved Performance**: Significantly fewer API calls for large datasets
2. **Better UX**: Explicit user control over the transformation process
3. **Reduced Server Load**: Fewer requests to the SwissTopo API
4. **Faster Rendering**: Pre-calculated heights eliminate processing during rendering
5. **Scalability**: Can handle much larger datasets efficiently

## Integration with Existing System

This enhancement builds upon the existing Height Configuration system:

1. Maintains compatibility with the current data model
2. Integrates with the existing batch processing framework
3. Leverages the Height Configuration Dialog as the control point
4. Preserves existing height interpretation modes and visualization options

## Technical Considerations

### Accuracy vs. Performance

The delta-based approach makes a trade-off between absolute accuracy and performance:

1. **Direct API Calls**: Highest accuracy, slowest performance
2. **Delta Calculation**: Slightly reduced accuracy, significantly better performance

For most visualization purposes, the delta approach provides sufficient accuracy while dramatically improving performance.

### Cache Management

The caching system should include:

1. **Spatial Indexing**: Efficient lookup by location
2. **Expiration Policy**: Clear outdated entries
3. **Size Limits**: Prevent excessive memory usage
4. **Optional Persistence**: Save/load between sessions

### Error Handling

Robust error handling should include:

1. **Fallback Mechanisms**: Graceful degradation when API calls fail
2. **Validation**: Ensure transformed values are reasonable
3. **Logging**: Track transformation errors for troubleshooting
4. **Retry Logic**: Attempt recovery from temporary failures

## Implementation Prioritization

1. **Dialog Enhancement**: Add Swiss transformation options to the UI
2. **Delta Calculation**: Implement the core delta-based transformation
3. **Batch Processing**: Update the batch service to use deltas
4. **Caching**: Implement the caching system
5. **Persistence**: Add storage of transformed values
6. **UI Refinements**: Improve progress tracking and reporting

## Conclusion

The proposed enhancements to the Swiss height transformation system will significantly improve performance and user experience, especially for large datasets. By making transformations explicit, user-controlled, and computationally efficient, we can provide accurate 3D visualization while minimizing API calls and processing overhead. 