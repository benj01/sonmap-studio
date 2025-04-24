# Coordinate Transformation

This document explains the approach for handling coordinate transformations in Sonmap Studio, specifically for Swiss LV95 coordinates.

## Architecture Overview

We use a client-side transformation approach that works as follows:

1. **Database Import**: During import, LV95 coordinates are automatically stored in the feature properties with a height_mode of "lv95_stored"
2. **API Endpoint**: A Next.js API route (`/api/coordinates/transform`) handles calling the SwissTopo API
3. **Client Utilities**: JavaScript/TypeScript utilities transform coordinates when needed in the application

## Height Detection

During the import process, Z coordinates are automatically detected:

1. **Feature Detection**: The system analyzes feature geometries to check for valid Z values
2. **Validation**: Z values are considered valid if they are:
   - Not all zero
   - Within a reasonable range (-100m to 4000m)
   - Present in a sufficient percentage of coordinates
3. **Automatic Usage**: If valid Z coordinates are detected, they're automatically used for heights
4. **User Feedback**: The confirmation step displays whether Z coordinates were detected

## Components

### 1. Database Import

The database import function (`import_geo_features_with_transform`) is responsible for:
- Automatically storing the original LV95 coordinates in the feature properties for Swiss data (EPSG:2056)
- Setting the height_mode to "lv95_stored"
- Transforming the geometry to WGS84 (2D only) for display

### 2. API Endpoint

The API endpoint (`app/api/coordinates/transform/route.ts`) is responsible for:
- Receiving LV95 coordinates
- Making HTTP requests to the SwissTopo API
- Returning WGS84 coordinates with ellipsoidal height

### 3. Client Utilities

The client utilities (`core/utils/coordinates.ts`) provide:
- `transformLv95ToWgs84`: Transforms coordinates using the API endpoint
- `processStoredLv95Coordinates`: Processes features with stored LV95 coordinates

## Workflow

1. During import, LV95 coordinates are automatically stored for Swiss data
2. Z coordinates are automatically detected and used if valid
3. When features are loaded in the application, they can be processed using `processStoredLv95Coordinates`
4. The client-side code handles calling the API endpoint and updating the feature properties

## Benefits

- **Simplified import process**: No need for users to manually select height attributes
- **Automatic detection**: Z coordinates are used when available
- **Separation of concerns**: Database handles storage, API handles transformation
- **No database extension dependencies**: No need for pg_net or other extensions
- **Better error handling**: Client-side fallbacks and proper logging
- **Improved debugging**: Easier to debug JS/TS code than SQL functions
- **Reduced database load**: Transformations happen on-demand in the app 