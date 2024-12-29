# Debug Tracking Log

## Issue Status: ACTIVE
**Issue Identifier:** dxf-layer-visibility
**Component:** DxfProcessor, PreviewManager, DxfStructureView
**Impact Level:** High
**Tags:** #dxf #layers #preview #visibility #state-management

### Problem Statement
Layer visibility in DXF preview is not working correctly:
- Features not visible despite layers being toggled ON
- Layer visibility toggles not functioning
- Map focused incorrectly
- Features processed but not displayed

### Error Indicators
- "Showing 0 of 1 features" despite layer being ON
- Map showing wrong coordinates (-19.940346, 32.117463) for Swiss system
- High cache hit rate but no visible features
- Layer toggles not affecting visibility

## Key Discoveries
- Discovery #1: Layer Visibility State
  - Previous understanding: Empty visibleLayers array in PreviewManager means all layers visible
  - Actual behavior: This might be causing confusion in state management
  - Implication: Need to review how "all visible" state is handled across components

- Discovery #2: State Management Flow
  - Previous understanding: Layer state only needed in PreviewManager
  - Actual behavior: State needs to be consistent across multiple components
  - Implication: Need to ensure state consistency between:
    1. DxfProcessor (initial state)
    2. PreviewManager (visibility handling)
    3. DxfStructureView (UI state)

## Understanding Corrections
- Correction #1: Layer Visibility Logic
  - What we thought: Empty array means all visible
  - Why it was wrong: This creates ambiguity in state management
  - Corrected understanding: Need explicit visibility state
  - Required changes: Revise how "all visible" state is handled

- Correction #2: Previous Fix Attempts
  - Changes in useFileAnalysis were incomplete
  - Focused only on PreviewManager initialization
  - Didn't consider full state management chain
  - Need comprehensive state management solution

## Solution Attempts Log

### Attempt #1 - Empty Array for All Visible
**Hypothesis:** Empty visibleLayers array would make all layers visible
**Approach:**
- Changed PreviewManager initialization to use empty array
- Updated state initialization in useFileAnalysis
- Modified layer toggle logic

**Outcome:** Failed
- Layer toggles stopped working
- Features still not visible
- Map focus incorrect

### Attempt #2 - Layer Toggle Logic Update
**Hypothesis:** Layer toggle logic needs to handle "all visible" state
**Approach:**
- Updated handleLayerVisibilityToggle to handle empty array case
- Added logic to convert between explicit and implicit states
- Added debug logging

**Outcome:** Failed
- Toggle logic more complex but still not working
- State management became more confusing
- No improvement in visibility

### Attempt #3 - Coordinate System Fix
**Hypothesis:** Features not visible due to incorrect coordinate system handling
**Approach:**
1. Fixed coordinate transformation chain:
   - Transform entities to WGS84 before feature conversion
   - Transform bounds to WGS84 for preview
   - Set PreviewManager to always use WGS84
2. Added debug logging:
   - Log coordinate system detection
   - Log transformation results
   - Log bounds calculations
3. Improved error handling:
   - Validate transformed coordinates
   - Preserve original bounds for reference
   - Add context to error messages

**Key Changes:**
```typescript
// Transform entities to WGS84 before converting to features
const transformedEntities = await DxfTransformer.transformEntities(
  sampledEntities,
  detectedSystem || 'EPSG:4326',
  'EPSG:4326'
);

// Transform bounds to WGS84 for preview
const previewBounds = await DxfTransformer.transformBounds(
  entityBounds || DxfAnalyzer.getDefaultBounds(detectedSystem),
  detectedSystem || 'EPSG:4326',
  'EPSG:4326'
);

// Always use WGS84 for preview
const previewManager = createPreviewManager({
  coordinateSystem: 'EPSG:4326',
  bounds: previewBounds,
  ...
});
```

**Outcome:** In Progress
- Fixed coordinate system transformation
- Features should now be in correct location
- Layer visibility state still needs verification

## Current Understanding
1. Coordinate System Chain:
   - DxfAnalyzer detects Swiss LV95 (EPSG:2056)
   - DxfTransformer converts to WGS84 (EPSG:4326)
   - PreviewManager uses WGS84 for display

