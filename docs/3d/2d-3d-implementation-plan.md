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

### Phase 1: UI Layout Changes

1. **Update MapContainer Layout**
```typescript
function MapContainer() {
  return (
    <div className="flex h-full">
      {/* 3D Map Section (Primary) */}
      <div className="flex-1 relative">
        <CesiumView />
      </div>
      
      {/* 2D Map Section (Secondary) */}
      <div className="w-1/3 relative">
        <MapView />
        <div className="absolute top-4 right-4">
          <SyncTo3DButton />
        </div>
      </div>
    </div>
  );
}
```

2. **Create SyncTo3DButton Component**
```typescript
function SyncTo3DButton() {
  const { syncTo3D } = useSyncTo3D();
  const [isSyncing, setIsSyncing] = useState(false);
  
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncTo3D({
        includeLayers: true,
        includeView: true
      });
    } finally {
      setIsSyncing(false);
    }
  };
  
  return (
    <Button 
      onClick={handleSync}
      disabled={isSyncing}
    >
      {isSyncing ? 'Syncing...' : 'Sync to 3D'}
    </Button>
  );
}
```

### Phase 2: State Management Updates

1. **Update Layer State Management**
```typescript
interface SelectedItems {
  layers: string[];
  features?: string[]; // For future feature selection
}

interface LayerState {
  id: string;
  visible: boolean;
  selected: boolean;
  metadata: {
    sourceType: '2d' | '3d' | 'both';
    source2D?: any;
    source3D?: any;
    style?: any;
  };
}
```

2. **Update Layer Context**
```typescript
interface LayerContextType {
  layers: LayerState[];
  selectedLayers: string[];
  addLayer: (layer: LayerState) => void;
  removeLayer: (id: string) => void;
  toggleVisibility: (id: string) => void;
  toggleSelection: (id: string) => void;
  updateLayer: (id: string, updates: Partial<LayerState>) => void;
  getSelectedLayers: () => LayerState[];
}
```

### Phase 3: Synchronization Logic

1. **Create New Synchronization Hook**
```typescript
interface SyncOptions {
  includeLayers: boolean;
  includeView: boolean;
  includeFeatures?: boolean;
}

function useSyncTo3D() {
  const syncTo3D = async (options: SyncOptions) => {
    // 1. Sync view state
    if (options.includeView) {
      await syncViewState();
    }
    
    // 2. Sync selected layers
    if (options.includeLayers) {
      await syncSelectedLayers();
    }
    
    // 3. Sync selected features (future)
    if (options.includeFeatures) {
      await syncSelectedFeatures();
    }
  };
  
  return { syncTo3D };
}
```

2. **Update View Synchronization**
```typescript
function useViewSync() {
  const syncViewTo3D = async () => {
    // Get current 2D view state
    const center = map.getCenter();
    const zoom = map.getZoom();
    
    // Convert to 3D camera position
    const height = calculateHeightFromZoom(zoom);
    
    // Set 3D camera to top-down view
    await viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        center.lng,
        center.lat,
        height
      ),
      orientation: {
        heading: 0,
        pitch: -Math.PI/2, // Top-down view
        roll: 0
      }
    });
  };
  
  return { syncViewTo3D };
}
```

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

1. **Week 1: UI and Layout**
   - [ ] Update MapContainer layout
   - [ ] Create SyncTo3DButton component
   - [ ] Implement basic view synchronization
   - [ ] Add layer selection UI

2. **Week 2: State Management**
   - [ ] Update layer state management
   - [ ] Implement layer selection logic
   - [ ] Create synchronization hooks
   - [ ] Add view state conversion

3. **Week 3: Layer Synchronization**
   - [ ] Implement layer synchronization
   - [ ] Add layer cleanup
   - [ ] Create layer adapters
   - [ ] Add error handling

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