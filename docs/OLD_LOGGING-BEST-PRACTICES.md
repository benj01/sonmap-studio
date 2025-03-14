# Logging Best Practices

## Overview

This document outlines the standard logging practices for the sonmap-studio project. We use a centralized logging system with component-specific loggers to ensure consistent, traceable, and meaningful logs across the application.

## Logger Setup

### Importing and Creating a Logger

```typescript
import { createLogger } from '@/utils/logger'

const SOURCE = 'ComponentName'
const logger = createLogger(SOURCE)
```

### Log Levels

- **debug**: Detailed information for debugging purposes
- **info**: General information about application flow
- **warn**: Warning messages for potentially harmful situations
- **error**: Error messages for serious problems

## Best Practices

### 1. Component Source Names

- Use PascalCase for component sources
- Be specific but concise
- Examples:
  - ✅ `SupabaseClient`, `ImportService`, `MapView`
  - ❌ `Utils`, `Handler`, `Component`

### 2. Log Messages

- Use clear, concise messages
- Start with a verb in present tense
- Be specific about the action or state
- Examples:
  - ✅ `"Failed to fetch user profile"`
  - ✅ `"Starting import process"`
  - ❌ `"Error"`
  - ❌ `"Something went wrong"`

### 3. Contextual Data

Always include relevant context in the data parameter:

```typescript
// Good
logger.error('Failed to import features', {
  error,
  importId,
  batchIndex,
  featureCount
})

// Bad
logger.error('Failed to import features', error)
```

### 4. Error Handling

When logging errors:
- Include the original error object
- Add relevant context
- Use appropriate log levels

```typescript
try {
  await importFeatures(data)
} catch (error) {
  logger.error('Failed to import features', {
    error,
    data,
    context: 'batch-import'
  })
  throw error // Re-throw if needed
}
```

### 5. Performance Impact

- Avoid logging sensitive information
- Don't log large objects without filtering
- Use debug level for verbose information
- Consider rate limiting for frequent events

```typescript
// Good
logger.debug('Processing features', {
  count: features.length,
  type: features[0]?.type
})

// Bad
logger.debug('Processing features', { features }) // Don't log entire array
```

### 6. Async Operations

For async operations, log both start and completion:

```typescript
logger.info('Starting import process', { importId })
try {
  const result = await importFeatures()
  logger.info('Import process completed', { importId, result })
} catch (error) {
  logger.error('Import process failed', { importId, error })
}
```

### 7. Log Level Guidelines

- **debug**: Detailed information for development
  - Function entry/exit points
  - Variable values during processing
  - Intermediate states

- **info**: Normal application behavior
  - Process start/completion
  - Important state changes
  - User actions

- **warn**: Potential issues that don't stop execution
  - Deprecated feature usage
  - Recovery from minor errors
  - Performance degradation

- **error**: Serious problems requiring attention
  - Unhandled exceptions
  - API failures
  - Data corruption

## Migration Guide

When migrating from console.log or other logging approaches:

1. Replace direct console calls:
```typescript
// Before
console.log('Processing file:', fileName)

// After
logger.info('Processing file', { fileName })
```

2. Replace custom loggers:
```typescript
// Before
const log = (msg) => console.log(`[${component}] ${msg}`)

// After
const logger = createLogger(component)
```

3. Update error logging:
```typescript
// Before
console.error('Error:', error)

// After
logger.error('Operation failed', { error })
```

## Common Patterns

### Import Operations
```typescript
logger.info('Starting import', { importId, features: features.length })
logger.debug('Processing batch', { batchIndex, batchSize })
logger.error('Import failed', { error, importId, batchIndex })
```

### API Calls
```typescript
logger.debug('Calling API', { endpoint, params })
logger.info('API call successful', { endpoint, responseStatus })
logger.error('API call failed', { endpoint, error, params })
```

### User Actions
```typescript
logger.info('User action performed', { action, userId })
logger.warn('Invalid user input', { input, validation })
``` 