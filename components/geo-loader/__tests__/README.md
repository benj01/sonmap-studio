# Geo-Loader Tests

This directory contains comprehensive tests for the geo-loader component, with a particular focus on coordinate system handling, validation, and performance.

## Test Structure

### 1. Coordinate System Detection Tests
`coordinate-system-detection.test.ts`
- Tests for detecting Swiss coordinate systems (LV95, LV03)
- Tests for detecting WGS84 coordinates
- Tests for handling mixed and ambiguous coordinates
- Tests for handling invalid coordinates and edge cases

### 2. Coordinate Order Tests
`coordinate-order.test.ts`
- Tests for Swiss coordinate system order (E,N)
- Tests for WGS84 coordinate order (lon,lat)
- Tests for coordinate order validation
- Tests for round-trip transformations
- Tests for handling invalid coordinate orders

### 3. Performance Tests
`coordinate-performance.test.ts`
- Tests for large dataset handling
- Memory usage monitoring
- Batch processing tests
- Error handling under load
- Concurrent transformation tests

## Validation Patterns

### Coordinate System Validation

1. **Swiss LV95 Validation**
   - Valid ranges:
     - E (x): 2,000,000 to 3,000,000
     - N (y): 1,000,000 to 2,000,000
   - Detection requires 80% of points to match pattern
   - Example:
     ```typescript
     const validLV95Point = { x: 2600000, y: 1200000 }; // Bern
     ```

2. **Swiss LV03 Validation**
   - Valid ranges:
     - E (x): 480,000 to 850,000
     - N (y): 70,000 to 310,000
   - Detection requires 80% of points to match pattern
   - Example:
     ```typescript
     const validLV03Point = { x: 600000, y: 200000 }; // Bern
     ```

3. **WGS84 Validation**
   - Valid ranges:
     - Longitude (x): -180 to 180
     - Latitude (y): -90 to 90
   - Must have decimal values (not integers)
   - Example:
     ```typescript
     const validWGS84Point = { x: 7.45892, y: 46.95127 }; // Bern
     ```

### Coordinate Order Validation

1. **Swiss Systems (LV95, LV03)**
   - Coordinates are in (E,N) format
   - E coordinate must be larger than N coordinate for Swiss points
   - Example:
     ```typescript
     // Correct order (E,N)
     const correctOrder = { x: 2600000, y: 1200000 };
     
     // Incorrect order (N,E)
     const incorrectOrder = { x: 1200000, y: 2600000 };
     ```

2. **WGS84 System**
   - Coordinates are in (longitude,latitude) format
   - Longitude: -180 to 180
   - Latitude: -90 to 90
   - Example:
     ```typescript
     // Correct order (lon,lat)
     const correctOrder = { x: 7.45892, y: 46.95127 };
     ```

### Error Handling Patterns

1. **Invalid Coordinates**
   ```typescript
   // NaN coordinates
   expect(() => transformer.transform({ x: NaN, y: 46.95 }))
     .toThrow();

   // Out of range coordinates
   expect(() => transformer.transform({ x: -181, y: 46.95 }))
     .toThrow();
   ```

2. **Coordinate Order Errors**
   ```typescript
   // Test for coordinate order warning
   const swappedPoint = { x: 1200000, y: 2600000 }; // Swapped E,N
   transformer.transform(swappedPoint);
   expect(errorReporter.getWarnings())
     .toContainEqual(expect.objectContaining({
       message: expect.stringContaining('coordinate order')
     }));
   ```

### Performance Validation Patterns

1. **Large Dataset Processing**
   ```typescript
   // Process 1000 points in less than 1 second
   const points = generatePoints(1000);
   const startTime = performance.now();
   points.forEach(point => transformer.transform(point));
   const duration = performance.now() - startTime;
   expect(duration).toBeLessThan(1000);
   ```

2. **Memory Usage**
   ```typescript
   // Memory increase should be reasonable
   const initialMemory = process.memoryUsage().heapUsed;
   points.forEach(point => transformer.transform(point));
   const memoryIncrease = process.memoryUsage().heapUsed - initialMemory;
   expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // < 50MB
   ```

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test coordinate-system-detection.test.ts

# Run tests with coverage
npm test -- --coverage
```

## Test Coverage Goals

- Line coverage: >90%
- Branch coverage: >85%
- Function coverage: >90%
- Statement coverage: >90%

Focus areas:
1. Coordinate system detection logic
2. Transformation error handling
3. Edge cases in coordinate validation
4. Performance with large datasets
