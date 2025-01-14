# Preview Manager Implementation Guide

This guide provides detailed technical information for implementing and extending the Preview Manager system.

## Type System

### Core Types

```typescript
// GeoFeature - Extended GeoJSON Feature
interface GeoFeature extends Feature {
  properties: {
    layer?: string;
    type?: string;
    [key: string]: any;
  };
}

// Preview Options
interface PreviewOptions {
  maxFeatures?: number;
  coordinateSystem?: CoordinateSystem;
  visibleLayers?: string[];
  viewportBounds?: [number, number, number, number];
  enableCaching?: boolean;
  smartSampling?: boolean;
  // ... other options
}

// Preview Collections
interface PreviewCollections {
  points: FeatureCollection;
  lines: FeatureCollection;
  polygons: FeatureCollection;
}
```

## Module Implementation Details

### 1. BoundsValidator

Key responsibilities:
```typescript
class BoundsValidator {
  // Validates and transforms bounds between coordinate systems
  async validateAndTransform(
    bounds: Bounds, 
    coordinateSystem: string
  ): Promise<{ 
    bounds: Bounds; 
    detectedSystem?: string 
  }>;

  // Creates a grid of points for bounds transformation
  private createBoundsGrid(bounds: Bounds): Feature<Point>[];

  // Filters valid transformed points
  private filterValidTransformedPoints(points: Feature[]): Feature<Point>[];
}
```

### 2. CoordinateSystemHandler

Core functionality:
```typescript
class CoordinateSystemHandler {
  // Transforms features between coordinate systems
  async transformFeatures(
    features: Feature[],
    targetSystem: CoordinateSystem,
    projectionInfo?: MapboxProjection
  ): Promise<GeoFeature[]>;

  // Validates coordinate system configuration
  async validate(): Promise<boolean>;

  // Adds metadata to transformed features
  private addMetadata(
    features: Feature[],
    originalSystem: CoordinateSystem,
    projectionInfo?: MapboxProjection
  ): GeoFeature[];
}
```

### 3. PreviewFeatureManager

Feature processing:
```typescript
class PreviewFeatureManager {
  // Streaming configuration
  private static readonly STREAM_THRESHOLD = 10000;
  private static readonly MEMORY_LIMIT_MB = 512;

  // Initializes feature manager with streaming support
  private initializeFeatureManager(): void {
    const useStreaming = this.maxFeatures > STREAM_THRESHOLD;
    // Configure streaming and memory limits
  }

  // Processes features with sampling
  async categorizeFeatures(features: GeoFeature[]): Promise<PreviewCollections> {
    // Implement smart sampling and categorization
  }
}
```

## Extension Points Implementation

### 1. Adding a New Coordinate System

```typescript
// 1. Add to coordinate system enum
enum COORDINATE_SYSTEMS {
  WGS84 = 'WGS84',
  SWISS_LV95 = 'SWISS_LV95',
  NEW_SYSTEM = 'NEW_SYSTEM' // Add new system
}

// 2. Implement transformation logic
class CoordinateSystemHandler {
  async transformFeatures(features: Feature[], targetSystem: CoordinateSystem): Promise<GeoFeature[]> {
    switch (targetSystem) {
      case COORDINATE_SYSTEMS.NEW_SYSTEM:
        // Implement new system transformation
        return this.transformToNewSystem(features);
      // ... existing cases
    }
  }

  private async transformToNewSystem(features: Feature[]): Promise<GeoFeature[]> {
    // Implement specific transformation logic
  }
}
```

### 2. Custom Feature Processing

```typescript
// 1. Define custom processor interface
interface FeatureProcessor {
  process(features: GeoFeature[]): Promise<GeoFeature[]>;
}

// 2. Implement custom processor
class CustomFeatureProcessor implements FeatureProcessor {
  async process(features: GeoFeature[]): Promise<GeoFeature[]> {
    // Implement custom processing logic
    return features.map(feature => ({
      ...feature,
      // Add custom processing
    }));
  }
}

// 3. Integrate with PreviewFeatureManager
class PreviewFeatureManager {
  constructor(
    private processor: FeatureProcessor = new DefaultFeatureProcessor()
  ) {}

  async processFeatures(features: GeoFeature[]): Promise<GeoFeature[]> {
    return this.processor.process(features);
  }
}
```

