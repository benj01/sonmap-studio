# Preview Map Component Documentation

Last updated: 2025-01-05

## Overview
The Preview Map component is a React-based map visualization system built on MapBox GL. It handles the display of geographic data with support for multiple geometry types, layer management, and interactive features.

## Directory Structure

```
preview-map/
├── README.md           # Component documentation
├── components/         # UI components
│   ├── map-layers.tsx # Layer management
│   └── map-controls.tsx # UI controls
├── hooks/             # Custom React hooks
│   └── use-preview-state.ts # Preview state management
└── index.tsx         # Main component (5.5 KB)
```

## Component Details

### Main Component (index.tsx)
- Core map component
- Handles map initialization
- Manages viewport and interactions
- Size: 5.5 KB

Key Features:
- MapBox GL integration
- Coordinate system handling
- Feature selection
- Viewport management
- Event handling

### Map Layers (components/map-layers.tsx)
- Manages different geometry types
- Handles layer rendering
- Implements clustering

Features:
- Point layer management
- Line rendering
- Polygon display
- Feature clustering
- Layer ordering
- Visibility control

### Map Controls (components/map-controls.tsx)
- Provides UI controls
- Displays map information
- Handles user interaction

Features:
- Attribution display
- Statistics panel
- Coordinate display
- Feature tooltips
- Loading indicators
- Error messages
- Progress tracking

## State Management

### usePreviewState Hook
Located in `hooks/use-preview-state.ts`

Manages:
- Feature filtering
- Cache handling
- Viewport bounds
- Layer visibility
- Selection state
- Performance optimization

## Integration Points

1. MapBox Integration
   - Custom style handling
   - Layer management
   - Event system
   - Performance optimization

2. Data Processing
   - Feature filtering
   - Coordinate transformation
   - Clustering
   - Cache management

3. UI Integration
   - Control panel
   - Tooltips
   - Information display
   - Error handling

## Features

### Core Features
- ✅ Automatic coordinate transformation
- ✅ Feature clustering
- ✅ Layer visibility control
- ✅ Viewport-based filtering
- ✅ Cache management
- ✅ Progress tracking
- ✅ Error handling
- ✅ Interactive tooltips

### Advanced Features
- ✅ Custom styling
- ✅ Performance optimization
- ✅ Memory management
- ✅ Event handling
- ✅ State persistence

## Dependencies
- react-map-gl
- mapbox-gl
- @turf/bbox-polygon
- @turf/boolean-intersects

## Potential Improvements

### High Priority
1. Performance
   - [ ] Implement virtual rendering
   - [ ] Optimize large dataset handling
   - [ ] Add worker-based processing

2. Memory Management
   - [ ] Implement feature unloading
   - [ ] Add memory monitoring
   - [ ] Optimize cache size

3. User Experience
   - [ ] Add touch support
   - [ ] Improve zoom behavior
   - [ ] Enhance selection feedback

### Medium Priority
1. Features
   - [ ] Add measurement tools
   - [ ] Implement search
   - [ ] Add export options

2. Visualization
   - [ ] Add theme support
   - [ ] Improve clustering
   - [ ] Add animation options

### Low Priority
1. Integration
   - [ ] Add plugin system
   - [ ] Improve event system
   - [ ] Add state persistence

## Best Practices

1. Layer Management
   - Use separate components per geometry type
   - Filter features before rendering
   - Maintain proper layer order
   - Handle visibility efficiently

2. State Management
   - Use hooks for complex logic
   - Cache results when possible
   - Clean up resources properly
   - Handle errors gracefully

3. Performance
   - Implement viewport filtering
   - Use clustering for points
   - Manage memory usage
   - Clean up unused resources

## Notes
- Consider splitting index.tsx into smaller components
- Look into WebGL performance optimizations
- Consider adding WebWorker support for large datasets
- May need better touch device support
