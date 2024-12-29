# Map View Layer Toggle Issue

## Issue Status: RESOLVED
**Issue Identifier:** map-view-layer-toggle
**Component:** PreviewManager, PreviewMap
**Impact Level:** Medium
**Tags:** #map #layers #preview #bounds

### Problem Statement
Preview map changes pan and focus unexpectedly when toggling layer visibility in the File Structure panel. This creates a disorienting user experience as the map view shifts when layers are toggled on/off.

### Error Indicators
- Map view changes when toggling layer visibility
- Focus point shifts unexpectedly
- Zoom level changes without user interaction
- Bounds not properly updated for visible features

## Key Discoveries
- Discovery #1: Bounds Handling
  - Previous understanding: Bounds were preserved from initial preview generation
  - Actual behavior: Initial bounds included all features, not just visible ones
  - Implication: Need to recalculate bounds when layer visibility changes
  - Impact: Required changes to bounds handling throughout preview system

- Discovery #2: View State Updates
  - Previous understanding: View state only updated on initial load and user interaction
  - Actual behavior: View state needs to update when visible features change
  - Implication: Need to update view when getting new preview collections
  - Impact: Added view updates in preview map component

## Understanding Corrections
- Correction #1: Bounds Management
  - What we thought: Initial bounds could be reused
  - Why it was wrong: Initial bounds included hidden features
  - Corrected understanding: Bounds must reflect only visible features
  - Required changes: Clear and recalculate bounds on visibility changes

## Solution Implementation

### Changes Overview
```diff
PreviewManager:
+ Clear initial bounds when layer visibility changes
+ Calculate new bounds from visible features
+ Return bounds with preview collections

PreviewMap:
+ Update view when receiving new bounds from collections
+ Handle bounds updates during layer toggling
```

### Key Changes
1. PreviewManager Changes:
   - Clear bounds in setOptions when layers change
   - Calculate bounds from visible features
   - Include bounds in preview collections

2. PreviewMap Changes:
   - Use bounds from preview collections
   - Update view state with new bounds
   - Maintain proper coordinate transformations

3. View State Management:
   - Proper bounds validation
   - Coordinate system handling
   - Smooth view transitions

## Testing Verification
- Layer visibility toggle maintains proper view
- Map shows all visible features after toggle
- View transitions are smooth
- Coordinate systems handled correctly
- Bounds calculations respect visible features

## Future Considerations
1. Consider adding view state persistence
2. Add bounds calculation optimization for large datasets
3. Consider adding user preference for view behavior
4. Monitor performance with many layer toggles

## Related Issues
- DXF Layer Handling (#resolved)
- Preview Map Performance (#active)
