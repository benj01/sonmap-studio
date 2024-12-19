# Error Handling in Geo-Loader

This document describes the error handling patterns and best practices used in the geo-loader component.

## Overview

The geo-loader component uses a centralized error handling system based on the `ErrorReporter` interface. This system provides:

- Consistent error reporting across all components
- Type-safe error contexts
- Clear severity levels (ERROR, WARNING, INFO)
- Proper error propagation
- Better debugging capabilities

## ErrorReporter Interface

```typescript
interface ErrorReporter {
  reportError(type: string, message: string, context?: ErrorContext): void;
  reportWarning(type: string, message: string, context?: ErrorContext): void;
  reportInfo(type: string, message: string, context?: ErrorContext): void;
}
```

### Error Types

Error types should be UPPERCASE and descriptive of the error category:

- `PARSE_ERROR`: For errors during file parsing
- `MISSING_COMPONENTS`: For missing required file components
- `COORDINATE_SYSTEM`: For coordinate system related issues
- `CONVERSION_ERROR`: For errors during data conversion
- `TRANSFORM_ERROR`: For coordinate transformation errors
- `FEATURE_ERROR`: For errors processing individual features
- `INPUT_ERROR`: For invalid user input
- `LAYER_ERROR`: For layer-related issues

### Error Context

Error contexts should provide relevant information for debugging:

```typescript
interface ErrorContext {
  error?: string;           // Original error message
  contentPreview?: string;  // Preview of problematic content
  entityType?: string;      // Type of entity that caused the error
  layer?: string;          // Layer where the error occurred
  featureIndex?: number;   // Index of problematic feature
  coordinates?: number[];  // Problematic coordinates
  [key: string]: any;     // Additional context-specific information
}
```

## Usage Examples

### In Processors

```typescript
class DxfProcessor extends BaseProcessor {
  async analyze(file: File): Promise<AnalyzeResult> {
    try {
      // ... processing code ...
    } catch (error) {
      this.reportError('PARSE_ERROR', 'DXF parsing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        contentPreview: content.slice(0, 100) + '...'
      });
      throw error;
    }
  }
}
```

### In Components

```typescript
function FormatSettings({ errorReporter, ...props }) {
  const validateNumericInput = (value: string, min: number, max?: number) => {
    const num = parseFloat(value);
    if (isNaN(num)) {
      errorReporter.reportWarning('INPUT_ERROR', 'Invalid numeric input', { value });
      return null;
    }
    if (num < min) {
      errorReporter.reportWarning('INPUT_ERROR', `Value must be at least ${min}`, { value, min });
      return null;
    }
    return num;
  };
}
```

## Best Practices

1. **Error Types**
   - Use UPPERCASE for error types
   - Make types descriptive and specific
   - Use consistent types across related components

2. **Error Messages**
   - Make messages clear and actionable
   - Include relevant values in the message
   - Use consistent terminology

3. **Error Context**
   - Include all relevant debugging information
   - Add file/content previews when appropriate
   - Include indices/identifiers for problematic items

4. **Error Propagation**
   - Report errors at the lowest level where they occur
   - Propagate errors up when they affect higher-level operations
   - Use appropriate severity levels (ERROR vs WARNING)

5. **Error Recovery**
   - Provide fallback behavior when possible
   - Clean up resources after errors
   - Maintain consistent state after errors

## Testing

Error handling should be thoroughly tested:

```typescript
describe('DxfProcessor', () => {
  it('should report error for invalid DXF content', async () => {
    const file = createMockFile('test.dxf', 'application/dxf', 'invalid content');
    
    await expect(processor.analyze(file)).rejects.toThrow();
    
    const errors = errorReporter.getReportsByType('PARSE_ERROR');
    expect(errors.length).toBe(1);
    expect(errors[0].context).toHaveProperty('contentPreview');
  });
});
```

## Common Error Scenarios

1. **File Parsing**
   - Invalid file content
   - Missing required components
   - Unsupported file format

2. **Coordinate Systems**
   - Invalid coordinate system
   - Failed coordinate transformation
   - Out-of-range coordinates

3. **Feature Processing**
   - Invalid geometry
   - Missing required properties
   - Failed conversions

4. **User Input**
   - Invalid numeric values
   - Invalid delimiters
   - Missing required fields

## Migration Guide

When updating existing code to use the new error handling system:

1. Replace console.warn/error with appropriate reportError/reportWarning calls
2. Add proper error context objects
3. Remove usage of old error handling methods
4. Update tests to verify error reporting
5. Document error types and contexts

## Error Handling Flow

1. **Detection**
   - Identify error condition
   - Gather relevant context
   - Determine severity level

2. **Reporting**
   - Call appropriate report method
   - Include detailed context
   - Use specific error type

3. **Recovery**
   - Clean up resources
   - Restore consistent state
   - Provide fallback behavior

4. **Propagation**
   - Throw error if necessary
   - Update UI state
   - Log for debugging

## Future Improvements

- Add error aggregation capabilities
- Implement error rate limiting
- Add error analytics
- Improve error recovery strategies
- Add error translation support
