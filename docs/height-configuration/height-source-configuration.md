# Height Source Configuration System

## Overview
The Height Source Configuration system enables Sonmap Studio to visualize 2D vector data in 3D by handling various height data sources and applying appropriate transformations. This document provides a comprehensive guide to the system architecture, implementation status, and future development plans.

## Supported Height Source Scenarios

### 1. Z-Coordinate Based Heights
- Features with existing Z values in coordinates (XYZ)
- Handled through the `z_coord` source type
- Requires transformation from LV95 to WGS84 ellipsoidal heights

### 2. Attribute-Based Heights
- Features with height values stored in properties
- Handled through the `attribute` source type
- User selects which attribute contains height values
- System filters attributes with reasonable height ranges (-100m to 4000m)
- Supports multiple interpretation modes for different visualization scenarios

### 3. No Height Data
- Features displayed flat on the terrain
- Uses Cesium's `clampToGround` option

### 4. Advanced Height Configuration
- Combines multiple data sources for complex height scenarios
- Separate configuration for base elevation and height/top elevation
- Supports mixed sources (e.g., z-coordinate base with attribute height)
- Specialized rendering options for different geometry types

## Height Attribute Interpretation Modes

### Simple Mode

When using attribute-based heights in simple mode, the system provides three interpretation modes:

#### 1. Absolute Elevation
- Height values represent absolute elevation above sea level
- Values are applied directly to the Z coordinate of features
- Useful for features with known absolute elevation

#### 2. Relative to Ground
- Height values represent height above terrain
- Features are positioned relative to the ground surface
- Useful for objects that should maintain a consistent height above terrain
- Uses Cesium's `HeightReference.RELATIVE_TO_GROUND` property

#### 3. Building Height (Extrusion)
- Height values represent the vertical extent of buildings
- Creates extruded 3D geometries from 2D footprints
- Useful for visualizing buildings with known heights
- Uses Cesium's extrusion capabilities for polygons

### Advanced Mode

The advanced mode provides more fine-grained control over how height values are interpreted and rendered:

#### Base Elevation Configuration
Determines where features start in 3D space:

| Source Type | Description | Configuration Options |
|-------------|-------------|------------------------|
| Z-Coordinate | Use Z values from feature geometry | Absolute (meters above sea level) |
| Attribute | Use a property value as base elevation | Attribute name, Absolute/Relative to terrain |
| Terrain | Place feature base on terrain surface | None (follows terrain) |

#### Height/Top Elevation Configuration
Determines the vertical extent or top elevation of features:

| Source Type | Description | Configuration Options |
|-------------|-------------|------------------------|
| Attribute | Use a property value for height/top | Attribute name, Relative height vs. Absolute top elevation |
| Calculated | Calculate from other attributes | Formula options (future feature) |
| None | No height (flat features) | N/A |

#### Visualization Options
Controls how the calculated heights are rendered:

| Feature Type | Visualization Options |
|--------------|------------------------|
| Polygons | Extrusion with configurable side faces and top face |
| Points | Absolute elevation or terrain-relative height |
| Lines | Absolute elevation profiles or terrain-following |

## Common Scenarios

### 1. Buildings with Absolute Base and Height Attribute
- Base: Attribute (absolute ground level)
- Height: Attribute (relative building height)
- Visualization: Extrusion with sides and top

### 2. Buildings with Terrain Base and Height Attribute
- Base: Terrain (follows ground)
- Height: Attribute (building height)
- Visualization: Extrusion with sides and top

### 3. Points with Absolute Elevations
- Base: Z-coordinate or Attribute (absolute)
- Height: None
- Visualization: Point elevation

### 4. Points with Terrain-Relative Heights
- Base: Terrain
- Height: Attribute (height above ground)
- Visualization: Point elevation (relative)

### 5. Buildings with Top Elevation Instead of Height
- Base: Attribute (absolute ground level)
- Top: Attribute (absolute roof level)
- Visualization: Extrusion with sides and top

## System Architecture

### 1. User Interface Components
- **Height Configuration Dialog** (`components/map/dialogs/HeightConfigurationDialog.tsx`)
  - Simple and Advanced configuration modes
  - Selection interface for height sources (Z-coordinates, attributes, none)
  - Attribute discovery and filtering
  - Height interpretation mode selection for attribute-based heights
  - Advanced configuration for base and top elevations
  - Visualization settings for different geometry types
  - Live preview of height values and configurations
  - Multi-layer application options
  - Preference saving capabilities
  - Preset configurations for common scenarios

