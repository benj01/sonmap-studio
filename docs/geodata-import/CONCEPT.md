# Geodata Import Pipeline – Design & Implementation Guide

## Overview
This document outlines the best-practice approach for handling the import of various geodata file types (e.g., Shapefiles, DXF, DWG, CSV, XYZ, QSI) into your web application using Supabase, PostGIS, and Mapbox. The goal is to:

1. Allow users to **upload files** into a project.
2. **Preview the spatial data** on a map.
3. **Select features or layers** for import.
4. **Import the selected data into PostGIS** for long-term storage and further analysis.

This guide emphasizes **scalability, performance, and separation of concerns** while keeping the **frontend (preview) and backend (import) stages aligned**.

---

## Core Principles
### 1. Two Separate Data Handling Concerns

| Purpose                    | Data Volume | Key Objective |
|-----------------------------|-------------|----------------|
| **Frontend Preview**         | Lightweight | Visualization, user selection |
| **Backend Full Import**      | Full-scale  | Accurate, lossless storage in PostGIS |

→ **The preview is NOT the source of truth**. The uploaded file is.

### 2. Progressive Processing

1. **Initial Parse** - Quick parse for metadata and basic validation
2. **Preview Generation** - Create lightweight subset for visualization
   - Random sampling (up to 500 features)
   - Geometry simplification (Douglas-Peucker algorithm)
   - Property filtering (essential attributes only)
3. **Full Processing** - Complete parse and import of selected features

---

## Implementation Pipeline

### A. File Upload & Management
- Upload geodata files to **Supabase Storage** using signed URLs
- Handle companion files (e.g., .dbf, .prj for Shapefiles) as a group
- Store **metadata** in Supabase database:
  ```typescript
  interface FileInfo {
    id: string;
    name: string;
    size: number;
    type: string;
    relatedFiles?: Record<string, { name: string; size: number }>;
    sourceSrid?: number;  // From .prj file or user input
    targetSrid?: number;  // Target coordinate system
  }
  ```

---

### B. Data Parsing & Preview Generation
1. **Initial Parse**:
   ```typescript
   interface FullDataset {
     sourceFile: string;
     fileType: string;
     features: GeoFeature[];
     metadata: {
       bounds?: [number, number, number, number];
       featureCount: number;
       geometryTypes: string[];
       properties: string[];
       sourceSrid?: number;  // From .prj file
     };
   }
   ```

2. **Preview Generation**:
   ```typescript
   interface PreviewConfig {
     maxFeatures: number;        // Default: 500
     simplifyTolerance: number;  // For Douglas-Peucker
     propertyFilter?: string[];  // Essential properties only
     coordinatePrecision: number; // Default: 4 decimals
   }

   interface PreviewFeature {
     previewId: number;
     originalFeatureIndex: number;
     geometry: GeoJSON.Geometry;  // Simplified
     properties: Record<string, any>;
   }
   ```

3. **Import Session Management**:
   ```typescript
   type ImportStatus = 
     | 'initializing'
     | 'parsing'
     | 'generating_preview'
     | 'ready'
     | 'importing'
     | 'completed'
     | 'error';

   interface ImportSession {
     fileId: string;
     status: ImportStatus;
     progress: number;
     fullDataset: FullDataset | null;
     previewDataset: PreviewDataset | null;
     selectedFeatureIndices: number[];
     error?: string;
   }
   ```

---

### C. Preview & Selection Interface
- **Map Preview** using Mapbox GL JS
- **Feature Selection** tools:
  - Layer visibility toggles
  - Feature highlighting
  - Spatial selection tools (planned)
  - Coordinate display with configurable precision
- **Import Options**:
  - Coordinate system selection (with proj4 definitions)
  - Property mapping and filtering
  - Feature filtering with spatial and attribute conditions

---

### D. Import Process
1. **Selection Preparation**:
   ```typescript
   interface ImportRequest {
     fileId: string;
     selectedFeatureIndices: number[];
     options: {
       targetSrid?: number;
       propertyMapping?: Record<string, string>;
       filterConditions?: FilterCondition[];
       sensitiveFields?: string[];  // Fields to encrypt
     };
   }
   ```

2. **Backend Processing**:
   - Download original file from storage
   - Parse selected features
   - Transform coordinates if needed (using proj4)
   - Encrypt sensitive fields
   - Import to PostGIS with progress tracking

---

## File Type Support

### 1. Shapefiles (Implemented)
- Main file (.shp) + companions (.dbf, .prj)
- Frontend parsing using `shapefile` library
- Backend processing options:
  - `shapefile` for Node.js environments
  - GDAL/ogr2ogr for heavy processing
- Coordinate system handling:
  - Parse .prj using proj4
  - Fallback to EPSG:4326 if missing
  - Support custom PRJ definitions

### 2. DXF/DWG (Planned)
- Use `dxf-parser` for frontend
- Consider GDAL/LibreDWG for backend
- Layer-based organization
- Default to project CRS if unspecified

### 3. CSV/XYZ (Planned)
- Custom parsing with coordinate detection
- Property column mapping
- Flexible delimiter support
- CRS specification in UI

