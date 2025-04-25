Height Transformation API Endpoints
The app implements two main API endpoints for height transformation:
1. /api/height-transformation/initialize (POST)
This endpoint initializes a new height transformation batch for a layer:
Purpose:
Creates a new batch process for transforming heights in a geographic layer
Sets up tracking and marks features for processing
Parameters:
layerId: UUID of the layer to transform (required)
heightSourceType: Type of height source data ('z_coord', 'attribute', or 'none')
heightSourceAttribute: Name of the attribute containing height data (required when type is 'attribute')
Process:
Validates required parameters
Checks if layer has features (returns 404 if empty)
Creates a new batch record in the height_transformation_batches table
Marks all features in the layer as 'pending' for transformation
Returns the batch ID for tracking
Response:
{
  "success": true,
  "batchId": "uuid-of-batch"
}

2. /api/height-transformation/status (GET)
This endpoint retrieves the current status of a height transformation process:
Purpose:
Provides detailed progress information about an ongoing or completed transformation
Reports errors and completion status
Parameters:
layerId: UUID of the layer to check (query parameter)
Process:
Validates the layerId parameter
Calls the Supabase RPC function get_height_transformation_status
Returns comprehensive status information
Response:
{
  "layer_id": "uuid",
  "latest_batch": {
    "id": "uuid",
    "status": "pending|in_progress|complete|failed",
    "height_source_type": "z_coord|attribute|none",
    "height_source_attribute": "attribute_name|null",
    "total_features": 123,
    "processed_features": 45,
    "failed_features": 2,
    "started_at": "timestamp",
    "completed_at": "timestamp|null"
  },
  "feature_status": {
    "total": 123,
    "pending": 78,
    "in_progress": 0,
    "complete": 43,
    "failed": 2
  }
}

Client-Side Services
Two main services interact with these endpoints:
1. HeightTransformService
A utility service that provides:
Processing of GeoJSON feature collections for height transformation
Detection of features needing transformation
Status retrieval from the API
2. HeightTransformBatchService
A more comprehensive service that manages the entire batch processing workflow:
Initializes transformation batches via the API
Processes features in chunks to avoid memory issues
Tracks progress and provides callbacks for UI updates
Handles retries, cancellation, and error reporting
Implements configurable options for processing (chunk size, polling intervals, etc.)
Database Schema
The system uses several PostgreSQL functions to manage the transformation process:
initialize_height_transformation: Creates a new batch and marks features
update_height_transformation_progress: Updates batch progress metrics
mark_height_transformation_complete: Marks features as successfully transformed
mark_height_transformation_failed: Records failed transformations with error details
reset_height_transformation: Clears transformation data for a layer
get_height_transformation_status: Retrieves comprehensive status information
The data is stored in two main tables:
height_transformation_batches: Tracks batches and their overall progress
geo_features: Enhanced with transformation status columns
Height Source Types
The system supports three types of height sources:
z_coord: Uses Z-coordinates from feature geometry (requiring transformation from LV95 to WGS84)
attribute: Uses height values stored in feature properties
none: Features are displayed flat on the terrain
These align with the Height Source Configuration system documented in the project, which provides a complete UI for configuring how heights are interpreted and visualized.