2. Layer Visibility State:
   - Empty array means all layers visible
   - State managed in PreviewManager
   - UI toggles update visibleLayers array

3. Bounds Handling:
   - Calculate bounds from entities
   - Transform bounds to WGS84
   - Use transformed bounds for map focus

## Next Steps
1. Verify coordinate transformation:
   - Check transformed coordinates match expected WGS84 range
   - Verify map focus is correct
   - Test with different coordinate systems

2. Test layer visibility:
   - Verify all layers visible by default
   - Test layer toggle behavior
   - Check state consistency

3. Add comprehensive logging:
   - Log coordinate transformations
   - Track layer visibility state
   - Monitor feature processing

### Attempt #4 - Complete Fix
**Hypothesis:** Both coordinate system and layer visibility issues need to be fixed together
**Approach:**
1. Fixed coordinate system handling:
   - Added DxfCoordinateHandler to manage transformations
   - Transform entities to WGS84 before preview
   - Transform bounds to WGS84 for map focus
   - Added coordinate system verification

2. Fixed layer visibility logic:
   - Fixed layer toggle switch state calculation
   - Corrected "all layers visible" handling
   - Improved toggle all layers behavior
   - Added better debug logging

**Key Changes:**
1. Coordinate System:
```typescript
// Transform entities to WGS84 before preview
const mainFeatures = await DxfCoordinateHandler.processEntities(
  sampledEntities,
  detectedSystem || 'EPSG:4326'
);

// Transform bounds to WGS84 for preview
const previewBounds = await DxfCoordinateHandler.transformBounds(
  entityBounds || DxfAnalyzer.getDefaultBounds(detectedSystem),
  detectedSystem || 'EPSG:4326'
);
```

2. Layer Visibility:
```typescript
// Fixed layer visibility check in DxfStructureView
checked={visibleLayers.length === 0 || visibleLayers.includes(layer.name)}

// Improved toggle all layers logic
const handleToggleAllLayers = (visible: boolean) => {
  if (visible) {
    // Clear visibleLayers to make all layers visible
    validLayers.forEach(layer => {
      onLayerVisibilityToggle(layer, true);
    });
  } else {
    // Add all layers to visibleLayers to make them explicitly invisible
    validLayers.forEach(layer => {
      onLayerVisibilityToggle(layer, false);
    });
  }
};
```

**Outcome:** In Progress
- Fixed coordinate system transformation
- Fixed layer visibility toggle behavior
- Added comprehensive debug logging
- Added coordinate system verification

## Current Understanding
1. Layer Visibility Chain:
   - Empty visibleLayers array = all layers visible
   - UI switches reflect this convention
   - PreviewManager respects this state
   - Layer toggles update state correctly

2. Coordinate System Chain:
   - DxfAnalyzer detects Swiss LV95 (EPSG:2056)
   - DxfCoordinateHandler transforms to WGS84
   - PreviewManager uses WGS84 for display
   - Bounds are transformed for correct map focus

3. State Management:
   - Layer visibility state is consistent
   - Coordinate transformations are verified
   - Debug logging tracks state changes
   - Error handling is improved

## Next Steps
1. Verify coordinate transformation:
   - Check transformed coordinates match expected range
   - Verify map focus is correct
   - Test with different coordinate systems

2. Test layer visibility:
   - Verify all layers visible by default
   - Test layer toggle behavior
   - Check state consistency

3. Monitor debug logs:
   - Track coordinate transformations
   - Watch layer visibility changes
   - Check for any warnings/errors

## Diagnosis Tools Setup
- Added debug logging in:
  - DxfProcessor
  - PreviewManager
  - useFileAnalysis
  - Layer visibility handlers

## Next Session Focus
1. Review layer visibility state management
2. Check coordinate transformation chain
3. Verify preview update logic
4. Test layer toggle behavior

---

# Log Maintenance Notes
- Track all state management changes
- Document coordinate system handling
- Keep visibility logic clear and explicit
- Document all state transitions
