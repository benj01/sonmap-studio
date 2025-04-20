# Refactor Plan: Remove Mapbox 2D Map from Main Map View

## High-Level Goals

- **Remove Mapbox (2D) from the main map view**: All Mapbox-related code, state, and dependencies in the main view should be removed.
- **Keep the Layer Panel**: The layer panel should remain, but its controls and state should now only affect Cesium.
- **Refactor Layer State**: Ensure the layer state is not tied to Mapbox and is fully compatible with Cesium.
- **Simplify State Management**: Remove all logic that coordinates between two maps.
- **Preserve Mapbox in Import Wizard**: Mapbox preview in the import wizard should remain untouched.

---

## Component/State Audit

### Main Map View Structure
- `MapContainer` orchestrates both Mapbox (`MapView`) and Cesium (`CesiumViewWithProvider`), and the layer panel.
  - Current Status: MapView section is commented out but imports and related code still exist
- `LayerPanel` and `LayerList` are independent and can be reused.
- `SyncTo3DButton` and `useSyncTo3D` handle syncing state/layers from Mapbox to Cesium.
  - Current Status: Still active and needs to be removed
- `StatusMonitor` and `ResetButton` have been updated to reference only Cesium.

### Layer State
- Managed in Zustand (`store/layers/layerStore.ts`), not inherently tied to Mapbox.
- Layer rendering for Mapbox (deprecated) is handled by `MapLayers`, `GeoJSONLayer`, `MapLayer`, etc.
- Cesium rendering is now handled directly via the layer store, without sync adapters.

---

## Refactoring Steps & Progress

| Step | Description | Status | Notes |
|------|-------------|--------|-------|
| **A. Remove Mapbox from Main Map View** ||||
| A1 | Remove `<MapView />` and related imports/usages from `MapContainer` | [~] | View commented out but imports remain |
| A2 | Remove "2D Map View" section from main view | [~] | Section commented out but code remains |
| A3 | Remove `SyncTo3DButton` and related logic from main view | [ ] | Component and logic still active |
| A4 | Update layout: make Cesium the only map, move layer panel as needed | [x] | Layout updated successfully |
| A5 | Remove Mapbox state from stores | [~] | Some Mapbox state remains in viewStateStore |
| **B. Refactor Layer Panel and Layer State** ||||
| B1 | Audit and remove Mapbox-specific logic from layer state/hooks | [x] | All Mapbox logic removed from `store/layers/hooks.ts` |
| B2 | Refactor `LayerItem`, `LayerList`, `LayerPanel` to control Cesium only | [x] | All logic is now Cesium-only or map-agnostic |
| B3 | Remove Mapbox layer renderers from main view | [~] | Files still exist but are unused |
| **C. Update Cesium Integration** ||||
| C1 | Refactor Cesium layer adapters for direct layer management | [x] | Cesium layers now managed directly from Zustand state |
| C2 | Remove view state sync logic between 2D and 3D | [ ] | Significant sync logic remains |
| **D. Clean Up and Test** ||||
| D1 | Remove unused Mapbox code and dependencies | [ ] | Pending completion of C2 |
| D2 | Refactor `StatusMonitor` and `ResetButton` for Cesium only | [x] | StatusMonitor now only references Cesium |
| D3 | Test all layer panel actions, import, styling, error handling | [ ] | |
| D4 | Ensure import wizard Mapbox preview is unaffected | [ ] | |

---

## Detailed Next Steps

### 1. Complete View State Sync Removal (C2)
Files to update:
- `useSyncTo3D.ts` - Remove entire file
- `useViewSync.ts` - Remove entire file
- `viewStateStore.ts` - Remove Mapbox-specific state and selectors
- `SyncTo3DButton.tsx` - Remove component and its imports

### 2. Clean Up MapContainer (A1-A3)
In `MapContainer.tsx`:
- Remove commented-out MapView section
- Remove unused imports:
  ```typescript
  import { MapView } from './MapView';
  import { SyncTo3DButton } from './SyncTo3DButton';
  ```
- Update component props to remove Mapbox-specific props:
  - `accessToken`
  - `style`
  - `initialViewState2D`

### 3. Delete Deprecated Files (B3)
After verifying no import wizard dependencies:
```
components/map/layers/MapLayer.tsx
components/map/layers/GeoJSONLayer.tsx
components/map/layers/RasterLayer.tsx
components/map/components/MapLayers.tsx
```

### 4. ViewState Store Cleanup (A5)
In `store/view/viewStateStore.ts`:
- Remove `ViewState2D` interface and related state
- Remove 2D-specific selectors
- Update store to only maintain Cesium view state
- Update type definitions to remove Mapbox-specific types

### 5. Testing Strategy
- Verify layer operations:
  - Layer visibility toggling
  - Layer ordering
  - Layer style updates
  - Layer removal/addition
- Test view state management:
  - Camera position updates
  - View reset functionality
  - Initial view state loading
- Verify import wizard still functions:
  - Mapbox preview works
  - Layer import process unaffected
  - No regressions in import functionality

---

## Risks & Considerations

- **Strict Mode**: Ensure all effects and state updates are idempotent and safe for double-mount/unmount.
- **Layer Data**: If any layer data is only loaded for Mapbox, ensure it is loaded for Cesium.
- **Import Wizard**: Double-check that Mapbox preview in the import wizard is not affected.
- **State Management**: 
  - Ensure no components rely on removed Mapbox state
  - Verify all Cesium state updates are properly handled
  - Check for any remaining view sync dependencies

---

## Dependencies to Review

Before deleting any files, check for dependencies in:
- Import wizard components
- Layer preview components
- Test files
- Storybook stories (if any)
- Type definition files

---

**Progress Tracking:**
- Mark each step as `[x]` when complete
- Use `[~]` for partially complete items
- Add notes for blockers, decisions, or follow-ups as needed

---

_Last updated: 2024-03-19_ 