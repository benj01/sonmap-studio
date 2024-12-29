# Preview Map Component

A modular React component for displaying and interacting with geographic data on a map.

## Structure

```
preview-map/
├── components/           # UI components
│   ├── map-layers.tsx   # Layer rendering components (points, lines, polygons)
│   └── map-controls.tsx # Map controls (attribution, stats, coordinates, etc.)
├── hooks/               # Custom React hooks
│   └── use-preview-state.ts # State management for preview features
└── index.tsx           # Main PreviewMap component
```

## Components

### MapLayers
Handles the rendering of different geometry types:
- Points (with clustering)
- Lines
- Polygons

### Map Controls
UI components for map interaction:
- Attribution
- Stats display
- Coordinates display
- Feature tooltips
- Loading overlay
- Error messages
- Progress bar

## Hooks

### usePreviewState
Manages the state of preview features including:
- Feature filtering
- Cache management
- Viewport bounds handling
- Layer visibility

## Usage

```tsx
import { PreviewMap } from './components/geo-loader/components/preview-map';

function App() {
  return (
    <PreviewMap
      preview={previewData}
      bounds={mapBounds}
      coordinateSystem="EPSG:4326"
      visibleLayers={['layer1', 'layer2']}
      selectedElement={selectedFeature}
      analysis={analysisResults}
    />
  );
}
```

## Props

- `preview`: Preview data including features, bounds, layers, and preview manager
- `bounds`: Initial view bounds
- `coordinateSystem`: Target coordinate system (defaults to WGS84)
- `visibleLayers`: Array of visible layer names
- `selectedElement`: Currently selected feature
- `analysis`: Analysis results including warnings

## Features

- Automatic coordinate system transformation
- Feature clustering for points
- Layer visibility toggling
- Feature filtering by viewport
- Cache management for better performance
- Progress tracking for long operations
- Error handling and display
- Interactive tooltips
- Coordinate display
- Statistics display

## Dependencies

- react-map-gl
- mapbox-gl
- @turf/bbox-polygon
- @turf/boolean-intersects

## Best Practices

1. Layer Management
   - Use separate components for different geometry types
   - Filter features by visibility before rendering
   - Handle layer ordering properly

2. State Management
   - Use hooks for complex state logic
   - Cache results when possible
   - Debounce viewport updates

3. Performance
   - Implement feature clustering for points
   - Use viewport filtering to reduce rendered features
   - Cache processed features

4. Error Handling
   - Display user-friendly error messages
   - Provide fallback states
   - Log detailed errors for debugging

5. Coordinate Systems
   - Always transform coordinates to WGS84 for display
   - Validate bounds before use
   - Handle coordinate system conversions properly