### 4. LIDAR/QSI (Future)
- Server-side processing with PDAL
- Point cloud optimization
- Classification support
- Coordinate system from metadata

---

## Performance Considerations

### 1. Frontend
- Implement web workers for parsing
- Use feature sampling for large datasets:
  ```typescript
  function sampleFeatures(features: GeoFeature[], config: PreviewConfig) {
    if (features.length <= config.maxFeatures) return features;
    const step = Math.ceil(features.length / config.maxFeatures);
    return features.filter((_, i) => i % step === 0);
  }
  ```
- Cache processed data when appropriate
- Progressive loading for large datasets

### 2. Backend
- Batch processing for large imports
- Optimize PostGIS insertions:
  ```sql
  -- Example batch insert
  INSERT INTO project_layers (project_id, geom, properties)
  SELECT 
    $1,
    ST_Transform(ST_GeomFromGeoJSON($2), $3),
    CASE WHEN $4::text[] @> ARRAY[key]
      THEN pgp_sym_encrypt(value::text, $5)
      ELSE value::text
    END
  FROM jsonb_each_text($6) AS props(key, value);
  ```
- Consider parallel processing
- Progress tracking via WebSocket/Realtime:
  ```typescript
  interface ImportProgress {
    status: ImportStatus;
    progress: number;
    featuresProcessed: number;
    totalFeatures: number;
    currentOperation: string;
  }
  ```

---

## Error Handling

### 1. File Validation
- Check file types and sizes
- Validate required companions
- Verify file integrity
- Validate coordinate systems:
  ```typescript
  function validatePrj(prjContent: string): number | null {
    try {
      const epsg = proj4.decodePrj(prjContent);
      return epsg;
    } catch {
      return null;  // Invalid or unsupported CRS
    }
  }
  ```

### 2. Data Validation
- Check coordinate validity
- Validate property types
- Handle missing data
- Validate coordinate ranges:
  ```typescript
  function validateCoordinates(
    coords: number[],
    srid: number
  ): boolean {
    // Example: Basic bounds check for lat/lon
    if (srid === 4326) {
      return coords.every((coord, i) => 
        i % 2 === 0 ? coord >= -180 && coord <= 180
                    : coord >= -90 && coord <= 90
      );
    }
    return true;  // Other CRS need specific validation
  }
  ```

### 3. User Feedback
- Clear error messages
- Progress reporting
- Recovery options
- Detailed validation feedback:
  ```typescript
  interface ValidationResult {
    isValid: boolean;
    errors: {
      code: string;
      message: string;
      feature?: number;
      field?: string;
    }[];
    warnings: {
      code: string;
      message: string;
      feature?: number;
      field?: string;
    }[];
  }
  ```

---

## Security Best Practices

### 1. File Upload
- Use signed URLs with expiration
- Validate file types and sizes
- Set size limits
- Implement virus scanning:
  ```typescript
  interface UploadPolicy {
    maxSize: number;
    allowedTypes: string[];
    scanTimeout: number;
    signedUrlExpiry: number;
  }
  ```

### 2. Data Processing
- Sanitize inputs
- Validate geometries
- Handle sensitive data:
  - Encrypt PII fields in PostGIS
  - Mask precise coordinates in preview:
    ```typescript
    function maskCoordinates(
      coord: number,
      precision: number = 4
    ): number {
      return Number(coord.toFixed(precision));
    }
    ```
  - Implement data access policies:
    ```sql
    -- Example RLS policy
    CREATE POLICY "Restrict sensitive data access"
    ON project_layers
    FOR SELECT
    USING (
      auth.uid() IN (
        SELECT user_id 
        FROM project_members 
        WHERE project_id = project_layers.project_id
        AND role >= 'editor'
      )
    );
    ```

### 3. Access Control
- Project-based permissions
- User authentication
- Resource limits
- Audit logging:
  ```typescript
  interface AuditLog {
    userId: string;
    action: 'import' | 'view' | 'delete';
    resourceType: 'file' | 'feature' | 'layer';
    resourceId: string;
    timestamp: Date;
    metadata: Record<string, any>;
  }
  ```

---

## Future Enhancements

1. **Advanced Preview**
   - Geometry simplification with configurable algorithms
   - Style customization with MapboxGL styles
   - Layer organization with drag-and-drop
   - Real-time collaborative preview

2. **Import Options**
   - Coordinate transformations with custom proj4 definitions
   - Property mapping with type inference
   - Feature filtering with spatial queries
   - Batch import scheduling

3. **Processing**
   - Server-side processing with worker pools
   - Batch imports with priority queues
   - Progress tracking via WebSocket:
    ```typescript
    interface ProcessingStatus {
      jobId: string;
      status: 'queued' | 'processing' | 'completed' | 'failed';
      progress: number;
      eta?: number;
      error?: string;
    }
    ```

4. **Integration**
   - Version control with feature-level history
   - Change tracking with diff visualization
   - Export capabilities with format conversion
   - API integration for automated imports

