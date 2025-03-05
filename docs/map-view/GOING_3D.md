# Three.js Integration Implementation Plan

## Current Architecture Status ✅
- Imports geospatial formats (GeoJSON, Shapefiles)
- Uses three-tiered coordinate system detection
- Transforms coordinates to WGS84 (EPSG:4326) during parsing
- Displays preview in MapBox
- Stores data in PostGIS (WGS84 format)

## Implementation Phases

### Phase 1: Proof of Concept 🚀
- [ ] Create basic Three.js viewer
- [ ] Implement coordinate transformation system
- [ ] Display simple WGS84 data
- [ ] Test with small dataset

#### Technical Details - Coordinate Transformation
```javascript
// Convert WGS84 (lat/lon) to Three.js coordinates
function geoToCartesian(lon, lat, radius = 6371) {
  const lonRad = (lon * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  
  const x = radius * Math.cos(latRad) * Math.cos(lonRad);
  const y = radius * Math.sin(latRad);
  const z = radius * Math.cos(latRad) * Math.sin(lonRad);
  
  return new THREE.Vector3(x, y, z);
}
```

### Phase 2: Core Integration 🔄
- [ ] Implement VisualizationManager
- [ ] Add 2D/3D view switching
- [ ] Handle different geometry types:
  - [ ] Points using THREE.Points
  - [ ] Lines using THREE.Line
  - [ ] Polygons using THREE.Mesh with triangulation

#### Technical Details - Visualization Manager
```javascript
class VisualizationManager {
  private mapboxView: MapboxView;
  private threeJsView: ThreeJsView;
  private currentDataset: FullDataset;
  
  constructor() {
    this.mapboxView = new MapboxView();
    this.threeJsView = new ThreeJsView();
  }
  
  setData(dataset: FullDataset) {
    this.currentDataset = dataset;
    this.mapboxView.setData(dataset);
    this.threeJsView.setData(dataset);
  }
  
  switchTo2D() {
    // Hide 3D view, show 2D view
  }
  
  switchTo3D() {
    // Hide 2D view, show 3D view
  }
}
```

### Phase 3: Performance Optimization 🔧
- [ ] Implement Level of Detail (LOD) techniques
- [ ] Add data chunking system
- [ ] Implement WebGL instancing for repeated geometries
- [ ] Address coordinate precision issues:
  - [ ] Center scene at (0,0,0)
  - [ ] Implement coordinate offsetting
  - [ ] Add relative positioning system

### Phase 4: Advanced Features 🌟
- [ ] Add elevation data support:
  - [ ] Property-based height
  - [ ] External elevation services integration
  - [ ] DEM data support
- [ ] Implement interactive features:
  - [ ] Selection
  - [ ] Highlighting
  - [ ] Navigation controls
- [ ] Add terrain visualization
- [ ] Implement building extrusion

## Required Dependencies
- Three.js (Core 3D library)
- geo-three (Geographic coordinates support)
- threo (GeoJSON integration)
- earcut (Polygon triangulation)
- deck.gl (Large dataset handling)

## Technical Considerations

### Data Flow
1. Import → WGS84 transformation (existing)
2. PostGIS storage (existing)
3. API endpoints for 3D optimization (new)
4. Visualization layer (new)

### Potential Challenges
1. **Performance with Large Datasets**
   - Solution: Implement LOD and chunking
   - Status: To be addressed in Phase 3

2. **Elevation Data Handling**
   - Solution: Multiple data source support
   - Status: To be addressed in Phase 4

3. **Coordinate Precision**
   - Solution: Relative positioning system
   - Status: To be addressed in Phase 3

## Progress Tracking
- [ ] Phase 1 Complete
- [ ] Phase 2 Complete
- [ ] Phase 3 Complete
- [ ] Phase 4 Complete

## Notes
- Each phase should be tested thoroughly before moving to the next
- Regular performance benchmarking required
- Document any deviations or additional requirements
- Update this plan as implementation progresses