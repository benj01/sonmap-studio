# 2D-3D View Integration Plan

## Current Architecture

### Components
1. **MapContainer**: Main container component that manages view state (2D/3D)
2. **MapView**: 2D view using Mapbox GL
3. **CesiumView**: 3D view using Cesium
4. **LayerPanel**: Panel showing available layers
5. **LayerList**: 2D layer management
6. **CesiumLayerList**: 3D layer management

### State Management
1. **MapContext**: Manages 2D map state and layers
2. **CesiumContext**: Manages 3D viewer state
3. **Layer Management**:
   - 2D: Uses Mapbox GL layers
   - 3D: Uses Cesium entities, tilesets, etc.

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

### Phase 1: Unified Layer State Management (In Progress)

1. ✅ Create a new shared layer context:
```typescript
// contexts/SharedLayerContext.tsx
interface SharedLayer {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  metadata: {
    sourceType: '2d' | '3d' | 'both';
    source2D?: any;
    source3D?: any;
    style?: any;
  };
  selected: boolean;
}

interface SharedLayerContextType {
  layers: SharedLayer[];
  addLayer: (layer: SharedLayer) => void;
  removeLayer: (id: string) => void;
  toggleVisibility: (id: string) => void;
  toggleSelection: (id: string) => void;
  updateLayer: (id: string, updates: Partial<SharedLayer>) => void;
}
```

2. ✅ Implement layer adapters:
```typescript
// utils/layer-adapters.ts
interface LayerAdapter {
  to2D: (layer: SharedLayer) => MapboxLayer;
  to3D: (layer: SharedLayer) => CesiumLayer;
  from2D: (layer: MapboxLayer) => SharedLayer;
  from3D: (layer: CesiumLayer) => SharedLayer;
}
```

### Discovered Issues During Phase 1 Implementation

1. **2D Map Not Showing After View Switch**
   - Root Cause: MapView component's lifecycle management issue
   - Current Problem:
     ```typescript
     // In MapView.tsx
     if (contextMap) {
       logger.debug('Map already exists in context, skipping initialization');
       return;
     }
     ```
   - The old map instance remains in context but has been destroyed
   - Required Fixes:
     - Modify MapView initialization logic for proper remounting
     - Clear map instance from context when switching views
     - Ensure proper cleanup of previous map instance

2. **Missing Features and Layer List**
   - Root Cause: Incomplete integration with new SharedLayerContext
   - Issues:
     - Data loading not integrated with SharedLayerContext
     - Existing layer data not migrated to new shared format
     - Layer list not properly connected to both views
   - Required Fixes:
     - Implement data loading integration
     - Convert existing layers to shared format
     - Connect layer list to both views

### Next Steps for Phase 1 Completion

1. Fix View Switching Issues:
   - Update MapView initialization logic
   - Implement proper context cleanup
   - Add view state preservation

2. Complete Layer Integration:
   - Implement data loading with SharedLayerContext
   - Create layer migration utilities
   - Update layer list components

### Phase 2: View Synchronization (Pending)

1. Implement view state synchronization:
```typescript
// hooks/useViewSync.ts
interface ViewState {
  center: [number, number];
  zoom: number;
  pitch?: number;
  bearing?: number;
}

function useViewSync() {
  const convert2DTo3D = (state: ViewState) => {
    // Convert Mapbox coordinates to Cesium camera position
  };

  const convert3DTo2D = (camera: CesiumCamera) => {
    // Convert Cesium camera to Mapbox coordinates
  };

  return {
    convert2DTo3D,
    convert3DTo2D,
    syncViews: (from: '2d' | '3d', state: any) => {
      // Synchronize view states
    }
  };
}
```

2. Update view toggle logic:
```typescript
// components/ViewToggle.tsx
const handleViewToggle = async () => {
  // 1. Capture current view state
  // 2. Convert coordinates/camera position
  // 3. Apply smooth transition
  // 4. Update layer visibility
};
```

### Phase 3: Layer Data Integration (Pending)

1. Create unified data sources:
```typescript
// utils/data-sources.ts
interface UnifiedDataSource {
  type: 'geojson' | 'vector' | '3d-tiles' | 'terrain';
  source2D?: mapboxgl.AnySourceData;
  source3D?: Cesium.AnyDataSource;
  convert: () => Promise<{
    mapbox: mapboxgl.AnySourceData;
    cesium: Cesium.AnyDataSource;
  }>;
}
```

2. Implement data converters:
```typescript
// utils/data-converters.ts
const converters = {
  geojsonToMapbox: (data: any) => {
    // Convert GeoJSON to Mapbox source
  },
  geojsonToCesium: (data: any) => {
    // Convert GeoJSON to Cesium entities
  },
  vectorToMapbox: (data: any) => {
    // Convert vector data to Mapbox source
  },
  vectorToCesium: (data: any) => {
    // Convert vector data to Cesium source
  }
};
```

### Phase 4: UI Updates (Pending)

1. Update LayerPanel to use shared state:
```typescript
// components/LayerPanel.tsx
function LayerPanel() {
  const { layers, toggleVisibility } = useSharedLayers();
  
  return (
    <div>
      {layers.map(layer => (
        <LayerItem
          key={layer.id}
          layer={layer}
          onToggle={() => toggleVisibility(layer.id)}
        />
      ))}
    </div>
  );
}
```

2. Create unified layer controls:
```typescript
// components/LayerControls.tsx
function LayerControls({ layer }: { layer: SharedLayer }) {
  const { updateLayer } = useSharedLayers();
  
  return (
    <div>
      {/* Common controls for both 2D and 3D */}
      <VisibilityToggle />
      <StyleControls />
      <SelectionControls />
      {/* View-specific controls */}
      {currentView === '2d' && <Mapbox2DControls />}
      {currentView === '3d' && <Cesium3DControls />}
    </div>
  );
}
```

## Implementation Steps

1. **Setup (Week 1)**
   - [x] Create SharedLayerContext
   - [x] Implement basic layer adapters
   - [x] Set up view state synchronization
   - [ ] Fix view switching issues
   - [ ] Complete layer integration

2. **Core Integration (Week 2)**
   - [ ] Implement view toggle with state preservation
   - [ ] Create unified data sources
   - [ ] Develop data converters

3. **UI Development (Week 3)**
   - [ ] Update LayerPanel
   - [ ] Create unified controls
   - [ ] Implement view-specific controls

4. **Testing & Refinement (Week 4)**
   - [ ] Test all layer types
   - [ ] Verify state preservation
   - [ ] Performance optimization
   - [ ] Edge case handling

## Technical Considerations

1. **Performance**
   - Lazy loading of view-specific resources
   - Efficient data conversion
   - Memory management for unused views

2. **Error Handling**
   - Graceful fallbacks for unsupported layer types
   - Clear error messages for conversion failures
   - Recovery mechanisms for state sync issues

3. **Browser Support**
   - WebGL compatibility checks
   - Memory constraints
   - Mobile device considerations

## Future Enhancements

1. **Advanced Features**
   - Synchronized animations
   - Cross-view selections
   - Shared analysis tools

2. **Performance Optimizations**
   - View-specific data loading
   - Intelligent resource cleanup
   - Progressive loading strategies

3. **User Experience**
   - Smoother view transitions
   - Better feedback during data loading
   - Enhanced layer management UI 