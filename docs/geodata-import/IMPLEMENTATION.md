# Geodata Import Implementation Status

## Current Implementation Overview

The geodata import pipeline has been implemented with a focus on Shapefiles as the initial supported format. The implementation follows the conceptual design outlined in `CONCEPT.md` and provides a robust foundation for handling spatial data imports.

### Core Components

1. **File Management**
   - `FileManager` component for handling file uploads and management
   - Support for main files and companion files (e.g., .shp with .dbf)
   - File validation and type checking
   - Integration with Supabase Storage

2. **Import Dialog**
   - `GeoImportDialog` component for the import workflow
   - File information display
   - Map preview integration (in progress)
   - Import session management

3. **Shapefile Parser**
   - Complete implementation using `shapefile` library
   - Support for both .shp and .dbf files
   - Feature extraction and bounds calculation
   - Metadata collection (properties, geometry types)

## Technical Details

### File Upload Flow

```typescript
// File selection and validation
FileManager
  → FileList
    → FileItem
      → FileActions (Import, Preview, Download, Delete)
```

### Import Process

1. **File Selection**
   ```typescript
   interface FileInfo {
     id: string;
     name: string;
     size: number;
     type: string;
   }
   ```

2. **Import Session Creation**
   ```typescript
   interface ImportSession {
     fileId: string;
     status: ImportStatus;
     fullDataset: FullDataset | null;
     previewDataset: PreviewDataset | null;
     selectedFeatureIndices: number[];
   }
   ```

3. **Data Parsing**
   ```typescript
   interface FullDataset {
     sourceFile: string;
     fileType: string;
     features: GeoFeature[];
     metadata?: {
       bounds?: [number, number, number, number];
       featureCount: number;
       geometryTypes: string[];
       properties: string[];
     };
   }
   ```

### Shapefile Processing

The `ShapefileParser` class provides three main operations:

1. **Parse**
   - Reads features from .shp and .dbf files
   - Calculates bounds dynamically
   - Tracks geometry types and properties
   - Supports progress reporting
   - Performance threshold: Files > 50MB trigger server-side parsing

2. **Validate**
   - Checks for required companion files
   - Validates file format
   - Ensures non-empty content
   - Verifies coordinate ranges

3. **Get Metadata**
   - Extracts feature count
   - Calculates bounds
   - Identifies geometry types
   - Lists available properties

## UI Components

### Import Dialog
The import dialog provides a structured workflow:

1. **File Information Display**
   ```typescript
   interface FileInfo {
     name: string;
     size: number;
     type: string;
   }
   ```

2. **Preview Section** (In Progress, Target: Q2 2024)
   - Map preview using Mapbox GL JS with GeoJSON source
   - Initial limit of 500 features with dynamic sampling:
     ```typescript
     function sampleFeatures(features: GeoFeature[]): GeoFeature[] {
       if (features.length <= 500) return features;
       const step = Math.ceil(features.length / 500);
       return features.filter((_, i) => i % step === 0);
     }
     ```
   - Progressive loading for large datasets
   - Coordinate precision control:
     ```typescript
     function formatCoordinate(
       value: number,
       precision: number = 4,
       isOwner: boolean
     ): number {
       return isOwner ? value : Number(value.toFixed(precision));
     }
     ```

### File Actions
Integrated into the file list with:
- Import button (primary action)
- Preview capability
- Download option
- Delete functionality
- Progress indicators for each action

## Data Types

### Feature Representation
```typescript
interface GeoFeature {
  id: number;
  geometry: GeoJSON.Geometry;
  properties: Record<string, any>;
  originalIndex?: number;
}
```

### Preview Feature
```typescript
interface PreviewFeature extends Omit<GeoFeature, 'geometry'> {
  geometry: GeoJSON.Geometry;  // Simplified geometry
  previewId: number;
  originalFeatureIndex: number;
}
```

## Next Steps

1. **Preview Implementation** (Q2 2024)
   - Add map preview component with Mapbox GL JS
   - Implement geometry simplification using Turf.js
   - Add feature selection interface with:
     - Multi-select capability
     - Spatial lasso tool
     - Property-based filtering

2. **Backend Integration** (Q2-Q3 2024)
   - Complete PostGIS import process
   - Add coordinate system handling with proj4
   - Implement feature filtering
   - Add server-side processing for large files:
     ```typescript
     interface ProcessingJob {
       fileId: string;
       size: number;
       processingType: 'client' | 'server';
       queuePosition?: number;
       estimatedDuration?: number;
     }
     ```

3. **Additional File Types** (Q3-Q4 2024)
   - Add support for DXF files
   - Implement CSV/XYZ parsing
   - Consider LIDAR data handling

4. **UI Enhancements** (Ongoing)
   - Add specific progress indicators:
     - File upload progress percentage
     - Feature parsing progress
     - Import status with detailed steps
   - Improve error handling with specific messages:
     ```typescript
     interface ImportError {
       code: string;        // e.g., 'MISSING_DBF'
       message: string;     // e.g., 'Missing required .dbf file'
       details?: string;    // Additional context
       recoverySteps?: string[]; // User actions to resolve
     }
     ```
   - Enhance feature selection UX

## Known Limitations

1. **File Size**
   - Browser processing limit: 50MB
   - Files > 50MB automatically queued for server processing
   - Implementation plan:
     ```typescript
     async function processLargeFile(file: File) {
       if (file.size > 50 * 1024 * 1024) {
         return await queueServerProcessing(file);
       }
       return await processInBrowser(file);
     }
     ```

2. **Preview**
   - Preview generation limited to 500 features
   - Geometry simplification pending
   - Progressive loading for large datasets planned

3. **Coordinate Systems**
   - .prj file parsing planned (Q2 2024 priority)
   - Proj4 integration in progress
   - Default fallback to EPSG:4326

4. **Companion Files**
   - Currently supports .dbf for attributes
   - .prj parsing planned for coordinate system support (priority)
   - .shx support optional (performance optimization)

## Best Practices

1. **File Handling**
   - Validate file types and sizes before upload
   - Handle companion files as a group
   - Provide specific error messages for each validation step

2. **Performance**
   - Use server-side processing for files > 50MB
   - Implement feature sampling for large datasets
   - Cache processed data when appropriate
   - Monitor memory usage during parsing

3. **User Experience**
   - Show detailed progress for long operations
   - Provide specific error messages with recovery steps
   - Maintain responsive UI during processing
   - Implement proper loading states

## Security Considerations

1. **File Upload**
   - Validate file types and sizes
   - Use signed URLs with expiration
   - Implement virus scanning
   - Set appropriate CORS policies

2. **Data Processing**
   - Sanitize property names and values
   - Validate geometry data
   - Handle sensitive data:
     - Truncate preview coordinates to 4 decimal places for non-owners
     - Mask sensitive property values in preview
     - Implement proper access control in PostGIS
   - Audit logging for import operations 