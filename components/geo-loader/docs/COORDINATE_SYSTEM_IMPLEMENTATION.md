# Coordinate System Implementation Details

## Overview
This document details the implementation of the coordinate system management in the geo-loader system, focusing on initialization flow, error handling, and performance optimizations.

## Architecture
The coordinate system management is built around a singleton `coordinateSystemManager` that provides centralized control over:
- Coordinate system registration and verification
- Coordinate transformations
- Error handling
- Cache management

## Initialization Flow

### 1. Two-Phase Initialization
- **Phase 1 (Synchronous)**: Immediate registration during module load
  * Register coordinate systems with proj4
  * Set up initial state and configurations
  * Fast, non-blocking operation
  * Enables webpack module loading
- **Phase 2 (Asynchronous)**: Verification after load
  * Validate transformations with test points
  * Ensure accuracy within tolerance
  * Comprehensive error reporting
  * Non-blocking verification

### 2. Proxy Protection
- Type-safe proxy wraps coordinateSystemManager
- Ensures verification completes before any operation
- Preserves method types and contexts
- Handles async/sync method calls appropriately
- Prevents premature usage of transformation methods

### 3. Registration Process
- All coordinate systems registered with proj4 first
- Systems stored in manager's internal Map with metadata:
  - Bounds
  - Units
  - Description
  - Proj4 definition
- Cached transformers cleared to ensure clean state
- Initialization state tracked for safety

### 3. Verification Process
- Each system verified against WGS84 using known test points:
  ```typescript
  // Swiss LV95 test point
  [2645021, 1249991] → [8.0, 47.4]
  
  // Swiss LV03 test point
  [645021, 249991] → [8.0, 47.4]
  ```
- Tolerance of 0.5 degrees for verification
- Detailed error reporting for verification failures

## Error Handling

### Error Types
1. **CoordinateSystemError**
   - General system configuration issues
   - Registration failures
   - Initialization problems

2. **CoordinateTransformationError**
   - Transformation failures
   - Includes source/target points
   - Detailed context for debugging

3. **InvalidCoordinateError**
   - Input validation failures
   - Point validation errors
   - Bounds validation issues

### Error Context
All errors include:
- Descriptive message
- Error code
- Relevant context (points, systems involved)
- Stack trace for debugging

## Performance Optimizations

### 1. Caching System
- Transformation results cached with LRU-style eviction
- Cache size limit: 10000 entries
- Half-cache cleared when limit reached
- Cache key: `${fromSystem}:${toSystem}:${x}:${y}`

### 2. Transformer Reuse
- Transformers created once per system pair
- Stored in Map for reuse
- Cleared only when systems change

### 3. Bounds Validation
- Optional bounds checking per system
- Prevents unnecessary transformations
- Validates results within expected ranges

### 4. Memory Management
- Efficient cache eviction strategy
- No duplicate proj4 definitions
- Minimal memory footprint

## Integration Points

### 1. Component Integration
- useCoordinateSystem hook provides React integration
- Async initialization handling
- Error boundary support
- Progress tracking

### 2. Processor Integration
- Coordinate transformations in file processors
- Streaming transformation support
- Error propagation to UI

### 3. Preview Integration
- Real-time coordinate transformation
- Viewport-based transformation caching
- Memory-efficient preview generation

## Usage Examples

### Basic Transformation
```typescript
const point = await coordinateSystemManager.transform(
  { x: 2645021, y: 1249991 },
  COORDINATE_SYSTEMS.SWISS_LV95,
  COORDINATE_SYSTEMS.WGS84
);
```

### System Registration
```typescript
coordinateSystemManager.registerSystem({
  code: 'CUSTOM_SYSTEM',
  proj4def: '+proj=...',
  bounds: {
    minX: 0,
    minY: 0,
    maxX: 1000,
    maxY: 1000
  },
  units: 'meters'
});
```

### Error Handling
```typescript
try {
  await coordinateSystemManager.transform(...);
} catch (error) {
  if (error instanceof CoordinateTransformationError) {
    console.error('Transformation failed:', error.point);
  } else if (error instanceof InvalidCoordinateError) {
    console.error('Invalid coordinates:', error.point);
  }
}
```

## Future Improvements

### Planned Enhancements
1. Dynamic system loading based on usage
2. Advanced caching strategies
3. Parallel transformation support
4. Additional coordinate system support

### Performance Monitoring
1. Cache hit rate tracking
2. Transformation timing metrics
3. Memory usage monitoring
4. Error rate tracking

## Migration Notes

### From Old System
- Removed duplicate proj4 registrations
- Centralized initialization
- Enhanced error handling
- Improved performance with caching

### Breaking Changes
- Async transformation API
- New error types
- Stricter validation
- Required initialization

## Testing Strategy

### Unit Tests
- Transformation accuracy
- Error handling
- Cache behavior
- Bounds validation

### Integration Tests
- Component interaction
- Error propagation
- Memory management
- Performance benchmarks
