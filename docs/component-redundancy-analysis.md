# Component Redundancy Analysis

Last updated: 2025-01-05

## Overview
Analysis of potential redundancies between the geo-import and preview-map components, with recommendations for consolidation and improvement.

## Identified Redundancies

### 1. State Management

#### Current Situation
- `geo-import/hooks/use-processor.ts` (3.2 KB)
- `preview-map/hooks/use-preview-state.ts` (4.3 KB)

Both hooks manage feature state and processing, with overlapping functionality:
- Feature filtering
- State updates
- Cache management
- Coordinate system handling

**Recommendation:**
Create a shared hook `useGeoFeatureState` that handles:
- Feature state management
- Caching logic
- Basic filtering
Then extend it for specific needs in each component.

### 2. Controls Components

#### Current Situation
- `geo-import/components/import-controls.tsx` (1.2 KB)
- `preview-map/components/map-controls.tsx` (3.5 KB)

Overlapping functionality:
- Progress indicators
- Error displays
- Status messages
- Action buttons

**Recommendation:**
Create a shared UI component library:
```
shared/
├── controls/
│   ├── progress-bar.tsx
│   ├── error-display.tsx
│   ├── status-message.tsx
│   └── action-button.tsx
```

### 3. Coordinate System Handling

#### Current Situation
- `geo-import/hooks/use-coordinate-system.ts` (7.3 KB)
- Preview map has embedded coordinate system logic

**Recommendation:**
Extract coordinate system logic into a shared service:
```
services/
├── coordinate-system/
│   ├── transform.ts
│   ├── validation.ts
│   └── detection.ts
```

### 4. Feature Processing

#### Current Situation
- Both components implement feature processing logic
- Duplicate transformation code
- Separate caching mechanisms

**Recommendation:**
Create a shared feature processing service:
```
services/
├── feature-processing/
│   ├── transform.ts
│   ├── cache.ts
│   └── validation.ts
```

## Suggested Directory Structure

```
components/
├── shared/
│   ├── controls/        # Shared UI components
│   ├── hooks/          # Shared hooks
│   └── types/          # Shared type definitions
├── services/           # Shared services
├── geo-import/         # Import-specific components
└── preview-map/        # Preview-specific components
```

## Specific Improvements

### 1. State Management
```typescript
// shared/hooks/useGeoFeatureState.ts
export function useGeoFeatureState<T extends Feature>() {
  // Common state management logic
  return {
    features,
    filteredFeatures,
    cache,
    updateFeatures,
    filterFeatures,
    // ...
  };
}

// Component-specific extensions
export function useImportState() {
  const baseState = useGeoFeatureState();
  // Add import-specific logic
  return { ...baseState, importSpecific };
}

export function usePreviewState() {
  const baseState = useGeoFeatureState();
  // Add preview-specific logic
  return { ...baseState, previewSpecific };
}
```

### 2. UI Components
```typescript
// shared/controls/progress-bar.tsx
export function ProgressBar({ 
  progress, 
  status,
  onCancel 
}: ProgressBarProps) {
  // Shared progress bar implementation
}

// Use in both components
<ProgressBar 
  progress={progress}
  status={status}
  onCancel={handleCancel}
/>
```

### 3. Coordinate System Service
```typescript
// services/coordinate-system/index.ts
export class CoordinateSystemService {
  transform(features: Feature[], from: string, to: string): Feature[];
  validate(system: string): boolean;
  detect(features: Feature[]): string;
}
```

### 4. Feature Processing Service
```typescript
// services/feature-processing/index.ts
export class FeatureProcessor {
  cache: FeatureCache;
  
  process(features: Feature[]): ProcessedFeatures;
  transform(features: Feature[]): TransformedFeatures;
  validate(features: Feature[]): ValidationResult;
}
```

## Benefits of Consolidation

1. **Reduced Code Duplication**
   - Shared logic in one place
   - Easier maintenance
   - Consistent behavior

2. **Better Performance**
   - Shared caching
   - Optimized processing
   - Reduced memory usage

3. **Improved Maintainability**
   - Clear separation of concerns
   - Easier testing
   - Better documentation

4. **Enhanced Features**
   - Consistent UI
   - Shared functionality
   - Better error handling

## Implementation Priority

1. High Priority
   - Create shared UI component library
   - Implement shared coordinate system service
   - Extract common hooks

2. Medium Priority
   - Implement feature processing service
   - Consolidate state management
   - Create shared types

3. Low Priority
   - Optimize caching
   - Add advanced features
   - Enhance documentation

## Migration Strategy

1. **Phase 1: Preparation**
   - Create shared directory structure
   - Set up shared services
   - Create shared types

2. **Phase 2: Component Migration**
   - Move shared logic to services
   - Update components to use shared code
   - Add tests for shared code

3. **Phase 3: Cleanup**
   - Remove redundant code
   - Update documentation
   - Optimize performance

## Notes
- Consider implementing a plugin system for extensibility
- Add proper TypeScript types for all shared code
- Consider adding unit tests for shared components
- Document all shared APIs thoroughly
