# Height Transformation Database Schema

## Overview
The height transformation system uses a database schema to track and manage transformations. This document details the tables, columns, and PostgreSQL functions that support this functionality.

## Tables

### geo_features Extensions

The `geo_features` table includes these additional columns for height transformation:

| Column | Type | Description |
|--------|------|-------------|
| `height_transformation_status` | TEXT | Database values: 'pending', 'in_progress', 'complete', 'failed' (Note: 'cancelled' status is tracked client-side only) |
| `height_transformed_at` | TIMESTAMP WITH TIME ZONE | When transformation completed |
| `height_transformation_batch_id` | UUID | Reference to batch operation |
| `height_transformation_error` | TEXT | Error message if transformation failed |
| `original_height_values` | JSONB | Pre-transformation values for reference/rollback |
| `base_elevation_ellipsoidal` | NUMERIC | Transformed base elevation value in WGS84 |
| `object_height` | NUMERIC | Height/vertical extent of the feature |
| `height_mode` | TEXT | Height interpretation mode |
| `height_source` | TEXT | Source of height data |

### height_transformation_batches Table

This table tracks batches of height transformations:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `layer_id` | UUID | References `layers.id` (ON DELETE CASCADE) |
| `height_source_type` | TEXT | 'z_coord', 'attribute', 'none' |
| `height_source_attribute` | TEXT | Attribute name (for type='attribute') |
| `status` | TEXT | Database values: 'pending', 'in_progress', 'complete', 'failed' (Note: 'cancelled' status is tracked client-side only) |
| `total_features` | INTEGER | Total features to process |
| `processed_features` | INTEGER | Features processed so far |
| `failed_features` | INTEGER | Features that failed processing |
| `started_at` | TIMESTAMP WITH TIME ZONE | Batch start time |
| `completed_at` | TIMESTAMP WITH TIME ZONE | Batch completion time |
| `created_by` | UUID | User who initiated the batch |
| `metadata` | JSONB | Additional batch metadata |

## PostgreSQL Functions

### initialize_height_transformation
```sql
FUNCTION initialize_height_transformation(
    p_layer_id UUID, 
    p_height_source_type TEXT, 
    p_height_source_attribute TEXT
) RETURNS UUID
```

Initiates a height transformation batch for a layer, counting features, creating a batch record, marking features for processing, and returning the batch ID.

### update_height_transformation_progress
```sql
FUNCTION update_height_transformation_progress(
    p_batch_id UUID, 
    p_processed INTEGER, 
    p_failed INTEGER
) RETURNS VOID
```

Updates the progress of a transformation batch, tracking processed and failed features counts, and setting the completed_at timestamp when finished.

### mark_height_transformation_complete
```sql
FUNCTION mark_height_transformation_complete(
    p_feature_id UUID, 
    p_batch_id UUID, 
    p_original_values JSONB
) RETURNS VOID
```

Marks a feature as having completed transformation, updating its status, setting a timestamp, and recording original values.

### mark_height_transformation_failed
```sql
FUNCTION mark_height_transformation_failed(
    p_feature_id UUID, 
    p_batch_id UUID, 
    p_error TEXT
) RETURNS VOID
```

Marks a feature as having failed transformation, updating its status and recording the error message.

### reset_height_transformation
```sql
FUNCTION reset_height_transformation(
    p_layer_id UUID
) RETURNS INTEGER
```

Resets all height transformation data for a layer, clearing transformation status, timestamps, batch ID, errors, original values, as well as transformed height data (base_elevation_ellipsoidal, object_height, height_mode, height_source). Deletes batch records and returns the count of affected features.

### get_height_transformation_status
```sql
FUNCTION get_height_transformation_status(
    p_layer_id UUID
) RETURNS JSONB
```

Gets the current transformation status for a layer, returning a JSONB object with layer ID, latest batch information, and feature counts by status. Note that this function only counts 'pending', 'in_progress', 'complete', and 'failed' statuses, not 'cancelled' features (which are tracked client-side).

## API Integration

These database functions are exposed via API endpoints:

1. **Initialization**: `/api/height-transformation/initialize` (POST)
   - Called from HeightConfigurationDialog when applying configuration

2. **Status**: `/api/height-transformation/status` (GET)
   - Used by HeightTransformBatchService to monitor progress

## Client-Side Status Tracking

While the database schema tracks 'pending', 'in_progress', 'complete', and 'failed' statuses, the client-side code in HeightTransformBatchService also tracks a 'cancelled' status. This status is used when a user cancels an in-progress batch but is not reflected in the database schema.

## Performance Considerations

### Recommended Indexes
- `geo_features.height_transformation_status`
- `geo_features.height_transformation_batch_id`
- Composite index on `(layer_id, height_transformation_status)`

### High Volume Recommendations
- Consider partitioning large tables by layer_id or date ranges
- Implement regular cleanup of completed batches 