- **Layer Settings Integration** (`components/map/components/LayerSettingsDialog.tsx`)
  - 3D Settings tab with height configuration button
  - Toast and Alert notifications
  - Layer compatibility detection

### 2. State Management
- **Layer Store** (`store/layers/layerStore.ts`, `store/layers/types.ts`)
  - Enhanced height configuration in layer metadata model
  - Support for both simple and advanced modes
  - Separate configuration for base and top elevations
  - Visualization settings
  - `updateLayerHeightSource` action

- **User Preferences** (`userPreferenceStore.ts`)
  - Enhanced preferences for height configuration
  - Preset configurations
  - Zustand persist middleware

### 3. Processing Components
- **Height Transformation Service** (`components/map/services/heightTransformService.ts`)
  - Coordinate height transformation
  - Feature collection processing
  - Transformation status tracking
  
- **Batch Processing Service** (`HeightTransformBatchService`)
  - Chunked processing for large datasets
  - Progress tracking and reporting
  - Retry logic and error handling
  - Cancellation support

### 4. Database Schema
- **GeoFeatures Table Enhancements**
  - Status tracking columns
  - Error recording
  - Original value preservation
  
- **Height Transformation Batches Table**
  - Batch tracking and progress metrics
  - Configuration details
  - Advanced configuration JSON storage
  - Status monitoring

