# Supabase Client Infrastructure Refactoring

## Current Architecture

### Client Implementations
1. **Browser Client (`utils/supabase/client.ts`)**
   - Uses `createBrowserClient` from `@supabase/ssr`
   - Browser-specific cookie handling
   - Singleton pattern implementation
   - Used in client-side components

2. **Server Client (`utils/supabase/server.ts`)**
   - Uses `createServerClient` from `@supabase/ssr`
   - Next.js `cookies()` API integration
   - New instance per request
   - Basic error handling

3. **Enhanced Server Client (`utils/supabase/server-client.ts`)**
   - Extended server client functionality
   - Notice capturing via Prefer header
   - Robust error handling
   - Consistent cookie security options

### GeoJSON Import System
1. **Client-Side Import (`import-stream.ts`)**
   - Uses browser client
   - Streaming implementation
   - Real-time progress updates
   - Client-side feature processing

2. **Server-Side Import (`route.ts`)**
   - Uses basic server client
   - REST API endpoint
   - Batch processing
   - Server-side validation

## Identified Issues

1. **Code Duplication**
   - Duplicate import logic between client and server implementations
   - Inconsistent error handling approaches
   - Redundant feature processing code

2. **Client Inconsistency**
   - Server endpoint not using enhanced server client
   - Inconsistent notice handling
   - Different cookie management strategies

3. **Environment Coupling**
   - Client-side code tightly coupled to browser environment
   - Server-side code dependent on Next.js specifics
   - No universal import approach

4. **Documentation Gaps**
   - Unclear usage guidelines
   - Missing architecture documentation
   - Undefined best practices

## Implementation Plan

### Phase 1: Service Layer Consolidation ✅

- [x] Create directory structure for geo-import system
  - [x] `services/geo-import/types`
  - [x] `services/geo-import/adapters`
  - [x] `services/geo-import/utils`

- [x] Create core service files
  - [x] Type definitions in `types/index.ts`
  - [x] Core `ImportService` class
  - [x] Supabase import adapter
  - [x] Storage adapter for checkpoints
  - [x] Metrics adapter for tracking

- [x] Create utility files
  - [x] Error handler
  - [x] Notice handler
  - [x] Cookie manager

- [x] Update existing code to use new service layer
  - [x] Create legacy stream adapter
  - [x] Update import-stream.ts to use new service layer

### Phase 2: Client Standardization 🔄

- [x] Update server routes
  - [x] Standardize error handling with `ImportErrorHandler`
  - [x] Implement consistent notice capturing with `NoticeHandler`
  - [x] Unify cookie management with `CookieManager`
  - [x] Add retry mechanisms for transient failures
  - [x] Enhance logging with component-specific loggers

- [x] Logger standardization ✅
  - [x] Implement enhanced Logger with forComponent method
  - [x] Update stream route to use component logger
  - [x] Audit codebase for custom logger implementations
  - [x] Add logging documentation and best practices
  - [x] Migrate remaining files to use enhanced logger:
    - [x] **Direct Console Logging**
      - [x] utils/supabase/s3.ts (already using enhanced logger)
      - [x] components/geo-import/components/test-import.tsx
      - [x] components/files/utils/file-types.ts
      - [x] components/files/utils/logger.ts (removed custom implementation)
      - [x] components/providers/coordinate-systems-provider.tsx
      - [x] lib/stores/data.ts
      - [x] lib/coordinate-systems.ts
    - [x] **Direct LogManager Usage**
      - [x] utils/supabase/server.ts (already using enhanced logger)
      - [x] utils/supabase/server-client.ts (already using enhanced logger)
      - [x] core/processors/shapefile-parser.ts
      - [x] core/processors/preview-generator.ts
      - [x] core/processors/geojson-parser.ts
      - [x] components/providers/auth-provider.tsx
      - [x] components/geo-import/hooks/use-geo-import.ts
  - [x] Remove deprecated logging approaches

### Phase 3: Import System Refactoring 🔄

- [x] Streaming Implementation Enhancement ✅
  - [x] Implement configurable batch processing
  - [x] Add progress tracking and reporting
  - [x] Implement pause/resume functionality
  - [x] Add error recovery for failed batches

- [x] Feature Processing Pipeline ✅
  - [x] Create modular transformation pipeline
  - [x] Implement coordinate system transformations
  - [x] Add geometry validation and repair
  - [x] Implement property mapping and validation

- [x] Memory Management (Partial) 🔄
  - [x] Add memory usage monitoring
  - [ ] Implement streaming parser for large files
  - [x] Implement cleanup strategies
  - [x] Add backpressure handling

- [ ] Performance Optimization
  - [ ] Implement caching strategy
  - [ ] Add layer to storage adapter
  - [ ] Cache frequently accessed data
  - [ ] Implement cache invalidation
  - [ ] Optimize batch processing
  - [ ] Fine-tune batch sizes
  - [ ] Add parallel processing where possible
  - [ ] Implement backpressure handling
  - [ ] Handle large datasets efficiently

### Latest Updates
- Completed Feature Processing Pipeline implementation with:
  - Coordinate transformation with proj4 support
  - Geometry validation and automatic repair
  - Property validation and mapping
  - Modular pipeline architecture
- Implemented core Memory Management features
- Next focus: Streaming parser for large files and Performance Optimization

### Next Steps
1. Complete remaining Memory Management task:
   - Implement streaming parser for large files
2. Begin Performance Optimization:
   - Design and implement caching strategy
   - Optimize batch processing
   - Add parallel processing support

## Timeline

1. **Phase 1: Environment-Agnostic Service Layer**
   - Week 1-2: Design and implementation
   - Week 3: Testing and refinement

2. **Phase 2: Client Standardization**
   - Week 4: Implementation
   - Week 5: Testing and validation

3. **Phase 3: Import System Refactoring**
   - Week 6-7: Implementation
   - Week 8: Performance optimization

4. **Phase 4: PostgreSQL Function Enhancement**
   - Week 9: PostgreSQL function enhancements
   - Week 10: Concurrency control implementation
   - Week 11: Error recovery system
   - Week 12: Performance monitoring and tuning

5. **Additional Phases**
   - Week 13: PostgreSQL function enhancements
   - Week 14: Concurrency control implementation
   - Week 15: Error recovery system
   - Week 16: Performance monitoring and tuning

6. **Final Testing and Deployment**
   - Week 17: Final testing and deployment 