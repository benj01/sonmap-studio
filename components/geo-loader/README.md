# Geo-Loader Component

The geo-loader component provides functionality for importing and previewing various geospatial file formats (DXF, CSV, Shapefile). It includes robust error reporting and validation to help users identify and fix issues during the import process.

## Error Reporting System

The component uses a centralized error reporting system through the `ErrorReporter` interface. This provides consistent error handling and logging across all components.

### Error Reporter Interface

```typescript
interface ErrorReporter {
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  getMessages(): Message[];
  getErrors(): Message[];
  getWarnings(): Message[];
  hasErrors(): boolean;
  clear(): void;
}
```

### Message Types

Messages are categorized by severity:

```typescript
enum Severity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error'
}

interface Message {
  severity: Severity;
  message: string;
  timestamp: Date;
  error?: Error;
  context?: Record<string, unknown>;
}
```

## Coordinate System Handling

### Initialization

Coordinate systems are initialized at startup:

```typescript
const initialized = initializeCoordinateSystems(proj4Instance, errorReporter);
if (!initialized) {
  throw new Error('Failed to initialize coordinate systems');
}
```

### Transformation Errors

The component includes a specialized error type for coordinate transformation issues:

```typescript
class CoordinateTransformationError extends Error {
  constructor(
    message: string,
    public originalCoordinates: { x: number; y: number; z?: number },
    public fromSystem: string,
    public toSystem: string,
    public featureId?: string,
    public layer?: string
  ) {
    super(message);
  }
}
```

Common transformation errors include:

1. Invalid Input Coordinates
```typescript
throw new CoordinateTransformationError(
  'Invalid coordinate value',
  point,
  fromSystem,
  toSystem
);
```

2. Invalid Transformation Result
```typescript
throw new CoordinateTransformationError(
  'Transformation resulted in invalid coordinates',
  point,
  fromSystem,
  toSystem,
  featureId,
  layer
);
```

3. Maximum Attempts Exceeded
```typescript
errorReporter.warn(
  'Maximum transformation attempts exceeded',
  {
    point,
    attempts: MAX_ATTEMPTS,
    fromSystem,
    toSystem
  }
);
```

### Error Recovery

The component implements several strategies for handling transformation errors:

1. Retry Logic
- Tracks transformation attempts per point
- Limits maximum retries to prevent infinite loops
- Clears attempt counter after successful transformation

2. Fallback Behavior
- Returns null for failed transformations
- Allows calling code to handle missing coordinates
- Maintains partial results when possible

3. Context Preservation
- Includes original coordinates in error context
- Preserves feature and layer information
- Enables detailed error reporting

## Using Error Reporting in Components

### Component Props

Components that use error reporting should include the `errorReporter` prop:

```typescript
interface ComponentProps {
  // ... other props
  errorReporter: ErrorReporter;
}
```

### Reporting Errors

```typescript
// Report an error with additional context
errorReporter.error('Failed to apply coordinate system', error, {
  from: originalSystem,
  to: newSystem
});

// Report a warning
errorReporter.warn('Coordinates appear to be outside valid range', {
  bounds: analysis.bounds,
  currentSystem: analysis.coordinateSystem
});

// Log informational messages
errorReporter.info('Successfully applied coordinate system', {
  system: newSystem
});
```

## Common Error Types

### Coordinate System Errors

- Invalid coordinate system selection
- Coordinates outside valid range for system
- Transformation failures
- Missing or invalid coordinate system definitions

### DXF Structure Errors

- Missing block references
- Invalid entity types
- Layer validation errors
- Entity transformation errors

### Import Process Errors

- File parsing errors
- Invalid data structures
- Missing required properties
- Validation failures

## Testing Error Reporting

### Mock Error Reporter

A `MockErrorReporter` is provided in `test-utils.ts` for testing:

```typescript
const errorReporter = new MockErrorReporter();

// Test error reporting
component.simulateError();
const errors = errorReporter.getErrors();
expect(errors).toHaveLength(1);
expect(errors[0].message).toBe('Expected error message');
expect(errors[0].context).toEqual({
  expectedContext: 'value'
});
```

### Testing Components

When testing components that use error reporting:

1. Create a mock error reporter instance
2. Pass it to the component
3. Trigger actions that should generate errors/warnings
4. Assert on the reported messages

Example:

```typescript
describe('ComponentName', () => {
  let errorReporter: MockErrorReporter;

  beforeEach(() => {
    errorReporter = new MockErrorReporter();
  });

  it('reports errors appropriately', () => {
    render(<Component errorReporter={errorReporter} />);
    
    // Trigger error condition
    fireEvent.click(screen.getByText('Action'));

    // Check error was reported
    const errors = errorReporter.getErrors();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Expected error');
  });
});
```

## Best Practices

1. **Consistent Error Messages**: Use clear, descriptive error messages that explain both what went wrong and why.

2. **Contextual Information**: Always include relevant context with errors to aid in debugging and user assistance.

3. **Appropriate Severity**: Use the correct severity level:
   - ERROR: For issues that prevent successful operation
   - WARNING: For potential problems that don't block operation
   - INFO: For successful operations and important state changes

4. **Error Recovery**: Where possible, provide information about how to fix the error or what alternatives are available.

5. **Testing**: Always include error reporting tests when writing component tests.

## Components Using Error Reporting

### CoordinateSystemSelect

Reports errors and warnings related to coordinate system selection and validation.

### DxfStructureView

Reports warnings for missing block references and logs layer/template operations.

### SettingsSection

Integrates error reporting from both child components and adds its own validation for coordinate transformations.

## Future Improvements

1. Add support for error recovery suggestions
2. Implement error aggregation and summarization
3. Add support for error categories and filtering
4. Improve error context typing
5. Add support for error persistence and logging
