# 2D-3D View Integration Plan

## Overview

This document outlines the implementation plan for transitioning from a toggle-based view system to a side-by-side view where:
- The 3D map (Cesium) is the primary view (larger or equal size)
- The 2D map (Mapbox) is the secondary view (smaller)
- Synchronization is one-way (2D → 3D) and happens on-demand via a button click
- Layer/feature selection happens in the 2D view and is synchronized to 3D

## Current Architecture

### Components
1. **MapContainer**: Main container component that manages view state and layout
2. **MapView**: 2D view using Mapbox GL
3. **CesiumView**: 3D view using Cesium
4. **LayerPanel**: Panel showing available layers
5. **LayerList**: 2D layer management
6. **CesiumLayerList**: 3D layer management
7. **SyncTo3DButton**: New component for triggering 3D synchronization

### State Management
1. **MapContext**: Manages 2D map state and layers
2. **CesiumContext**: Manages 3D viewer state
3. **SharedLayerContext**: Manages unified layer state between views
4. **Layer Management**:
   - 2D: Uses Mapbox GL layers
   - 3D: Uses Cesium entities, tilesets, etc.
   - Shared: Unified layer state and adapters

## Integration Requirements

1. **Synchronized Layer State**
   - Layer visibility should persist between view switches
   - Layer selections should be maintained
   - Layer styles should be consistent where possible

2. **View Transitions**
   - Smooth transitions between 2D and 3D views
   - Maintain camera position/zoom level equivalence
   - Preserve user interactions and selections

3. **Data Consistency**
   - Shared data sources between views
   - Consistent layer ordering
   - Unified layer metadata

## Implementation Plan

### Phase 1: UI Layout Changes ✅ COMPLETED

1. **Update MapContainer Layout** ✅
   - Implemented side-by-side layout with 3D view as primary (flex-1)
   - 2D view as secondary (w-1/3)
   - Layer panel and sync button properly positioned
   - Clean separation of concerns

2. **Create SyncTo3DButton Component** ✅
   - Implemented with loading state and animation
   - Proper error handling and logging
   - Clear visual feedback
   - Disabled state when sync is not possible

3. **Implement Basic View Synchronization** ✅
   - One-way synchronization (2D → 3D)
   - Smooth transitions with proper easing
   - Coordinate conversion between views
   - Error handling and validation

4. **Add Layer Selection UI** ✅
   - Clean, modern layer panel design
   - Proper scrolling for many layers
   - Ready for layer selection implementation
   - Consistent styling with the rest of the UI

### Phase 2: State Management Updates ✅ COMPLETED

1. **Update Layer State Management** ✅
   - Implemented `LayerMetadata` interface for source and style information
   - Added proper typing for layer metadata
   - Created `LayerState` interface with all required properties
   - Added support for both 2D and 3D layer sources

2. **Update Layer Context** ✅
   - Added `selectedLayers` state array
   - Implemented `getSelectedLayers` method
   - Added layer management methods (add, remove, toggle, update)
   - Added proper cleanup when removing layers
   - Implemented proper error handling and logging

3. **Layer Selection UI** ✅
   - Added checkbox for layer selection in `LayerItem`
   - Added selected layers count in `LayerList`
   - Implemented proper selection state management
   - Added visual feedback for selected state

4. **Layer Synchronization** ✅
   - Added proper metadata for both 2D and 3D sources
   - Added source type tracking in layer metadata
   - Implemented proper layer state synchronization
   - Added support for layer style synchronization

### Phase 3: Synchronization Logic ✅ COMPLETED

1. **Create New Synchronization Hook** ✅
   - Implemented `useSyncTo3D` hook with options for view, layers, and features
   - Added proper error handling and logging
   - Implemented smooth transitions with proper easing
   - Added support for different layer types (vector, 3D tiles, imagery)

2. **Update View Synchronization** ✅
   - Removed continuous synchronization (useCameraSync)
   - Kept view state conversion functions
   - Added proper error handling and validation
   - Implemented smooth transitions with proper easing

3. **Layer Synchronization** ✅
   - Implemented layer cleanup before adding new layers
   - Added support for different layer types
   - Added proper error handling for layer conversion
   - Implemented proper layer state management

4. **Integration** ✅
   - Updated `SyncTo3DButton` to use new synchronization hook
   - Added proper loading states and error handling
   - Implemented proper cleanup of resources
   - Added comprehensive logging

### Phase 4: Layer Selection Implementation

1. **Update Layer List Component**
```typescript
function LayerList() {
  const { layers, selectedLayers, toggleSelection } = useLayerManagement();
  
  return (
    <div>
      {layers.map(layer => (
        <LayerItem
          key={layer.id}
          layer={layer}
          selected={selectedLayers.includes(layer.id)}
          onSelect={() => toggleSelection(layer.id)}
        />
      ))}
    </div>
  );
}
```

2. **Implement Layer Synchronization**
```typescript
function useLayerSync() {
  const syncSelectedLayersTo3D = async () => {
    const selectedLayers = getSelectedLayers();
    
    // Clear existing 3D layers
    clear3DLayers();
    
    // Add selected layers to 3D view
    for (const layer of selectedLayers) {
      await addLayerTo3D(layer);
    }
  };
  
  return { syncSelectedLayersTo3D };
}
```

### Phase 5: Feature Selection (Future)

1. **Add Feature Selection Infrastructure**
```typescript
interface FeatureSelection {
  layerId: string;
  featureIds: string[];
}

function useFeatureSelection() {
  const [selectedFeatures, setSelectedFeatures] = useState<FeatureSelection[]>([]);
  
  const selectFeature = (layerId: string, featureId: string) => {
    // Implementation for feature selection
  };
  
  const syncSelectedFeaturesTo3D = async () => {
    // Implementation for feature synchronization
  };
  
  return {
    selectedFeatures,
    selectFeature,
    syncSelectedFeaturesTo3D
  };
}
```

## Implementation Steps

1. **Week 1: UI and Layout** ✅
   - [x] Update MapContainer layout
   - [x] Create SyncTo3DButton component
   - [x] Implement basic view synchronization
   - [x] Add layer selection UI

2. **Week 2: State Management** ✅
   - [x] Update layer state management
   - [x] Implement layer selection logic
   - [x] Create synchronization hooks
   - [x] Add view state conversion

3. **Week 3: Layer Synchronization** ✅
   - [x] Implement layer synchronization
   - [x] Add layer cleanup
   - [x] Create layer adapters
   - [x] Add error handling

4. **Week 4: Testing and Refinement**
   - [ ] Test all layer types
   - [ ] Verify synchronization
   - [ ] Performance optimization
   - [ ] Edge case handling

## Technical Considerations

1. **Performance**
   - Efficient layer synchronization
   - Optimized view state conversion
   - Memory management for unused layers
   - Smooth transitions

2. **Error Handling**
   - Graceful fallbacks for sync failures
   - Clear error messages
   - Recovery mechanisms
   - State validation

3. **Browser Support**
   - WebGL compatibility
   - Memory constraints
   - Mobile device considerations

## Future Enhancements

1. **Advanced Features**
   - Feature-level selection
   - Custom layer styles
   - Advanced view transitions
   - Analysis tools

2. **Performance Optimizations**
   - Layer caching
   - Progressive loading
   - Resource cleanup
   - View-specific optimizations

3. **User Experience**
   - Better sync feedback
   - Layer preview
   - Selection history
   - Keyboard shortcuts 