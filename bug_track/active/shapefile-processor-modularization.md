# Shapefile Processor Modularization Plan

## Current Issues
- Processor file is too long and handles multiple concerns
- Code is hard to maintain and test
- Type errors need to be addressed

## Proposed Structure

### 1. Core Module (processor.ts)
- Main ShapefileProcessor class
- Basic initialization and cleanup
- High-level process flow control
- Event handling

### 2. Conversion Module (converters/index.ts)
- GeoJSON conversion logic
- PostGIS conversion logic
- Coordinate system handling

### 3. Bounds Module (utils/bounds.ts)
- Bounds calculation for features
- Bounds calculation for records
- Bounds update utilities

### 4. Statistics Module (utils/stats.ts)
- Statistics tracking
- Feature type counting
- Batch processing stats

### 5. Transaction Module (database/transaction.ts)
- Transaction handling
- Batch processing
- Database operations

## Implementation Steps

1. Create Directory Structure
   - [ ] Create converters directory
   - [ ] Create utils directory
   - [ ] Create database directory

2. Extract Conversion Logic
   - [ ] Move GeoJSON conversion to converters/geojson.ts
   - [ ] Move PostGIS conversion to converters/postgis.ts
   - [ ] Create converters/index.ts to export both

3. Extract Bounds Logic
   - [ ] Move bounds calculation to utils/bounds.ts
   - [ ] Update references in processor.ts

4. Extract Statistics Logic
   - [ ] Move statistics handling to utils/stats.ts
   - [ ] Update references in processor.ts

5. Extract Transaction Logic
   - [ ] Move transaction handling to database/transaction.ts
   - [ ] Update references in processor.ts

6. Update Core Processor
   - [ ] Refactor processor.ts to use new modules
   - [ ] Add proper imports
   - [ ] Update type definitions

7. Add Tests
   - [ ] Add unit tests for each module
   - [ ] Add integration tests

## Benefits
- Better separation of concerns
- Easier to maintain and test
- More focused modules
- Better type safety
- Improved code organization

## Progress Log

### Completed
1. Coordinate System Handling
   - [x] Moved coordinate system detection to dedicated PRJ reader
   - [x] Implemented coordinate transformation in processor
   - [x] Added proper error handling and logging
   - [x] Integrated with coordinateSystemManager

2. Directory Structure
   - [x] Created utils directory
   - [x] Added prj-reader.ts for PRJ file handling
   - [x] Added coordinate system utilities

### In Progress
1. Conversion Logic
   - [ ] Move GeoJSON conversion to converters/geojson.ts
   - [ ] Move PostGIS conversion to converters/postgis.ts
   - [ ] Create converters/index.ts to export both

2. Remaining Tasks
   - [ ] Extract bounds logic
   - [ ] Extract statistics logic
   - [ ] Extract transaction logic
   - [ ] Add unit tests
   - [ ] Add integration tests
