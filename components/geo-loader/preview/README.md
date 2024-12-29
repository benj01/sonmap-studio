# Preview Manager

A TypeScript class for managing geographic data previews with caching and streaming support.

## Overview

The PreviewManager handles:
- Feature collection management
- Coordinate system transformations
- Layer visibility control
- Feature sampling for large datasets
- Cache management
- Bounds calculation and validation

## Structure

```
preview/
├── modules/              # Core functionality modules
├── preview-manager.ts    # Main PreviewManager class
└── README.md            # Documentation
```

## Features

### Feature Management
- Streaming support for large datasets
- Memory usage monitoring
- Feature type categorization (points, lines, polygons)
- Layer-based filtering

### Caching
- In-memory cache for preview collections
- Cache invalidation on option changes
- Cache key generation based on visible layers

### Sampling Strategy
- Smart sampling for large point datasets
- Grid-based point sampling
- Progressive feature loading
- Configurable feature limits

### Bounds Handling
- Automatic bounds calculation
- Bounds validation
- Padding calculation
- Coordinate system transformation

## Usage

```typescript
import { createPreviewManager } from './preview-manager';

// Create a new preview manager
const manager = createPreviewManager({
  maxFeatures: 5000,
  visibleLayers: ['layer1', 'layer2'],
  coordinateSystem: 'EPSG:2056',
  enableCaching: true,
  smartSampling: true
});

// Set features
await manager.setFeatures(geoJsonFeatures);

// Get preview collections
const collections = await manager.getPreviewCollections();

// Update options
manager.setOptions({
  visibleLayers: ['layer1']
});
```

## Configuration

### PreviewOptions
- `maxFeatures`: Maximum number of features to include
- `visibleLayers`: Array of visible layer names
- `coordinateSystem`: Target coordinate system
- `enableCaching`: Enable/disable caching
- `smartSampling`: Enable/disable smart sampling
- `analysis`: Analysis results including warnings
- `onProgress`: Progress callback function
- `viewportBounds`: Current viewport bounds
- `initialBounds`: Initial view bounds

## Best Practices

1. Memory Management
   - Monitor memory usage with `maxMemoryMB`
   - Use streaming for large datasets
   - Implement feature cleanup

2. Performance
   - Enable caching for repeated operations
   - Use smart sampling for large point datasets
   - Filter features by visibility early

3. Coordinate Systems
   - Always validate coordinate system support
   - Handle transformations properly
   - Validate bounds after transformation

4. Error Handling
   - Validate input data
   - Handle transformation errors
   - Provide fallback values

5. Cache Management
   - Clear cache when necessary
   - Use appropriate cache keys
   - Validate cached data

## Implementation Details

### Feature Processing
1. Features are streamed through FeatureManager
2. Each feature is categorized by geometry type
3. Layer visibility is checked
4. Bounds are calculated and updated
5. Features are cached for reuse

### Sampling Strategy
1. Grid size is calculated based on maxFeatures
2. Points are sampled based on grid cells
3. Non-point features are always included
4. Feature count is monitored

### Cache Management
1. Cache key is generated from visible layers
2. Collections are cached with bounds
3. Cache is invalidated on option changes
4. Cached results include all necessary metadata

### Bounds Handling
1. Initial bounds are validated
2. Bounds are transformed if needed
3. Padding is added for context
4. Invalid bounds use default values

## Error Handling

The PreviewManager implements comprehensive error handling:
- Input validation
- Coordinate system verification
- Bounds validation
- Memory monitoring
- Feature processing errors

## Dependencies

- @turf/bbox
- @turf/boolean-intersects
- proj4
