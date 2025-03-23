# Sonmap Studio Store Redesign

## Context
The application is experiencing React state management issues, specifically with infinite render loops in the map layer verification system. This document outlines the plan to redesign the store architecture while maintaining Zustand as the state management solution.

## Current Issues
1. Infinite render loops in React components
2. Complex state updates causing unnecessary rerenders
3. Inefficient state caching and memoization
4. Tightly coupled layer management and verification logic
5. Direct mutations of complex objects (Map) triggering full store updates

## Goals
1. Eliminate infinite render loops
2. Improve performance through better state management
3. Enhance maintainability and testability
4. Enable incremental migration without breaking existing functionality
5. Maintain type safety throughout the system

## Implementation Plan

### Phase 1: Store Separation ✅
- [x] Create new store files:
  - [x] `stores/layers/layerStore.ts` - Core layer management
  - [x] `stores/verification/verificationStore.ts` - Layer verification state
  - [x] `stores/map/mapInstanceStore.ts` - Map instance management
  - [x] `stores/view/viewStateStore.ts` - 2D/3D view state

### Phase 2: State Normalization ✅
- [x] Define new state structures:
  ```typescript
  // Implemented in layerStore.ts
  interface NormalizedLayerState {
    byId: Record<string, Layer>;
    allIds: string[];
    metadata: Record<string, LayerMetadata>;
  }

  // Implemented in verificationStore.ts
  interface NormalizedVerificationState {
    status: Record<string, VerificationStatus>;
    pending: string[];
    inProgress: string[];
    lastVerified: Record<string, number>;
  }

  // Implemented in mapInstanceStore.ts
  interface NormalizedMapInstanceState {
    mapbox: {
      instance: MapboxMap | null;
      status: 'initializing' | 'ready' | 'error';
      error?: string;
    };
    cesium: {
      instance: any | null;
      status: 'initializing' | 'ready' | 'error';
      error?: string;
    };
  }
  ```
- [x] All stores now use normalized state structures
- [x] Each store maintains its own normalized state with proper typing
- [x] State updates are handled through immutable operations
- [x] Proper error handling and status tracking implemented

### Phase 3: Selector Implementation ✅
- [x] Create typed selectors for each store:
  - [x] Layer selectors:
    - `getLayerById`, `getAllLayers`, `getVisibleLayers`
    - `getLayerMetadata`, `getLayersByStatus`, `getLayersWithErrors`
  - [x] Verification selectors:
    - `getVerificationStatus`, `getPendingVerifications`
    - `getInProgressVerifications`, `getLastVerified`
    - `getLayersNeedingVerification`, `getLayersWithVerificationErrors`
  - [x] Map instance selectors:
    - `getMapboxInstance`, `getCesiumInstance`
    - `getMapboxStatus`, `getCesiumStatus`
    - `getMapboxError`, `getCesiumError`
    - `areInstancesReady`, `hasInstanceError`
  - [x] View state selectors:
    - `getViewState2D`, `getViewState3D`
    - `getCenter`, `getZoom`, `getPitch`, `getBearing`
    - `getHeight`, `getLatitude`, `getLongitude`
- [x] All selectors are properly typed and memoized
- [x] Selectors follow normalized state structure
- [x] Each selector has a corresponding custom hook
- [x] Hooks are optimized to prevent unnecessary rerenders

### Phase 4: Hook Creation
- [ ] Implement custom hooks for each domain:
  - [ ] `useLayer(id: string)` - Single layer operations
  - [ ] `useLayers()` - Bulk layer operations
  - [ ] `useVerification(id: string)` - Layer verification
  - [ ] `useMapInstance()` - Map instance management
  - [ ] `useViewState()` - View state management

### Phase 5: Migration Strategy
1. [ ] Create new stores alongside existing store
2. [ ] Implement new functionality in parallel
3. [ ] Gradually migrate components:
   - [ ] LayerVerification component
   - [ ] MapView component
   - [ ] Layer management components
4. [ ] Add tests for new stores
5. [ ] Remove old store implementation

### Phase 6: Component Updates
- [ ] Update components to use new stores:
  - [ ] LayerVerification.tsx
  - [ ] MapView.tsx
  - [ ] Layer management components
  - [ ] Map control components

## Type Definitions
Key types to be implemented (examples):
```typescript
interface Layer {
  id: string;
  type: LayerType;
  visible: boolean;
  source?: string;
}

interface VerificationStatus {
  status: 'pending' | 'in_progress' | 'verified' | 'failed';
  lastChecked: number;
  error?: string;
}
```

## Testing Strategy
- [ ] Unit tests for each store
- [ ] Integration tests for store interactions
- [ ] Component tests with new store implementations
- [ ] Migration validation tests

## Performance Monitoring
- [ ] Implement React DevTools profiling
- [ ] Add performance measurements
- [ ] Monitor render counts
- [ ] Track state update frequency

## Rollback Plan
1. Keep old store implementation until migration is complete
2. Maintain feature parity during migration
3. Implement feature flags for gradual rollout
4. Keep old tests running during migration

## Success Criteria
1. No infinite render loops
2. Reduced component render counts
3. Clear separation of concerns
4. Type-safe implementation
5. Comprehensive test coverage
6. No regression in functionality

## Notes
- Each phase should be implemented incrementally
- Tests should be written alongside new implementations
- Performance metrics should be collected before and after changes
- Documentation should be updated as changes are made

## Commands and Instructions
When implementing this redesign, use these commands:
1. "Implement Phase X" - Begin implementation of a specific phase
2. "Show current state" - Display progress and current status
3. "Review implementation" - Review current implementation
4. "Run tests" - Execute test suite
5. "Update documentation" - Update this document with progress

## Dependencies
- Next.js 15
- React 19
- Zustand 5.0.2
- TypeScript 5.x

## Related Files
- `/store/mapStore.ts` (current implementation)
- `/components/map/components/LayerVerification.tsx`
- `/components/map/components/MapView.tsx`
- `/store/*` (new store files to be created)

## Progress
### Phase 1: Store Separation ✅
Completed on [Current Date]
- Created `store/layers/layerStore.ts` with core layer management functionality
- Created `store/verification/verificationStore.ts` with layer verification state management
- Created `store/map/mapInstanceStore.ts` with map instance management
- Created `store/view/viewStateStore.ts` with 2D/3D view state management
- Each store is properly typed and includes logging functionality
- Stores are separated by concern to prevent unnecessary rerenders

---

This document should be updated as implementation progresses. Each change should be tracked and documented here. 