# Height Transformation API Reference

## Overview
This document provides a reference for all API endpoints related to height transformation in Sonmap Studio.

## Endpoints

### 1. Initialize Transformation
**Endpoint:** `/api/height-transformation/initialize`  
**Method:** POST  
**Purpose:** Initializes a new height transformation batch for a layer

**Request Body:**
```json
{
  "layerId": "uuid-of-layer",
  "heightSourceType": "z_coord|attribute|none",
  "heightSourceAttribute": "attribute_name", // Only required when type is 'attribute'
  "transformationMethod": "api|delta|auto"   // Optional, for Swiss transformation
}
```

**Response:**
```json
{
  "success": true,
  "batchId": "uuid-of-batch"
}
```

**Error Responses:**
- 400: Missing required parameters
- 404: Layer not found or contains no features
- 500: Database operation failed

**Implementation:** `app/api/height-transformation/initialize/route.ts`

### 2. Get Transformation Status
**Endpoint:** `/api/height-transformation/status`  
**Method:** GET  
**Purpose:** Retrieves the current status of a height transformation process

**Query Parameters:**
- `layerId`: UUID of the layer to check (required)

**Response:**
```json
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
```

**Error Responses:**
- 400: Missing required parameters
- 404: Layer not found
- 500: Database operation failed

**Implementation:** `app/api/height-transformation/status/route.ts`

### 3. Cancel Transformation
**Endpoint:** `/api/height-transformation/cancel`  
**Method:** POST  
**Purpose:** Cancels an in-progress height transformation batch

**Request Body:**
```json
{
  "batchId": "uuid-of-batch"
}
```

**Response:**
```json
{
  "success": true,
  "canceledBatchId": "uuid-of-batch"
}
```

**Error Responses:**
- 400: Missing required parameters
- 404: Batch not found
- 409: Batch already completed or failed
- 500: Database operation failed

**Implementation:** `app/api/height-transformation/cancel/route.ts`

### 4. Feature Count Diagnostics
**Endpoint:** `/api/height-transformation/feature-counts`  
**Method:** GET  
**Purpose:** Retrieves diagnostic information about features in a layer and their height modes

**Query Parameters:**
- `layerId`: UUID of the layer to check (required)

**Response:**
```json
{
  "layer_id": "uuid",
  "layer_name": "Layer Name",
  "total_features": 123,
  "lv95_stored_features": 45,
  "height_mode_counts": {
    "absolute_ellipsoidal": 10,
    "relative_ellipsoidal": 5,
    "lv95_stored": 45,
    "none": 63
  },
  "direct_query_results": [
    {
      "height_mode": "absolute_ellipsoidal",
      "count": 10
    },
    {
      "height_mode": "lv95_stored",
      "count": 45
    },
    // other height modes...
  ]
}
```

**Error Responses:**
- 400: Missing required parameters
- 404: Layer not found
- 500: Database operation failed

**Implementation:** `app/api/height-transformation/feature-counts/route.ts`

### 5. Swiss Coordinate Batch Transformation
**Endpoint:** `/api/coordinates/transform-batch`  
**Method:** POST  
**Purpose:** Transforms multiple Swiss coordinates in a single request

**Request Body:**
```json
{
  "coordinates": [
    {
      "id": "unique-id-1",
      "eastingLv95": 2600000,
      "northingLv95": 1200000,
      "lhn95Height": 500
    },
    // more coordinates...
  ],
  "transformationType": "lhn95towgs84"
}
```

**Response:**
```json
{
  "results": [
    {
      "id": "unique-id-1",
      "lon": 7.123456,
      "lat": 46.123456,
      "ell_height": 550.123
    },
    // more results...
  ],
  "summary": {
    "total": 10,
    "success": 9,
    "failed": 1
  }
}
```

**Error Responses:**
- 400: Invalid request format
- 413: Request entity too large (too many coordinates)
- 429: Rate limit exceeded
- 500: Transformation service error

**Implementation:** `app/api/coordinates/transform-batch/route.ts`

## Client Integration

These endpoints are primarily used by:

1. **HeightConfigurationDialog**
   - Initiates transformations when applying configuration
   - Displays status information to the user

2. **HeightTransformBatchService**
   - Manages the batch processing workflow
   - Monitors status and progress
   - Provides callback mechanisms for UI updates
   - Handles cancellation via AbortController (client-side, not via API)

## Error Handling

All endpoints implement consistent error handling:

1. **Validation Errors**: Return 400 status with description of the invalid parameter
2. **Not Found Errors**: Return 404 status with information about the missing resource
3. **Server Errors**: Return 500 status with error information (in development) or generic message (in production)

### Enhanced Error Handling

The recent improvements include:

1. **Detailed Error Information**: More specific error messages that include context about the problem
2. **Layer Feature Validation**: When initializing transformations, explicit checks for:
   - Layer existence
   - Feature count within layer
   - Presence of features with appropriate height mode (lv95_stored)
3. **Feature Count Diagnostics**: Dedicated endpoint for analyzing feature problems
4. **Client-Side Recovery**: The UI now handles common errors gracefully without disrupting user experience

### Common Error Scenarios

| Error | HTTP Status | Meaning | Recovery |
|-------|-------------|---------|----------|
| `No features found in layer` | 404 | Layer exists but has no features | Import features or check layer ID |
| `No features with LV95 stored height mode` | 404 | Features exist but none have correct height mode | Import with correct height mode |
| `Failed to initialize batch` | 500 | Database function error | Check database logs, may require SQL fix |
| `Batch not found` | 404 | Batch ID is invalid or batch was deleted | Re-initialize the batch |

## Rate Limiting

The Swiss transformation endpoints implement rate limiting:
- Maximum 100 coordinates per batch request
- Maximum 10 requests per minute per user
- Exponential backoff recommended for client implementations 