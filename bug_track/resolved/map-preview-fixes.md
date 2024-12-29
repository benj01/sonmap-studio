# Debug Tracking Log

## Issue Status: RESOLVED
**Issue Identifier:** map-preview-fixes
**Component:** PreviewMap, useMapView
**Impact Level:** High
**Tags:** #map #preview #coordinates #layers #visibility

### Problem Statement
Two critical issues with the preview map functionality:
1. Initial map centering was incorrect, showing wrong location until layer visibility was toggled
2. Layer visibility toggle wasn't working properly - features remained visible when their layer was toggled off

### Error Indicators
- Map initially centered at incorrect coordinates (-19.919524, 32.106768)
- Correct position (7.966015, 47.368941) only shown after layer visibility toggle
- Features remained visible even when their layer was toggled off

## Key Discoveries
1. Coordinate System Double Transformation
   - Previous understanding: Bounds needed to be transformed in useMapView
   - Actual behavior: DxfProcessor already transforms bounds to WGS84 (EPSG:4326)
   - Implication: Double transformation was causing incorrect initial position
   - Impact: Needed to inform useMapView that bounds are already in WGS84

2. Layer Visibility Implementation
   - Previous understanding: PreviewManager's visibleLayers prop was sufficient
   - Actual behavior: Map components were not filtering features by layer
   - Implication: Features were rendered regardless of layer visibility
   - Impact: Needed to filter features at render time in map components

## Understanding Corrections
1. Coordinate System Handling
   - What we thought: Bounds needed transformation in useMapView
   - Why it was wrong: DxfProcessor already handles transformation
   - Corrected understanding: Bounds are already in WGS84 when passed to useMapView
   - Changes needed: Explicitly tell useMapView bounds are in WGS84

2. Layer Visibility
   - What we thought: PreviewManager handled all visibility filtering
   - Why it was wrong: Map components were using unfiltered collections
   - Corrected understanding: Need to filter at both PreviewManager and render level
   - Changes needed: Add visibility filtering in layerComponents

## Solution Attempts Log

### Attempt #1 - Fix Coordinate System Handling
**Hypothesis:** Double coordinate transformation causing incorrect initial position
**Tags:** #coordinates #transformation #map
**Approach:** Explicitly specify WGS84 coordinate system to useMapView

**Changes Overview:**
```diff
preview-map.tsx | 5 ++---
```

**Critical Code Changes:**
```typescript
// Note: Preview bounds are already in WGS84 (EPSG:4326) after DxfProcessor transformation
const {
  viewState,
  onMove,
  updateViewFromBounds,
  focusOnFeatures,
  getViewportBounds
} = useMapView(bounds, COORDINATE_SYSTEMS.WGS84);
```

**Outcome:** Success
**Side Effects:** None observed
**Verification:** Map now centers correctly on initial load

### Attempt #2 - Fix Layer Visibility
**Hypothesis:** Features need to be filtered by layer at render time
**Tags:** #layers #visibility #map
**Approach:** Add layer visibility filtering in map components

**Changes Overview:**
```diff
preview-map.tsx | 35 +++++++++++++++++++----------------
```

**Critical Code Changes:**
```typescript
const layerComponents = useMemo(() => {
  // Helper to check if a feature's layer is visible
  const isLayerVisible = (feature: Feature) => {
    const layer = feature.properties?.layer;
    return visibleLayers.length === 0 || visibleLayers.includes(layer);
  };

  // Filter features by visibility
  const visiblePoints = {
    type: 'FeatureCollection' as const,
    features: points.features.filter(isLayerVisible)
  };
  const visibleLines = {
    type: 'FeatureCollection' as const,
    features: lines.features.filter(isLayerVisible)
  };
  // ... similar for polygons
});
```

**Outcome:** Success
**Side Effects:** None observed
**Verification:** Layer visibility toggle now works correctly

## Final Resolution
Both issues were successfully resolved:
1. Map Centering:
   - Fixed by correctly specifying WGS84 coordinate system
   - No more double transformation
   - Map centers correctly on initial load

2. Layer Visibility:
   - Fixed by adding proper feature filtering
   - Visibility toggle works correctly
   - Features properly hide/show with layer toggle

The fixes maintain good performance and don't introduce any new issues.
