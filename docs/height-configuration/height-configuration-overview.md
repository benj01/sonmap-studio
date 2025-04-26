# Height Configuration System Overview

## Purpose
The Height Configuration system enables Sonmap Studio to visualize 2D vector data in 3D by handling various height data sources and applying appropriate transformations. It provides a flexible way to configure how height data is interpreted and visualized in the 3D view.

## Key Components

### Height Source Types
- **Z-Coordinate Based Heights**: Uses existing Z values in coordinates (XYZ)
- **Attribute-Based Heights**: Uses height values stored in feature properties
- **No Height Data**: Features displayed flat on the terrain

### Height Interpretation Modes
- **Absolute Elevation**: Height values represent absolute elevation above sea level
- **Relative to Ground**: Height values represent height above terrain
- **Building Height (Extrusion)**: Height values represent the vertical extent of buildings

### Advanced Configuration Options
- **Base Elevation**: Configure where features start in 3D space
- **Height/Top Elevation**: Configure the vertical extent or top elevation
- **Visualization Options**: Controls how heights are rendered (extrusion, point elevation, etc.)

### Swiss Height Transformation
- Automatic detection of Swiss coordinates (LV95)
- Transformation from LHN95 to WGS84 ellipsoidal heights
- Multiple transformation methods (API, delta-based)
- Validation of coordinate ranges for proper Swiss LV95 format

### Diagnostic and Troubleshooting
- Advanced error detection and handling
- Feature analysis tools for diagnosing issues
- SQL helper functions for database diagnostics
- Comprehensive troubleshooting documentation

## System Architecture

### User Interface
- Height Configuration Dialog for configuring height settings
- Layer Settings integration through 3D Settings tab
- Progress tracking UI for transformation operations
- Graceful error handling with helpful messages

### Processing Components
- Height Transformation Service for coordinate processing
- Batch Processing Service for large datasets
- Status monitoring and error handling
- Pre-validation checks to prevent common errors

### Database Schema
- Extended geo_features table for tracking transformation status
- Height transformation batches table for batch operations
- PostgreSQL functions for initialization, progress updates, and status reporting
- Diagnostic helper functions for analyzing feature data

### API Endpoints
- Initialization endpoint for starting transformations
- Status endpoint for monitoring progress
- Batch transformation for efficient processing
- Feature count diagnostics for troubleshooting

## Implementation Files
- User Interface: `components/map/dialogs/HeightConfigurationDialog.tsx`
- Processing: `components/map/services/heightTransformService.ts`
- Batch Service: `components/map/services/HeightTransformBatchService.ts`
- Layer Store: `store/layers/layerStore.ts`
- API Endpoints: `app/api/height-transformation/`
- SQL Functions: `supabase/migrations/20250525000000_add_height_transformation_helper_functions.sql`

## Documentation

- [Implementation Status](./implementation-status.md) - Current status of all components
- [API Reference](./api-reference.md) - Reference for all API endpoints
- [Swiss Transformation](./swiss-transformation.md) - Details on Swiss coordinate transformations
- [Technical Reference](./technical-reference.md) - Technical architecture and implementation details
- [3D Geometry Support](./3d-geometry-support.md) - Geometry types and visualization options
- [Database Schema](./database-schema.md) - Database schema and functions
- [Troubleshooting Guide](./troubleshooting.md) - Solutions for common issues

## Recent Improvements

The system was recently enhanced with:
- Improved error handling and recovery
- New diagnostic endpoints for feature analysis
- Enhanced validation for Swiss coordinates
- Better client-side pre-checks to prevent errors
- Comprehensive troubleshooting documentation 