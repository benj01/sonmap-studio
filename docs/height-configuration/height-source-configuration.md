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

### 3. No Height Data
- Features displayed flat on the terrain
- Uses Cesium's `clampToGround` option

## System Architecture

### 1. User Interface Components
- **Height Configuration Dialog** (`components/map/dialogs/HeightConfigurationDialog.tsx`)
  - Selection interface for height sources (Z-coordinates, attributes, none)
  - Attribute discovery and filtering
  - Live preview of height values
  - Multi-layer application options
  - Preference saving capabilities

- **Layer Settings Integration** (`components/map/components/LayerSettingsDialog.tsx`)
  - 3D Settings tab with height configuration button
  - Toast and Alert notifications
  - Layer compatibility detection

### 2. State Management
- **Layer Store** (`store/layers/layerStore.ts`, `store/layers/types.ts`)
  - Height configuration in layer metadata model
  - `updateLayerHeightSource` action

- **User Preferences** (`userPreferenceStore.ts`)
  - Preferences for height configuration
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

## Implementation Status

### Completed Components

#### User Interface
- ✅ Height Configuration Dialog
- ✅ Layer Settings Integration
- ✅ Progress tracking UI
- ✅ Layer compatibility detection
- ✅ Apply to all layers functionality

#### Core Functionality
- ✅ State management integration
- ✅ Height transformation service
- ✅ Batch processing service
- ✅ Database schema and functions
- ✅ API endpoints for initialization and status

#### Error Handling
- ✅ Multi-level empty layer detection
- ✅ Special case handling for 'none' height source
- ✅ Error tracking and reporting
- ✅ Graceful dialog behavior

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
- 🔲 Building extrusion support
- 🔲 3D Tiles integration

## App Flow for Height Transformation

1. **Configuration Selection**
   - User opens Layer Settings Dialog
   - Navigates to 3D Settings tab
   - Clicks "Configure Height Source" button

2. **Source Selection**
   - User selects height source type
   - If attribute type, selects specific attribute
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

## Apply to All Layers Functionality

The "Apply to All Layers" feature implements intelligent layer compatibility detection:

- For **Z-coordinate mode**: Checks if other layers have Z-coordinates
- For **Attribute mode**: Verifies other layers have the selected attribute
- For **No-height mode**: All layers are considered compatible

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

## Extended Considerations for 3D Visualization

### Building and Complex Geometry Scenarios

#### Different Height Representation Cases
1. **XYZ Point Data** (Supported)
   - Z values stored in geometry
   
2. **Attribute-Based Point Heights** (Supported)
   - Z values stored in feature properties
   
3. **Buildings with Z-Values in Geometry** (Planned)
   - MultiPolygons with Z coordinates
   
4. **Buildings on Surface** (Planned)
   - Options for terrain clamping vs. absolute elevation
   
5. **Buildings with Height Attributes** (Planned)
   - Base height + building height
   - Absolute or relative height values
   
6. **Complex 3D Geometries** (Future)
   - Beyond simple extrusions
   - 3D Tiles with embedded glTFs

### Future 3D Tiles Implementation

#### Processing Flow
1. User uploads/selects dataset
2. Backend processes the data to 3D Tiles format
3. Tiles are served through API endpoints
4. Frontend loads the tileset using Cesium

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

### Phase 3: Advanced Visualization 🔲
- 🔲 Building extrusion support
- 🔲 3D Tiles pipeline
- 🔲 Extended height configuration options 