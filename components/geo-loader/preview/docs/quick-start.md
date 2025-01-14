# Preview Manager Quick Start Guide

This guide helps you get started with using the Preview Manager system for handling geographic data previews.

## Installation

The Preview Manager is part of the geo-loader component. No additional installation is required if you're working within the project.

## Basic Usage

### 1. Creating a Preview Manager

```typescript
import { PreviewManager, PreviewOptions } from './preview';
import { COORDINATE_SYSTEMS } from '../types/coordinates';

// Configure options
const options: PreviewOptions = {
  maxFeatures: 1000,
  coordinateSystem: COORDINATE_SYSTEMS.SWISS_LV95,
  enableCaching: true,
  smartSampling: true
};

// Create manager instance
const manager = new PreviewManager(options);
```

### 2. Loading Features

```typescript
// Load GeoJSON features
const features = [
  {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [2600000, 1200000]
    },
    properties: {
      layer: 'points',
      name: 'Location A'
    }
  }
];

// Set features in manager
await manager.setFeatures(features);
```

### 3. Getting Preview Collections

```typescript
// Get categorized collections
const collections = await manager.getPreviewCollections();

// Access different feature types
const { points, lines, polygons } = collections;

console.log(`Found ${points.features.length} point features`);
console.log(`Found ${lines.features.length} line features`);
console.log(`Found ${polygons.features.length} polygon features`);
```

### 4. Managing Visible Layers

```typescript
// Update visible layers
manager.setOptions({
  visibleLayers: ['layer1', 'layer2']
});

// Check if there are visible features
const hasVisible = await manager.hasVisibleFeatures();
```

### 5. Changing Coordinate System

```typescript
// Switch to WGS84
manager.setOptions({
  coordinateSystem: COORDINATE_SYSTEMS.WGS84
});

// Get updated collections
const updatedCollections = await manager.getPreviewCollections();
```

## Common Use Cases

### 1. Large Dataset Handling

```typescript
// Configure for large datasets
const manager = new PreviewManager({
  maxFeatures: 50000,
  smartSampling: true,
  enableCaching: true
});

// Load large dataset
const largeFeatureSet = await loadLargeGeoJSON();
await manager.setFeatures(largeFeatureSet);
```

### 2. Swiss Coordinate System

```typescript
// Configure for Swiss data
const manager = new PreviewManager({
  coordinateSystem: COORDINATE_SYSTEMS.SWISS_LV95,
  viewportBounds: [2485000, 1075000, 2834000, 1299000]
});

// Load Swiss coordinates
const swissFeatures = await loadSwissShapefile();
await manager.setFeatures(swissFeatures);
```

### 3. Layer Management

```typescript
// Initialize with specific layers
const manager = new PreviewManager({
  visibleLayers: ['buildings', 'roads']
});

// Update layer visibility
function toggleLayer(layer: string, visible: boolean) {
  const currentLayers = manager.getOptions().visibleLayers || [];
  
  const newLayers = visible
    ? [...currentLayers, layer]
    : currentLayers.filter(l => l !== layer);
    
  manager.setOptions({ visibleLayers: newLayers });
}
```

### 4. Custom Projections

```typescript
// Set custom Mapbox projection
manager.setMapProjection({
  name: 'lambertConformalConic',
  center: [8.2275, 46.8182],
  parallels: [45.8, 47.8]
});
```

## Best Practices

### 1. Resource Management

Always dispose of the manager when you're done:

```typescript
// Clean up resources
manager.dispose();
```

### 2. Error Handling

```typescript
try {
  await manager.setFeatures(features);
} catch (error) {
  if (error instanceof CoordinateTransformError) {
    console.error('Coordinate transformation failed:', error.message);
  } else {
    console.error('Feature processing failed:', error);
  }
}
```

### 3. Performance Optimization

```typescript
// Configure for optimal performance
const manager = new PreviewManager({
  maxFeatures: 10000,
  enableCaching: true,
  smartSampling: true
});

// Pre-process features in chunks
const chunks = chunkArray(features, 1000);
for (const chunk of chunks) {
  await manager.setFeatures(chunk);
}
```

### 4. Memory Management

```typescript
// Monitor memory usage
const manager = new PreviewManager({
  maxFeatures: 5000,
  enableCaching: true
});

// Clear cache when needed
function handleLowMemory() {
  manager.setOptions({ enableCaching: false });
  // ... handle low memory situation
  manager.setOptions({ enableCaching: true });
}
```

## Troubleshooting

### 1. Coordinate System Issues

If features aren't displaying correctly:
1. Verify the input coordinate system
2. Check for coordinate system mismatches
3. Validate bounds are within expected ranges

```typescript
// Validate coordinate system
const options = manager.getOptions();
console.log('Current system:', options.coordinateSystem);

// Check transformed features
const collections = await manager.getPreviewCollections();
const hasTransformed = collections.points.features.some(
  f => f.properties?._transformedCoordinates
);
```

### 2. Performance Issues

If experiencing slow performance:
1. Enable smart sampling
2. Reduce maximum features
3. Use streaming for large datasets

```typescript
// Optimize for performance
manager.setOptions({
  maxFeatures: 5000,
  smartSampling: true,
  enableCaching: true
});
```

### 3. Memory Issues

If encountering memory problems:
1. Reduce cache TTL
2. Enable streaming
3. Process features in smaller chunks

```typescript
// Handle memory constraints
manager.setOptions({
  maxFeatures: 1000,
  enableCaching: false
});
```

## Next Steps

- Review the [Architecture Documentation](./architecture.md) for system design details
- Check the [Implementation Guide](./implementation-guide.md) for technical details
- Explore the source code for advanced usage