## Performance Optimization

### 1. Streaming Implementation

```typescript
class StreamingFeatureManager {
  private async* streamFeatures(
    features: GeoFeature[],
    chunkSize: number
  ): AsyncGenerator<GeoFeature[]> {
    for (let i = 0; i < features.length; i += chunkSize) {
      yield features.slice(i, i + chunkSize);
    }
  }

  async processLargeDataset(features: GeoFeature[]): Promise<void> {
    for await (const chunk of this.streamFeatures(features, 1000)) {
      await this.processChunk(chunk);
    }
  }
}
```

### 2. Cache Implementation

```typescript
class CacheManager {
  private cache: Map<string, CacheEntry>;
  private readonly ttl: number;

  set(key: string, value: any): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value;
  }
}
```

## Error Handling

### 1. Coordinate Transformation Errors

```typescript
class CoordinateTransformError extends Error {
  constructor(
    public readonly source: CoordinateSystem,
    public readonly target: CoordinateSystem,
    public readonly feature: Feature,
    message: string
  ) {
    super(message);
  }
}

// Usage in CoordinateSystemHandler
async transformFeatures(features: Feature[]): Promise<GeoFeature[]> {
  try {
    // Transform logic
  } catch (error) {
    throw new CoordinateTransformError(
      this.sourceSystem,
      this.targetSystem,
      features[0],
      'Transformation failed'
    );
  }
}
```

### 2. Bounds Validation

```typescript
class BoundsValidator {
  private validateBounds(bounds: Bounds): void {
    if (!this.isValidBounds(bounds)) {
      throw new Error('Invalid bounds: values must be finite and distinct');
    }

    if (!this.isInValidRange(bounds)) {
      throw new Error('Bounds outside valid range for coordinate system');
    }
  }
}
```

## Testing Strategy

### 1. Unit Tests

```typescript
describe('PreviewManager', () => {
  let manager: PreviewManager;
  let mockFeatureManager: jest.Mocked<PreviewFeatureManager>;

  beforeEach(() => {
    mockFeatureManager = {
      setFeatures: jest.fn(),
      getVisibleFeatures: jest.fn(),
      // ... other mocks
    };
    
    manager = new PreviewManager({
      featureManager: mockFeatureManager
    });
  });

  test('should process features correctly', async () => {
    const features = [/* test features */];
    await manager.setFeatures(features);
    
    expect(mockFeatureManager.setFeatures)
      .toHaveBeenCalledWith(expect.arrayContaining(features));
  });
});
```

### 2. Integration Tests

```typescript
describe('Preview System Integration', () => {
  test('should handle coordinate transformation workflow', async () => {
    const manager = new PreviewManager();
    const features = loadTestFeatures();
    
    await manager.setFeatures(features);
    const result = await manager.getPreviewCollections();
    
    expect(result.points.features).toHaveLength(features.length);
    expect(result.coordinateSystem).toBe(COORDINATE_SYSTEMS.WGS84);
  });
});
```

## Debugging

### 1. Debug Logging

```typescript
const DEBUG = process.env.NODE_ENV === 'development';

function debugLog(module: string, message: string, data?: any): void {
  if (!DEBUG) return;
  
  console.debug(`[${module}] ${message}`, data);
}

// Usage
class PreviewManager {
  setFeatures(features: Feature[]): void {
    debugLog('PreviewManager', 'Setting features', {
      count: features.length,
      types: this.getFeatureTypes(features)
    });
  }
}
```

### 2. Performance Monitoring

```typescript
class PerformanceMonitor {
  private static timers: Map<string, number> = new Map();

  static start(operation: string): void {
    this.timers.set(operation, performance.now());
  }

  static end(operation: string): void {
    const start = this.timers.get(operation);
    if (start) {
      const duration = performance.now() - start;
      debugLog('Performance', `${operation} took ${duration}ms`);
    }
  }
}
