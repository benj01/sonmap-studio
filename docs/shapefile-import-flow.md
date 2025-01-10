# Shapefile Import Flow Documentation

## Component Responsibilities

### FileManager.tsx
- Handles initial file upload to S3 storage
- Creates database records for main file and companions
- Groups companion files (.shp, .dbf, .shx, .prj) in database with relationships
- Manages file metadata and relationships
- Tracks import status and history
- Provides UI for file management operations

### FileItem.tsx
- Displays files and their companions in UI
- Handles file operations (download, share, delete)
- When importing:
  - Downloads all components from S3
  - Creates File objects with proper relationships
  - Attaches companion files to main .shp file using relatedFiles property
  - Opens GeoImportDialog with prepared files
  - Manages import completion and error handling

### GeoImportDialog.tsx
Uses specialized hooks for different aspects:
- useFileAnalysis - Analyzes file structure and content
- useCoordinateSystem - Handles coordinate system detection/conversion
- useImportProcess - Manages import workflow and state
- useProcessor - Provides access to file processors

Has distinct progress phases:
- PARSE (0-30%) - Reading raw file data
- ANALYZE (30-40%) - Analyzing structure & coordinates
- CONVERT (40-100%) - Converting to GeoJSON

Features:
- Manages layer visibility and selection
- Provides preview capabilities
- Handles coordinate system transformations
- Real-time progress tracking
- Comprehensive error handling

### ProcessorRegistry.ts
- Manages available file processors
- Matches files to appropriate processors by extension
- Normalizes companion file extensions
- Creates processor instances with proper options
- Validates processor compatibility
- Handles processor initialization errors

### ShapefileParser.ts
- Handles low-level shapefile parsing
- Validates file structure and components
- Requires .dbf and .shx for proper parsing
- Supports streaming for large files
- Handles different geometry types (Point, Polygon, etc.)
- Converts to GeoJSON format
- Provides detailed error reporting
- Validates spatial data integrity

## Import Flow

> **NOTE: Implementation Status**
> Phase 2 of PostGIS migration is in progress. The processor interface has been updated to support direct PostGIS import with batch processing and transaction support. The implementation now uses connection pooling and supports efficient batch operations for large datasets.

1. Initial Upload:
   - User selects files for upload
   - FileManager:
     - Uploads files to S3
     - Creates database records
     - Establishes relationships between main file and companions
     - Updates UI with upload status

2. Import Initiation:
   - User clicks import button in FileItem
   - FileItem:
     - Downloads all required files from S3
     - Constructs File objects with proper relationships
     - Validates file completeness
     - Launches GeoImportDialog

3. Import Processing:
   - GeoImportDialog:
     - PARSE Phase (0-30%):
       - Reads raw file data
       - Validates file structure
       - Checks for required components
     - ANALYZE Phase (30-40%):
       - Analyzes file structure
       - Detects coordinate system
       - Identifies available layers
       - Validates PostGIS compatibility
     - IMPORT Phase (40-100%):
       - Establishes PostGIS connection with pooling
       - Begins database transaction
       - Processes data in configurable batches
       - Performs coordinate transformations
       - Imports directly to PostGIS
       - Reports batch completion progress
       - Handles transaction commits/rollbacks

4. Import Completion:
   - Database Operations:
     - Commits final transaction
     - Creates spatial indexes
     - Updates metadata tables
   - Cleanup:
     - Closes database connections
     - Releases connection pool
     - Cleans up temporary resources
   - UI Updates:
     - Refreshes UI to show imported status
     - Updates preview with PostGIS data
     - Triggers completion callbacks

## Error Handling

- Validates file completeness before import
- Checks for required companion files
- Handles coordinate system conversion errors
- Provides detailed error messages
- Supports rollback on failure
- Maintains import logs

## Data Flow

### Current Implementation
```
User Upload → S3 Storage
                ↓
Database Record Creation
                ↓
Import Initiation → Download from S3
                ↓
File Processing (ShapefileParser)
                ↓
PostGIS Connection Pool
                ↓
Begin Transaction
                ↓
Batch Processing → PostGIS Import
                ↓
Commit Transaction
                ↓
Create Spatial Indexes
                ↓
UI Update
```

## Coordinate System Handling

- Detects source coordinate system
- Supports common coordinate systems:
  - WGS 84 (EPSG:4326)
  - Web Mercator (EPSG:3857)
- Handles transformations between systems
- Validates coordinate integrity

## Layer Management

- Supports multiple layer selection
- Controls layer visibility
- Preserves layer attributes
- Handles layer-specific styling
- Manages layer metadata

## Performance Considerations

- Connection pooling for efficient database access
- Configurable batch sizes for optimal performance
- Transaction management for data integrity
- Streaming support for large files
- Memory-efficient chunk processing
- Progress tracking per batch
- Cancellation support with rollback
- Spatial index creation for query optimization
