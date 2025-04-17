# MapPreview Feature Selection Fix

**Date**: April 16, 2025  
**Component**: `components/geo-import/components/map-preview.tsx`  
**Issue**: Feature selection state not reflecting in map visualization after initial load

## Problem Description

The MapPreview component was experiencing an issue where feature selection state was not being properly reflected in the map visualization after the initial load. While the internal React state (`selectedFeatures`) was updating correctly, the visual representation on the map wasn't changing to reflect selected features.

### Root Causes

1. ID Mismatch: The `generateId: true` option in the Mapbox source configuration was causing Mapbox to generate its own sequential IDs, overriding our custom feature IDs.
2. Inconsistent ID Usage: Different parts of the code were using different ID properties (`id` vs `previewId`).
3. Timing Issues: Feature states were being set without ensuring the source data was fully loaded.
4. State Mutation: The click handler was directly mutating the `selectedFeatures` Set instead of creating a new one.

## Solution

### 1. Type Updates
- Changed from using `GeoFeature` to `PreviewFeature` type
- `PreviewFeature` includes the `previewId` property needed for consistent feature identification

```typescript
import type { PreviewFeature } from '@/types/geo-import';

interface MapPreviewProps {
  features: PreviewFeature[];
  // ...
}
```

### 2. Source Configuration
- Removed `generateId: true` to allow our custom feature IDs
- Updated feature creation to use `previewId` consistently:

```typescript
const sourceData: GeoJSON.FeatureCollection<GeoJSON.Geometry> = {
  type: 'FeatureCollection',
  features: loadedFeatures.map(f => ({
    type: 'Feature',
    id: f.previewId,
    geometry: f.geometry,
    properties: { 
      ...f.properties,
      previewId: f.previewId,
      'geometry-type': f.geometry.type,
      // ...
    }
  }))
};
```

### 3. Feature State Updates
- Added source data loading check before updating feature states
- Improved error handling for feature state updates:

```typescript
mapInstance.once('sourcedata', (e) => {
  if (e.sourceId === 'preview' && e.isSourceLoaded) {
    loadedFeatures.forEach(feature => {
      try {
        mapInstance.setFeatureState(
          { source: 'preview', id: feature.previewId },
          { selected: selectedFeatures.has(feature.previewId) }
        );
      } catch (error) {
        logger.warn('Error setting feature state', { 
          previewId: feature.previewId, 
          error 
        });
      }
    });
  }
});
```

### 4. Click Handler
- Fixed state management to create new Set instances:

```typescript
const handleFeatureClick = (featureId: number) => {
  const newSelectedFeatures = new Set(selectedFeatures);
  if (newSelectedFeatures.has(featureId)) {
    newSelectedFeatures.delete(featureId);
    logger.info('Feature deselected', { featureId });
  } else {
    newSelectedFeatures.add(featureId);
    logger.info('Feature selected', { featureId });
  }
  setSelectedFeatures(newSelectedFeatures);
  onFeaturesSelected?.(Array.from(newSelectedFeatures));
};
```

## Testing

The fix can be verified by:
1. Loading a file with multiple features in the GeoImport dialog
2. Checking that initial feature selection is reflected on the map
3. Clicking features to toggle their selection
4. Verifying that the visual state (colors) updates immediately
5. Confirming that the selection state persists after map pan/zoom operations

## Related Components

- `GeoImportDialog`: Manages the overall import process and feature selection state
- `MapPreview`: Handles the visualization and interaction with features
- `PreviewFeature`: Type definition in `types/geo-import.ts`

## Notes

- This fix ensures consistent behavior between the React component state and Mapbox's visual representation
- The solution maintains performance by only updating feature states when necessary
- Error handling has been improved to catch and log any issues during feature state updates
- The fix is compatible with the existing feature validation and issue highlighting system 