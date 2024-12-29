# DXF Preview Issues

## Issue Status: RESOLVED
**Issue Identifier:** dxf-coordinate-preview
**Component:** DxfProcessor, PreviewMap
**Impact Level:** High
**Tags:** #dxf #coordinates #preview #layers

### Problem Statement
Two issues were affecting the DXF preview functionality:
1. Layer visibility toggles in the File Structure panel had no effect on the preview map
2. The coordinate system was incorrectly transformed to WGS84 instead of using the detected LV95 system

### Error Indicators
- Layer visibility toggles not affecting preview
- Coordinates showing up in wrong location (WGS84 instead of LV95)
- Console logs showing coordinate system detection but not being used

## Key Discoveries
- Discovery #1: Layer Visibility Logic
  - Previous understanding: Layer visibility was correctly connected to preview
  - Actual behavior: Toggle logic was inverted in dxf-structure-view.tsx
  - Implication: Layer toggles had opposite effect of what was intended
  - Impact: Required fixing the toggle logic

- Discovery #2: Coordinate System Handling
  - Previous understanding: Coordinates needed to be in WGS84 for preview
  - Actual behavior: Preview map can handle LV95 coordinates directly
  - Implication: No need to transform to WGS84
  - Impact: Keep coordinates in original system for better accuracy

## Understanding Corrections
- Correction #1: Layer Visibility
  - What we thought: Layer visibility was working but preview not updating
  - Why it was wrong: The toggle logic was inverted
  - Corrected understanding: Need to match toggle state with visibility state
  - Required changes: Fix toggle logic in dxf-structure-view.tsx

- Correction #2: Coordinate System
  - What we thought: Preview required WGS84 coordinates
  - Why it was wrong: Preview can handle LV95 coordinates directly
  - Corrected understanding: Keep detected coordinate system throughout
  - Required changes: Remove forced WGS84 transformation

## Solution Implementation

### Changes Overview
```diff
DxfProcessor:
- Remove forced WGS84 transformation
+ Keep coordinates in detected system (LV95)
+ Use detected system in preview manager

DxfStructureView:
- Fix inverted layer visibility logic
+ Correctly sync toggle state with visibility
```

### Key Changes
1. DxfProcessor Changes:
   - Keep coordinates in original detected system
   - Pass detected system to preview manager
   - Remove unnecessary coordinate transformations

2. Layer Visibility Changes:
   - Fix toggle logic in dxf-structure-view.tsx
   - Properly sync toggle state with visibility
   - Update preview when layers change

## Testing Verification
- Layer visibility toggles work correctly
- Coordinates display in correct location
- Preview updates properly with layer changes
- Coordinate system detection preserved

## Future Considerations
1. Add coordinate system validation
2. Consider adding coordinate system switching
3. Add visual feedback for coordinate system
4. Monitor performance with large coordinate values

## Related Issues
- DXF Layer Handling (#resolved)
- Map View Layer Toggle (#resolved)
