# Height Configuration Technical Reference

## Architecture Overview

The Height Configuration system follows a layered architecture:

1. **User Interface Layer**: Dialog components and UI controls
2. **State Management Layer**: Zustand stores for layers and preferences
3. **Processing Layer**: Services for transformation and batch processing
4. **API Layer**: Endpoints for initialization and status monitoring
5. **Database Layer**: Tables and functions for persistent storage

## Data Models

### Layer Metadata Height Configuration

```typescript
height?: {
  // Primary configuration mode
  mode: 'simple' | 'advanced';
  
  // Simple mode (backward compatible)
  sourceType?: 'z_coord' | 'attribute' | 'none';
  attributeName?: string;
  interpretationMode?: 'absolute' | 'relative' | 'extrusion';
  
  // Advanced mode
  advanced?: {
    // Base elevation configuration
    baseElevation: {
      source: 'z_coord' | 'attribute' | 'terrain';
      attributeName?: string;
      isAbsolute: boolean; // true = absolute elevation, false = relative to terrain
    };
    
    // Height/Top configuration
    heightConfig: {
      source: 'attribute' | 'calculated' | 'none';
      attributeName?: string;
      isRelative: boolean; // true = height value, false = absolute top elevation
    };
    
    // Visualization settings
    visualization: {
      type: 'extrusion' | 'point_elevation' | 'line_elevation';
      extrudedFaces?: boolean; // For polygon extrusion: show side faces
      extrudedTop?: boolean; // For polygon extrusion: show top face
    };
  };
  
  // Processing status fields
  transformationStatus?: 'pending' | 'in_progress' | 'complete' | 'failed';
  transformationProgress?: {
    processed: number;
    total: number;
    startTime?: number;
    endTime?: number;
  };
  transformationError?: string;
}
```

### Transformation Status Response

```typescript
interface HeightTransformationStatus {
  layer_id: string;
  latest_batch?: {
    id: string;
    status: 'pending' | 'in_progress' | 'complete' | 'failed';
    height_source_type: string;
    height_source_attribute: string | null;
    total_features: number;
    processed_features: number;
    failed_features: number;
    started_at: string;
    completed_at: string | null;
  };
  feature_status: {
    total: number;
    pending: number;
    in_progress: number;
    complete: number;
    failed: number;
  };
}
```

## Key Components

### HeightConfigurationDialog
- Located in `components/map/dialogs/HeightConfigurationDialog.tsx`
- Provides user interface for configuring height sources
- Features:
  - Simple and advanced configuration modes
  - Height source selection (Z-coord, attribute, none)
  - Attribute discovery and filtering
  - Swiss coordinate detection and transformation options
  - Apply to all layers functionality
  - Preference saving integration

### HeightTransformService
- Located in `components/map/services/heightTransformService.ts`
- Provides utility functions for height transformation
- Features:
  - Coordinate processing functions
  - Feature collection handling
  - Swiss coordinate transformation

### HeightTransformBatchService
- Located in `components/map/services/HeightTransformBatchService.ts`
- Manages batch processing of large datasets
- Features:
  - Chunked processing for memory efficiency
  - Progress tracking and reporting via observer pattern
  - Cancellation support via AbortController
  - Retry logic with exponential backoff
  - Error handling and reporting

### Layer Store
- Located in `store/layers/layerStore.ts`
- Manages layer state and metadata
- Features:
  - Height configuration in layer metadata
  - updateLayerHeightSource action
  - Transformation status tracking

### User Preference Store
- Located in `store/userPreferenceStore.ts`
- Manages user preferences for height configuration
- Features:
  - Preference storage using Zustand persist
  - Default configurations for new dialogs

## Integration Points

### CesiumView Integration
- Located in `components/map/CesiumView.tsx`
- Applies height configuration during rendering
- Features:
  - Handling different interpretation modes
  - Special processing for different geometry types
  - Dynamic updates based on configuration changes

### Layer Settings Dialog Integration
- Located in `components/map/components/LayerSettingsDialog.tsx`
- Provides access to height configuration from layer settings
- Features:
  - 3D Settings tab with height configuration button
  - Current configuration display

## Processing Workflow

1. **Configuration**: User configures height source through dialog
2. **Initialization**: System initializes transformation batch
3. **Processing**: Features are processed in chunks with progress tracking
4. **Status Monitoring**: UI displays real-time progress
5. **Completion**: Results are stored and applied to visualization

## Design Considerations

### Performance Optimization
- Chunked processing to avoid memory issues
- Efficient batch API endpoints
- Swiss coordinate transformation optimizations
- Caching mechanisms for repeated operations

### Error Handling
- Multi-level validation (UI, API, database)
- Comprehensive error reporting
- Graceful fallbacks for edge cases
- Status tracking for failures

### Extensibility
- Modular architecture for adding new height sources
- Separation of UI and processing logic
- Clear interfaces between components
- Configuration-driven behavior 