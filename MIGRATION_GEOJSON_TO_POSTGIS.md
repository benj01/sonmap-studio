# Migration Plan: GeoJSON to PostGIS

This document outlines the migration strategy from GeoJSON-based processing to PostGIS in our web application's geo-processing pipeline.

## Current Architecture

### Core Components

1. **File Import Flow**
   - `GeoImportDialog` (dialog.tsx) - Main import dialog
   - `ImportContent` - Handles file analysis and preview
   - `FormatSettings` - Format-specific settings
   - `CoordinateSystemSelect` - Coordinate system handling

2. **Processing Pipeline**
   - Processors for different formats (DXF, Shapefile)
   - All processors convert to GeoJSON
   - Preview system based on GeoJSON
   - Layer management for visualization

3. **Data Flow**
   ```
   Upload → Format-specific Processor → GeoJSON → Preview/Processing
   ```

### Current Directory Structure 
```
components/geo-loader/
├── core/
│   ├── processors/
│   │   ├── base/
│   │   │   ├── types.ts
│   │   │   └── interfaces.ts
│   │   └── implementations/
│   │       ├── dxf/
│   │       └── shp/
│   ├── converters/
│   └── hooks/
├── preview/
│   └── preview-manager.ts
├── components/
├── types/
├── docs/
└── __tests__/
```

## Migration Plan

### 1. New Directory Structure
```
components/geo-loader/
├── core/
│   ├── processors/ # Format-specific processors
│   ├── database/ # New PostGIS interaction layer
│   │   ├── client.ts # Database client ✅
│   │   ├── migrations/ # Schema migrations ✅
│   │   └── queries/ # SQL queries
│   ├── cache/ # Caching layer
│   └── transformers/ # Coordinate transformers
├── components/
│   ├── geo-import/ # Import UI
│   ├── preview-map/ # Map visualization
│   └── shared/ # Shared components
└── types/ # TypeScript definitions
```

### 2. Required Changes

#### A. New Files Created ✅

1. **Database Layer**
   ```typescript
   // database/client.ts ✅
   export class PostGISClient {
     connect()
     disconnect()
     query()
   }
   ```

2. **Database Schema** ✅
   ```sql
   -- migrations/001_initial_schema.sql
   CREATE TABLE feature_collections
   CREATE TABLE layers
   CREATE TABLE geo_features
   ```

3. **Environment Configuration** ✅
   ```typescript
   // env.mjs
   export const env = createEnv({
     server: {
       POSTGIS_HOST: z.string(),
       // ... other PostGIS config
     }
   })
   ```

#### B. Files to Modify (Next Steps)

1. **Processors Interface**
   ```typescript
   // core/processors/base/interfaces.ts
   interface IProcessor {
     - convertToGeoJSON()
     + importToDatabase()
     + validateData()
   }
   ```

2. **Preview Manager**
   ```typescript
   // preview/preview-manager.ts
   class PreviewManager {
     - loadGeoJSON()
     + loadFromDatabase()
     + queryFeatures()
   }
   ```

### 3. Implementation Timeline

#### Phase 1: Foundation ✅
- [x] Set up PostGIS database configuration
- [x] Implement database client
- [x] Create initial schema
- [x] Set up environment variables
- [ ] Set up connection pooling (in progress)

#### Phase 2: Processing (Next)
- [ ] Update format-specific processors
- [ ] Implement coordinate system handling
- [ ] Add data validation
- [ ] Create data access layer

#### Phase 3: UI Updates
- [ ] Modify preview system
- [ ] Update layer management
- [ ] Add progress indicators
- [ ] Implement feature selection

#### Phase 4: Testing & Optimization
- [ ] Write unit tests
- [ ] Perform integration testing
- [ ] Optimize performance
- [ ] Update documentation

### Dependencies Added ✅

- pg (v8.11.3)
- @types/pg (v8.10.9)
- @t3-oss/env-nextjs (v0.7.1)

### Environment Variables Required

```env
POSTGIS_HOST=localhost
POSTGIS_PORT=5432
POSTGIS_DATABASE=geo_db
POSTGIS_USER=geo_user
POSTGIS_PASSWORD=
POSTGIS_MAX_CONNECTIONS=10
```

## Notes

- Ensure backward compatibility during migration
- Consider implementing feature flags for gradual rollout
- Document API changes for other team members
- Plan for data migration of existing projects

## Status

- [ ] Draft
- [ ] In Review
- [x] Approved
- [x] In Progress (Phase 1 Complete)
- [ ] Completed