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
- `LayerPanel` and `LayerList` are independent and can be reused.
- `SyncTo3DButton` and `useSyncTo3D` handle syncing state/layers from Mapbox to Cesium.
- `StatusMonitor` and `ResetButton` reference both maps.

### Layer State
- Managed in Zustand (`store/layers/layerStore.ts`), not inherently tied to Mapbox.
- Layer rendering for Mapbox is handled by `MapLayers`, `GeoJSONLayer`, `MapLayer`, etc.
- Cesium rendering is handled via adapters and `useSyncTo3D`.

---

## Refactoring Steps & Progress

| Step | Description | Status | Notes |
|------|-------------|--------|-------|
| **A. Remove Mapbox from Main Map View** ||||
| A1 | Remove `<MapView />` and related imports/usages from `MapContainer` | [ ] |  |
| A2 | Remove "2D Map View" section from main view | [ ] |  |
| A3 | Remove `SyncTo3DButton` and related logic from main view | [ ] |  |
| A4 | Update layout: make Cesium the only map, move layer panel as needed | [ ] |  |
| A5 | Remove Mapbox state from stores | [ ] |  |
| **B. Refactor Layer Panel and Layer State** ||||
| B1 | Audit and remove Mapbox-specific logic from layer state/hooks | [ ] |  |
| B2 | Refactor `LayerItem`, `LayerList`, `LayerPanel` to control Cesium only | [ ] |  |
| B3 | Remove Mapbox layer renderers from main view | [ ] |  |
| **C. Update Cesium Integration** ||||
| C1 | Refactor Cesium layer adapters for direct layer management | [ ] |  |
| C2 | Remove view state sync logic between 2D and 3D | [ ] |  |
| **D. Clean Up and Test** ||||
| D1 | Remove unused Mapbox code and dependencies | [ ] |  |
| D2 | Refactor `StatusMonitor` and `ResetButton` for Cesium only | [ ] |  |
| D3 | Test all layer panel actions, import, styling, error handling | [ ] |  |
| D4 | Ensure import wizard Mapbox preview is unaffected | [ ] |  |

---

## Risks & Considerations

- **Strict Mode**: Ensure all effects and state updates are idempotent and safe for double-mount/unmount.
- **Layer Data**: If any layer data is only loaded for Mapbox, ensure it is loaded for Cesium.
- **Import Wizard**: Double-check that Mapbox preview in the import wizard is not affected.

---

## Next Steps

- Confirm this plan with the team.
- Begin with the removal of Mapbox from `MapContainer` and update the layout.
- Refactor the layer panel and state.
- Update Cesium integration.
- Clean up and test.

---

**Progress Tracking:**
- Mark each step as `[x]` when complete.
- Add notes for blockers, decisions, or follow-ups as needed.

---

_Last updated: <!-- TODO: update date as you make progress -->_ 