- **PostgreSQL Functions**
  - Batch initialization and progress tracking
  - Status reporting and error handling
  - See [Database Schema](#database-schema) for details

### 5. API Endpoints
- **Initialization** (`/api/height-transformation/initialize`)
  - Starts new transformation batches
  - Validates feature availability
  
- **Status** (`/api/height-transformation/status`)
  - Provides transformation progress
  - Reports errors and completion status

## Data Model

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

## Implementation Status

### Completed Components

#### User Interface
- ✅ Height Configuration Dialog (Simple Mode)
- ✅ Height Configuration Dialog (Advanced Mode)
- ✅ Layer Settings Integration
- ✅ Progress tracking UI
- ✅ Layer compatibility detection
- ✅ Apply to all layers functionality
- ✅ Height attribute interpretation modes (Simple & Advanced)

#### Core Functionality
- ✅ State management integration
- ✅ Height transformation service
- ✅ Batch processing service
- ✅ Database schema and functions
- ✅ API endpoints for initialization and status
- ✅ Height interpretation and extrusion support (Simple)
- ✅ Advanced visualization options for different geometry types

#### Error Handling
- ✅ Multi-level empty layer detection
- ✅ Special case handling for 'none' height source
- ✅ Error tracking and reporting
- ✅ Graceful dialog behavior
- ✅ Type-safe handling of undefined configuration states

### In Progress Components

#### Advanced Height Configuration
- ✅ Enhanced data model with advanced mode
- ✅ UI for configuring base and top elevations
- 🔄 Advanced processing for complex height scenarios
- ✅ Visualization options for different geometry types
- 🔄 Preset configurations for common use cases

### Remaining Tasks

#### User Interface
- 🔲 Batch history view
- 🔲 Detailed error inspection UI
- 🔲 Batch cleanup functionality

#### Performance
- 🔲 Throttling for API calls
- 🔲 Caching for transformed coordinates
- 🔲 Request batching

#### Advanced Features
- 🔲 Formula-based height calculations
- 🔲 Complex building extrusion options
- 🔲 3D Tiles integration
- 🔲 Performance optimizations

## App Flow for Height Transformation

### Simple Mode Flow
1. **Configuration Selection**
   - User opens Layer Settings Dialog
   - Navigates to 3D Settings tab
   - Clicks "Configure Height Source" button

2. **Source Selection**
   - User selects height source type
   - If attribute type, selects specific attribute
   - If attribute type, selects interpretation mode
   - Optionally enables "Apply to all layers"
   - Optionally enables "Save as preference"

3. **Layer Selection** (if Apply to all layers)
   - System identifies compatible layers
   - User selects specific layers to receive configuration
   - System prevents duplicate configurations

4. **Transformation Initialization**
   - System calls `updateLayerHeightSource` action
   - API initiates transformation batch
   - Database creates batch record

5. **Progress Monitoring**
   - Client polls status endpoint
   - UI updates progress indicators
   - User can cancel transformation if needed

6. **Transformation Completion**
   - System updates feature status
   - UI shows completion message
   - 3D visualization is updated with new heights

### Advanced Mode Flow
1. **Configuration Selection**
   - User opens Layer Settings Dialog
   - Navigates to 3D Settings tab
   - Clicks "Configure Height Source" button
   - Selects "Advanced" mode using the toggle buttons

2. **Base Elevation Configuration** (First Tab)
   - User selects base elevation source (Z-coord, Attribute, Terrain)
   - If Attribute, selects specific attribute from filtered list
   - Configures absolute/relative setting if applicable
   - System validates compatibility with layer geometry

3. **Height/Top Configuration** (Second Tab)
   - User selects height/top source (Attribute, Calculated, None)
   - If Attribute, selects specific attribute from filtered list
   - Configures height type (relative height vs. absolute top)
   - System handles state preservation between tab changes

4. **Visualization Configuration** (Third Tab)
   - User selects visualization options based on geometry type
   - For polygons: Configures extrusion options (side faces, top face)
   - For points: Configures point elevation rendering
   - For lines: Configures line elevation rendering
   - System ensures visualization settings match geometry type

5. **Apply Configuration**
   - User reviews all settings in the tabbed interface
   - Optionally applies to compatible layers
   - Optionally saves as preference for future layers
   - UI provides feedback on compatibility and validation

6. **Processing and Rendering**
   - System processes features with specified configuration
   - Progress indicators show transformation status
   - Cesium applies appropriate rendering based on settings
   - 3D visualization updates with complex height handling

## Apply to All Layers Functionality

The "Apply to All Layers" feature implements intelligent layer compatibility detection:

- For **Simple Mode**:
  - **Z-coordinate mode**: Checks if other layers have Z-coordinates
  - **Attribute mode**: Verifies other layers have the selected attribute
  - **No-height mode**: All layers are considered compatible

- For **Advanced Mode**:
  - Checks base elevation source compatibility
  - If attribute-based, verifies other layers have the required attributes
  - Verifies height/top attribute availability when relevant

The interface provides:
- Clear compatibility status indicators
- Selection controls for individual layers
- "Select All" and "Deselect All" options
- Visual feedback for already-configured layers

## Database Schema

### Key Tables

#### GeoFeatures Table Enhancements
| Column | Type | Description |
|--------|------|-------------|
| `height_transformation_status` | TEXT | Status: 'pending', 'in_progress', 'complete', 'failed' |
| `height_transformed_at` | TIMESTAMP | When transformation completed |
| `height_transformation_batch_id` | UUID | Links to batch operation |
| `height_transformation_error` | TEXT | Error message if failed |
| `original_height_values` | JSONB | Pre-transformation values |

#### Height Transformation Batches Table
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `layer_id` | UUID | Layer reference |
| `height_source_type` | TEXT | Type: 'z_coord', 'attribute', 'none' |
| `height_source_attribute` | TEXT | Attribute name if applicable |
| `height_interpretation_mode` | TEXT | Interpretation mode: 'absolute', 'relative', 'extrusion' |
| `height_config_advanced` | JSONB | Advanced configuration data |
| `status` | TEXT | Batch status |
| `total_features` | INTEGER | Features to process |
| `processed_features` | INTEGER | Features processed |
| `failed_features` | INTEGER | Processing failures |
| `started_at` | TIMESTAMP | Start time |
| `completed_at` | TIMESTAMP | Completion time |

### Key Functions
- `initialize_height_transformation`: Starts batch processing
- `update_height_transformation_progress`: Updates progress
- `mark_height_transformation_complete`: Records completions
- `mark_height_transformation_failed`: Records failures
- `reset_height_transformation`: Resets transformations
- `get_height_transformation_status`: Provides status reports

## Implementation Priorities

### Phase 1: Core Functionality ✅
- ✅ Basic height source selection
- ✅ "Apply to all layers" functionality
- ✅ Preference saving
- ✅ Database schema for transformation tracking

### Phase 2: Enhanced Transformation ✅
- ✅ Batch processing with progress tracking
- ✅ Transformation UI and controls
- ✅ Basic and advanced error handling

### Phase 3: Height Interpretation Modes ✅
- ✅ Absolute elevation mode
- ✅ Relative to ground mode
- ✅ Building extrusion mode
- ✅ UI for selecting interpretation mode
- ✅ Cesium integration for different modes

### Phase 4: Advanced Height Configuration 🔄
- 🔄 Enhanced data model for complex height scenarios
- 🔄 Advanced UI with base/top elevation configuration
- 🔄 Support for mixed data sources
- 🔄 Specialized visualization options
- 🔄 Preset configurations for common scenarios

### Phase 5: Advanced Features 🔲
- 🔲 Batch history and management
- 🔲 Advanced building extrusion options
- 🔲 Formula-based height calculations
- 🔲 3D Tiles integration
- 🔲 Performance optimizations 