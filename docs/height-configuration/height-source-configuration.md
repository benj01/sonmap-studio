# Height Source Configuration System

## Overview
The Height Source Configuration system enables Sonmap Studio to visualize 2D vector data in 3D by handling various height data sources and applying appropriate transformations. This document outlines the current implementation status, remaining tasks, and considerations for future development.

## Current Implementation Status

### Completed Components

#### 1. Height Configuration Dialog (components/map/dialogs/HeightConfigurationDialog.tsx)
- UI for selecting height sources: Z-coordinates, numeric attributes, or no height
- Attribute discovery and filtering for appropriate numeric ranges (-100m to 4000m)
- Live preview of height values for selected features
- Options for "Apply to all layers" and "Save preference"

#### 2. Layer Settings Integration (components/map/components/LayerSettingsDialog.tsx)
- 3D Settings tab with height configuration button
- Toast and Alert notifications for height source updates
- Height source selection callback implementation

#### 3. State Management (store/layers/layerStore.ts, store/layers/types.ts)
- Height configuration added to layer metadata model
- `updateLayerHeightSource` action implemented
- Type definitions for height source types

#### 4. Height Processing (components/map/components/cesium/CesiumView.tsx)
- `applyHeightToFeatures` function for processing GeoJSON
- Detection of features needing height transformation
- Integration with Cesium for 3D visualization

#### 5. Height Transformation Service (components/map/services/heightTransformService.ts)
- `processFeatureCollectionHeights` function for coordinating transformations
- `needsHeightTransformation` for detecting features requiring height conversion

### Partially Implemented Features

#### 1. Multi-layer Support
- UI exists in dialog but backend functionality incomplete
- Need to implement looping through all layers when "Apply to all layers" is selected

#### 2. Preference Saving
- UI exists but storage mechanism not implemented
- Need to add persistence for user preferences

## Supported Height Source Scenarios

### 1. Z-Coordinate Based Heights
- Features with existing Z values in coordinates (XYZ)
- Handled through the `z_coord` source type
- Requires transformation from LV95 to WGS84 ellipsoidal heights

### 2. Attribute-Based Heights
- Features with height values stored in properties
- Handled through the `attribute` source type
- User selects which attribute contains height values
- System filters attributes with reasonable height ranges

### 3. No Height Data
- Features displayed flat on the terrain
- Uses Cesium's `clampToGround` option

## Remaining Tasks

### 1. Database Updates
- Add columns for storing transformed heights
- Add transformation status flags
- Implement reset capability

### 2. Performance Optimization
- Implement batched processing for large datasets
- Add progress indicators
- Implement caching
- Add transformation cancellation support

### 3. UX Enhancements
- Add visual feedback during visualization
- Improve error handling
- Add user guidance

## Extended Considerations for 3D Visualization

### Building and Complex Geometry Scenarios

#### Different Height Representation Cases
1. **XYZ Point Data**
   - Z values stored in geometry
   - Already supported in current implementation

2. **Attribute-Based Point Heights**
   - Z values stored in feature properties
   - Already supported in current implementation

3. **Buildings with Z-Values in Geometry**
   - MultiPolygons with Z coordinates
   - Requires correct transformation of Z values

4. **Buildings on Surface (Flat Geometries)**
   - Options needed for terrain clamping vs. absolute elevation
   - Decision point for users to choose appropriate visualization

5. **Buildings with Height Attributes**
   - Base height + building height scenario
   - Absolute height values (meters above sea level)
   - Relative height values (e.g., 12m building height)
   - Need for extrusion configuration

6. **Complex 3D Geometries**
   - Beyond simple extrusions
   - Requires 3D Tiles with embedded glTFs

### Proposed 3D Tiles Implementation

#### Backend Processing Flow
1. User uploads/selects dataset (GeoJSON, glTF, OBJ) in frontend
2. Node.js backend processes the data
3. Backend uses 3d-tiles-tools to:
   - Convert source format to .b3dm (Binary 3D Model)
   - Generate tileset.json with appropriate metadata
4. Backend serves the tileset through an API endpoint
5. Frontend loads the tileset using Cesium's `Cesium3DTileset` API

#### Technical Considerations
- Processing requirements for conversion
- Storage needs for tilesets
- Caching strategy for performance
- Progressive loading for large datasets

## Implementation Priorities

### Phase 1: Complete Current Features
1. Implement "Apply to all layers" functionality
2. Add preference saving mechanism
3. Begin database schema updates

### Phase 2: Enhance Height Transformation
1. Add extrusion support for buildings
2. Implement performance optimizations with batching
3. Add progress indicators and cancellation support

### Phase 3: Implement 3D Tiles Pipeline
1. Set up Node.js backend processing
2. Implement 3D Tiles conversion
3. Develop tileset management system

### Phase 4: UX and Performance
1. Enhance configuration interface for complex scenarios
2. Implement visual previews
3. Optimize for large datasets

## Extended Configuration Interface Needs

1. **Height Source Extensions**
   - Add 'extrusion' type
   - Add 'complex_model' type

2. **Additional Configuration Options**
   - Base height source selection
   - Extrusion height source and scale factor
   - Clamping options
   - 3D Model conversion preferences

3. **Database Schema Extensions**
   - Height processing status tracking
   - Transformed data storage
   - 3D Tiles references
   - User preferences storage

## Conclusion

The Height Source Configuration system provides a foundation for 3D visualization in Sonmap Studio. While the basic functionality for handling Z-coordinates and numeric attributes is in place, significant work remains to support complex scenarios like buildings with height attributes and true 3D models. The planned implementation phases will address these needs incrementally, starting with completing the current features before moving on to more advanced capabilities. 