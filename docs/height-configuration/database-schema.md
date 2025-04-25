# Height Transformation Database Schema

## Overview
The height transformation system uses a robust database schema to track and manage transformations, especially for large datasets. This document provides detailed information about tables, columns, and PostgreSQL functions implemented to support this functionality.

## Schema Details

### geo_features Table Extensions

The `geo_features` table has been enhanced with additional columns to track height transformation:

| Column | Type | Description |
|--------|------|-------------|
| `height_transformation_status` | TEXT | Status: 'pending', 'in_progress', 'complete', 'failed' |
| `height_transformed_at` | TIMESTAMP WITH TIME ZONE | When transformation completed |
| `height_transformation_batch_id` | UUID | Reference to batch operation |
| `height_transformation_error` | TEXT | Error message if transformation failed |
| `original_height_values` | JSONB | Pre-transformation values for reference/rollback |

### height_transformation_batches Table

This table tracks batches of height transformations:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key, generated using `gen_random_uuid()` |
| `layer_id` | UUID | References `layers.id`, with ON DELETE CASCADE |
| `height_source_type` | TEXT | Type: 'z_coord', 'attribute', 'none' |
| `height_source_attribute` | TEXT | Attribute name (if type='attribute') |
| `status` | TEXT | Batch status: 'pending', 'in_progress', 'complete', 'failed' |
| `total_features` | INTEGER | Total features to process |
| `processed_features` | INTEGER | Features processed so far |
| `failed_features` | INTEGER | Features that failed processing |
| `started_at` | TIMESTAMP WITH TIME ZONE | Batch start time |
| `completed_at` | TIMESTAMP WITH TIME ZONE | Batch completion time (NULL if not complete) |
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

**Purpose**: Initiates a height transformation batch for a layer.

**Parameters**:
- `p_layer_id`: Layer ID to transform
- `p_height_source_type`: Source type ('z_coord', 'attribute', 'none')
- `p_height_source_attribute`: Attribute name for height (if applicable)

**Returns**: UUID of the created batch

**Actions**:
1. Counts features in the layer
2. Creates a batch record
3. Marks features as pending for transformation
4. Returns the batch ID

### update_height_transformation_progress
```sql
FUNCTION update_height_transformation_progress(
    p_batch_id UUID, 
    p_processed INTEGER, 
    p_failed INTEGER
) RETURNS VOID
```

**Purpose**: Updates the progress of a transformation batch.

**Parameters**:
- `p_batch_id`: Batch ID to update
- `p_processed`: Successfully processed features count
- `p_failed`: Failed features count

**Actions**:
1. Updates batch record with current progress
2. Updates status to 'complete' if all features processed
3. Sets completed_at timestamp when finished

### mark_height_transformation_complete
```sql
FUNCTION mark_height_transformation_complete(
    p_feature_id UUID, 
    p_batch_id UUID, 
    p_original_values JSONB
) RETURNS VOID
```

**Purpose**: Marks a feature as having completed transformation.

**Parameters**:
- `p_feature_id`: Feature ID to update
- `p_batch_id`: Current batch ID
- `p_original_values`: Original height values for potential rollback

**Actions**:
1. Updates feature's transformation status to 'complete'
2. Sets transformation timestamp
3. Records original values if provided

### mark_height_transformation_failed
```sql
FUNCTION mark_height_transformation_failed(
    p_feature_id UUID, 
    p_batch_id UUID, 
    p_error TEXT
) RETURNS VOID
```

**Purpose**: Marks a feature as having failed transformation.

**Parameters**:
- `p_feature_id`: Feature ID to update
- `p_batch_id`: Current batch ID
- `p_error`: Error message explaining failure

**Actions**:
1. Updates feature's transformation status to 'failed'
2. Records the error message

### reset_height_transformation
```sql
FUNCTION reset_height_transformation(
    p_layer_id UUID
) RETURNS INTEGER
```

**Purpose**: Resets all height transformation data for a layer.

**Parameters**:
- `p_layer_id`: Layer ID to reset

**Returns**: Number of affected features

**Actions**:
1. Clears transformation data from features
2. Deletes batch records
3. Returns affected features count

### get_height_transformation_status
```sql
FUNCTION get_height_transformation_status(
    p_layer_id UUID
) RETURNS JSONB
```

**Purpose**: Gets current transformation status for a layer.

**Parameters**:
- `p_layer_id`: Layer ID to check

**Returns**: JSONB object containing:
- Layer ID
- Latest batch information (id, status, metrics)
- Feature status counts (total, pending, in_progress, complete, failed)

## Usage Examples

### Initiating a Transformation
```sql
-- Initialize Z-coordinate transformation
SELECT initialize_height_transformation(
    '31dfabbf-38cb-4c9e-8691-d5186475db25', 
    'z_coord', 
    NULL
);

-- Initialize attribute-based transformation
SELECT initialize_height_transformation(
    '31dfabbf-38cb-4c9e-8691-d5186475db25', 
    'attribute', 
    'DACH_MAX'
);
```

### Updating Progress
```sql
-- Update progress for a batch
SELECT update_height_transformation_progress(
    '12345678-1234-1234-1234-123456789012', 
    100, 
    5
);
```

### Managing Feature Status
```sql
-- Mark feature as complete
SELECT mark_height_transformation_complete(
    '59bab84c-4b3f-490e-bcf6-53c702ced2a6',
    '12345678-1234-1234-1234-123456789012',
    '{"original_height": 450.5}'::jsonb
);

-- Mark feature as failed
SELECT mark_height_transformation_failed(
    '59bab84c-4b3f-490e-bcf6-53c702ced2a6',
    '12345678-1234-1234-1234-123456789012',
    'Failed to transform height: invalid coordinate'
);
```

### Checking Status
```sql
-- Check layer status
SELECT get_height_transformation_status(
    '31dfabbf-38cb-4c9e-8691-d5186475db25'
);
```

### Resetting Transformations
```sql
-- Reset a layer
SELECT reset_height_transformation(
    '31dfabbf-38cb-4c9e-8691-d5186475db25'
);
```

## API Integration

These database functions are exposed via API endpoints:

1. **Initialization**: `/api/height-transformation/initialize` (POST)
   - Accepts layer ID and height source configuration
   - Calls `initialize_height_transformation`
   - Returns batch ID for tracking

2. **Status**: `/api/height-transformation/status` (GET)
   - Accepts layer ID parameter
   - Calls `get_height_transformation_status`
   - Returns formatted status information

## Performance Optimization Recommendations

1. **Indexes**
   - Add index on `geo_features.height_transformation_status`
   - Add index on `geo_features.height_transformation_batch_id`
   - Consider composite indexes for common query patterns

2. **Partitioning**
   - For very large datasets, consider partitioning `geo_features` by:
     - `layer_id`
     - `height_transformation_status`
     - Date ranges of `height_transformed_at`

3. **Transaction Management**
   - Ensure proper transaction boundaries in client code
   - Consider batch sizes that balance performance and transaction overhead
   - Implement optimistic locking for concurrent updates

4. **Caching Strategy**
   - Consider adding a coordinate cache table for frequently transformed coordinates
   - Implement materialized views for complex status queries
   - Add function result caching for expensive operations

## Security Considerations

1. **Access Control**
   - All functions should be called through API endpoints with proper authorization
   - Implement row-level security policies for multi-tenant scenarios
   - Log all transformation operations for audit purposes

2. **Input Validation**
   - Validate all parameters before passing to functions
   - Implement constraints on status values and other enumerations
   - Add trigger-based validation for critical operations 