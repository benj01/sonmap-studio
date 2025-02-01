# Shapefile Processing Flow Analysis

## Overview
This document details the complete flow of shapefile processing from initial import to final display in the preview map, with a focus on coordinate transformations and data handling.

## 1. Initial Import Process

### File Selection and Detection
- **Entry Point**: `components/geo-loader/components/geo-import/import-dialog.tsx`
  - Handles initial file selection
  - Detects companion files (.shp, .dbf, .prj)

### PRJ File Processing
- **Location**: `components/geo-loader/core/processors/implementations/shapefile/utils/prj-reader.ts`
  ```typescript
  class PrjReader {
    async detectCoordinateSystem(content: string): Promise<CoordinateSystem>
  }
  ```
- Reads .prj file to determine coordinate system
- Maps WKT projection strings to internal coordinate system types

## 2. Shapefile Analysis

### Initial Analysis
- **Location**: `components/geo-loader/core/processors/implementations/shapefile/processor.ts`
  ```typescript
  class ShapefileProcessor {
    async analyze(file: File): Promise<AnalysisResult>
  }
  ```
- Reads shapefile header
- Extracts basic metadata (bounds, record count)
- Validates coordinate ranges
- **Error Handling**: Falls back to Swiss bounds if no valid bounds detected

### Record Processing
- **Location**: `components/geo-loader/core/processors/implementations/shapefile/core/record-parser.ts`
  ```typescript
  class RecordParser {
    async parseRecords(): Promise<ShapefileRecord[]>
  }
  ```
- Parses individual shape records
- Extracts geometry and attributes
- Initial coordinate validation

## 3. Coordinate System Handling

### System Detection and Validation
- **Location**: `components/geo-loader/core/coordinate-systems/coordinate-system-manager.ts`
  ```typescript
  class CoordinateSystemManager {
    async detect(features: Feature[]): Promise<CoordinateSystem>
    async validateSystem(system: CoordinateSystem): Promise<boolean>
  }
  ```
- Validates coordinate ranges
- Confirms projection support
- Initializes proj4 definitions

### Coordinate Transformation Chain
1. **Initial Transform (Swiss LV95 → WGS84)**
   ```typescript
   // EPSG:2056 → EPSG:4326
   const wgs84 = proj4(PROJECTIONS[COORDINATE_SYSTEMS.SWISS_LV95], 
                      PROJECTIONS[COORDINATE_SYSTEMS.WGS84], 
                      coordinates);
   ```
   - **Validation**: Checks for finite numbers in coordinates
   - **Error Handling**: Logs transformation failures with coordinate details

2. **Web Mercator Transform (WGS84 → Web Mercator)**
   ```typescript
   // EPSG:4326 → EPSG:3857
   const webMercator = proj4(PROJECTIONS[COORDINATE_SYSTEMS.WGS84],
                           PROJECTIONS[COORDINATE_SYSTEMS.WEB_MERCATOR],
                           wgs84Coordinates);
   ```
   - **Validation**: Ensures coordinates are within valid ranges
   - **Error Handling**: Handles out-of-bounds coordinates

### Known Issues and Solutions
1. **Infinite/NaN Coordinates**
   - Problem: Transformation fails with non-finite coordinates
   - Solution: Add pre-transformation validation
   ```typescript
   function validateCoordinates(coord: Position): boolean {
     return coord.every(value => Number.isFinite(value));
   }
   ```

2. **Bounds Detection Failures**
   - Problem: Invalid or missing bounds causing fallback to Swiss bounds
   - Solution: Implement progressive bounds detection
   ```typescript
   async function detectBounds(features: Feature[]): Promise<Bounds> {
     try {
       return await calculateFeatureBounds(features);
     } catch (error) {
       return detectFromCoordinates(features) || SWISS_DEFAULT_BOUNDS;
     }
   }
   ```

## 4. Preview Generation

### Feature Processing
- **Location**: `components/geo-loader/preview/preview-manager.ts`
  ```typescript
  class PreviewManager {
    async setFeatures(features: Feature[]): Promise<void>
    async getPreviewCollections(): Promise<PreviewCollections>
  }
  ```
- Transforms coordinates for display
- Manages feature caching
- Handles feature streaming for large files
- **Error Handling**: Gracefully handles transformation failures

### Bounds Transformation
- **Location**: `components/geo-loader/core/coordinate-systems/coordinate-system-manager.ts`
  ```typescript
  class CoordinateSystemManager {
    async transformBounds(bounds: Bounds, 
                         fromSystem: CoordinateSystem,
                         toSystem: CoordinateSystem): Promise<Bounds>
  }
  ```
- Creates grid of points for accurate bounds
- Handles coordinate system transformations
- Manages edge cases (antimeridian crossing)
- **Validation**: Ensures bounds are within system limits

## 5. Map Display

### Preview Map Component
- **Location**: `components/geo-loader/components/preview-map/index.tsx`
  ```typescript
  function PreviewMap({
    preview,
    bounds,
    coordinateSystem,
    visibleLayers
  }: PreviewMapProps)
  ```
- Manages map state
- Handles layer visibility
- Coordinates with Mapbox GL
- **Error Recovery**: Handles invalid geometry display

## Current Issues

### 1. Coordinate Transformation Errors
- **Symptoms**:
  - TypeError: coordinates must be finite numbers
  - Failed transformations in coordinate chain
- **Root Causes**:
  - Invalid coordinate values in input
  - Transformation chain breaking at intermediate steps
- **Solutions**:
  - Add coordinate validation before each transformation
  - Implement coordinate normalization
  - Add detailed error logging

### 2. Bounds Detection Issues
- **Symptoms**:
  - Fallback to Swiss bounds
  - Invalid bounds after transformation
- **Root Causes**:
  - Missing or invalid bounds in source files
  - Transformation errors affecting bounds calculation
- **Solutions**:
  - Implement multi-stage bounds detection
  - Add bounds validation and normalization
  - Improve fallback mechanism

### 3. Preview Update Failures
- **Symptoms**:
  - Failed preview updates after transformation
  - Incomplete feature display
- **Root Causes**:
  - Transformation errors propagating to UI
  - Invalid geometry after transformation
- **Solutions**:
  - Add error boundaries in preview components
  - Implement feature validation before display
  - Improve error recovery in preview manager

## Debug Points

### Key Logging Locations
1. Coordinate System Detection:
   ```typescript
   console.debug('[CoordinateSystemManager] Detected coordinate ranges:', ranges);
   ```

2. Transformation Chain:
   ```typescript
   console.debug('[CoordinateSystemManager] Multi-step transformation:', {
     from: coord,
     wgs84,
     to: final,
     isValid: validateCoordinates(final)
   });
   ```

3. Bounds Processing:
   ```typescript
   console.debug('[CoordinateSystemManager] Bounds transformation:', {
     original: bounds,
     transformed: transformedBounds,
     fromSystem,
     toSystem,
     validation: validateBounds(transformedBounds)
   });
   ```

## Next Steps

1. **Validation Enhancement**
   - Add coordinate range validation at each transformation step
   - Implement bounds sanity checks
   - Add type validation for geometry objects

2. **Error Recovery**
   - Implement graceful fallbacks for transformation failures
   - Add feature-level error recovery
   - Improve bounds detection reliability

3. **Testing Strategy**
   - Create test cases with known Swiss coordinates
   - Verify transformation results against reference data
   - Add automated bounds validation
   - Test error recovery mechanisms 