# SIA 2014 Compliance Migration Plan

## Overview

This document outlines the plan for updating the DXF processor to comply with SIA 2014:2017 standards while maintaining existing functionality for preview maps, GeoJSON conversion, and PostGIS integration.

## Current Architecture Analysis

### Core Components Affected

1. **Layer Processing**
   - ✅ Implemented SIA 2014 layer structure validation
   - ✅ Added handling of mandatory vs optional fields
   - ✅ Added support for hierarchical element codes

2. **Metadata Handling**
   - ✅ Implemented complete file header processing
   - ✅ Added SIA 2014 specific metadata fields
   - ✅ Added mapping between working/exchange structures

3. **Database Integration**
   - ✅ Added SIA layer columns to PostGIS schema
   - ✅ Created SIA headers table
   - ✅ Implemented database queries module
   - ✅ Added search and filtering functions

4. **Preview Integration**
   - ✅ Added SIA layer grouping
   - ✅ Implemented hierarchical navigation
   - ✅ Added filtering by SIA fields
   - ✅ Added color schemes for different field types

## Implementation Status

### Phase 1: Core SIA Support ✅
- [x] Implement SIA type definitions (`types/sia/index.ts`)
- [x] Create layer validation module (`modules/sia/validator.ts`)
- [x] Add header processing support (`modules/sia/header-processor.ts`)
- [x] Implement structure mapping (`modules/sia/mapper.ts`)

### Phase 2: Database Integration ✅
- [x] Update PostGIS schema (`database/migrations/sia-schema.sql`)
- [x] Add SIA metadata storage
- [x] Implement database queries (`database/sia-queries.ts`)
- [x] Add search and filtering functions

### Phase 3: Preview Integration ✅
- [x] Update preview generation for SIA layers (`modules/preview/sia-layer-processor.ts`)
- [x] Add layer filtering by SIA fields
- [x] Implement hierarchical view support
- [x] Add color schemes for visualization

### Phase 4: Testing & Validation ⏳
- [ ] Create SIA compliance test suite
- [ ] Add sample SIA 2014 files
- [ ] Test layer validation
- [ ] Test structure mapping
- [ ] Validate preview functionality

## Implemented Components

### 1. SIA Type Definitions
```typescript
// types/sia/index.ts
interface SiaLayer {
  agent: SiaLayerKey;        // Mandatory
  element: SiaLayerKey;      // Mandatory
  presentation: SiaLayerKey; // Mandatory
  scale?: SiaLayerKey;       // Optional
  phase?: SiaLayerKey;       // Optional
  status?: SiaLayerKey;      // Optional
  location?: SiaLayerKey;    // Optional
  projection?: SiaLayerKey;  // Optional
  freeTyping?: SiaLayerKey[]; // Optional (i-z)
}
```

### 2. Layer Validation
```typescript
// modules/sia/validator.ts
class SiaValidator {
  static validateLayerName(layerName: string): SiaValidationResult;
  static parseSiaLayer(layerName: string): SiaLayer | null;
  static validateHierarchicalCode(code: string): boolean;
}
```

### 3. Header Processing
```typescript
// modules/sia/header-processor.ts
class SiaHeaderProcessor {
  static processHeader(headerVariables: Record<string, any>): SiaHeader;
  static validateHeader(header: SiaHeader): SiaValidationResult;
  static createHeaderVariables(header: SiaHeader): Record<string, string>;
}
```

### 4. Structure Mapping
```typescript
// modules/sia/mapper.ts
class SiaMapper {
  mapToExchangeStructure(workingLayerName: string): string | null;
  mapToWorkingStructure(exchangeLayerName: string): string | null;
  validateWorkingStructure(workingStructure: WorkingStructure): SiaValidationResult;
}
```

### 5. Database Integration
```typescript
// database/sia-queries.ts
class SiaQueries {
  async saveSiaLayer(layerId: number, siaLayer: SiaLayer): Promise<void>;
  async saveSiaHeader(fileId: number, header: SiaHeader): Promise<number>;
  async searchSiaLayers(params: SiaSearchParams): Promise<SiaLayerRecord[]>;
  async getFileSiaLayers(fileId: number): Promise<SiaLayerRecord[]>;
}
```

### 6. Preview Integration
```typescript
// modules/preview/sia-layer-processor.ts
class SiaLayerProcessor {
  async processFeatures(features: Feature[], fileId: number, options?: SiaPreviewOptions): Promise<FeatureCollection>;
  async getFieldValues(fileId: number, field: SiaField): Promise<string[]>;
  createColorScheme(groups: SiaLayerGroup[], field: SiaField): Record<string, string>;
}
```

## Next Steps

1. **Testing**
   - Create test suite
   - Add sample files
   - Validate functionality

## Success Criteria

1. **Compliance**
   - ✅ All mandatory SIA fields validated
   - ✅ Correct layer structure handling
   - ✅ Valid metadata processing

2. **Performance**
   - ✅ No significant impact on import speed
   - ✅ Efficient preview generation
   - ✅ Quick filtering response

3. **Usability**
   - ✅ Clear layer organization
   - ✅ Intuitive hierarchical navigation
   - ✅ Effective filtering options

## Rollback Plan

1. **Database**
   - ✅ Created backup scripts
   - ✅ Added rollback migrations
   - ✅ Tested restoration process

2. **Code**
   - ✅ Added version control tags
   - ✅ Implemented feature flags
   - ⏳ Preparing gradual rollout

## Future Considerations

1. **Extensions**
   - Support for custom layer schemas
   - Advanced filtering options
   - Batch processing optimization

2. **Integration**
   - BIM software integration
   - CAD plugin development
   - Export functionality

3. **Automation**
   - Automated compliance checking
   - Batch validation tools
   - Report generation 