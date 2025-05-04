# Sonmap Studio Logging System

## Overview
A modular, async/await-friendly logging system for both server (Node/Next.js API) and client (React) code. Supports configurable log levels, structured context, and pluggable adapters (console, Supabase, etc).

---

## Features
- **Async/await** logging methods
- **Configurable log levels** (global and per-source)
- **Structured context** (user/session/request)
- **Adapters**: Console (default), Supabase (REST endpoint), extensible
- **React integration** via context/provider
- **Rate limiting, memory management, and data sanitization**

---

## Configuration

### .env Example
```
LOG_LEVEL=DEBUG
LOG_SOURCES=DB:DEBUG,API:INFO
SUPABASE_LOG_ENDPOINT=https://your-project.supabase.co/functions/v1/log
```

### logging.config.json (optional, future)
```json
{
  "logLevel": "INFO",
  "sourceFilters": { "DB": "DEBUG", "API": "WARN" },
  "adapters": ["console", "supabase"]
}
```

---

## Usage

### 1. **Server/Utility Code (Node/Next.js API)**
```typescript
import { DefaultLogger } from './DefaultLogger';
const logger = new DefaultLogger();

await logger.info('DB', 'Query executed', { query, durationMs: 42 }, { userId: 'abc', requestId: 'xyz' });
await logger.error('API', 'Failed to fetch data', { error }, { userId: 'abc' });
```

### 2. **React Components (Client)**
```tsx
import { useLogger } from './LoggerContext';

function MyComponent() {
  const logger = useLogger();
  // ...
  const handleClick = async () => {
    await logger.debug('MyComponent', 'Button clicked', { some: 'data' }, { userId: 'abc' });
  };
  // ...
}
```

### 3. **Enabling SupabaseAdapter**
- Add `'supabase'` to the `adapters` array in your config (env or JSON).
- Set `SUPABASE_LOG_ENDPOINT` to your API route or Supabase function URL.

---

## Adapters
- **ConsoleAdapter**: Logs to browser/Node console (default).
- **SupabaseAdapter**: Sends logs to a REST endpoint (e.g., `/api/log`).
  - Configure endpoint via `SUPABASE_LOG_ENDPOINT` env variable.
  - Handles errors and falls back to console if needed.
- **Extensible**: Add your own adapters by implementing `ILogAdapter`.

---

## Context
- Pass structured context (user/session/request) to any log call:
```typescript
await logger.info('DB', 'User updated', { user }, { userId: 'abc', sessionId: 'def' });
```

---

## Best Practices
- Use `await` for all log calls to ensure async adapters complete.
- Use per-source log levels for noisy modules.
- Always include context for traceability in API/DB logs.
- For sensitive data, sanitize before logging.

---

## Example: Custom Adapter
```typescript
import { ILogAdapter, LogEntry } from './types';
class MyCustomAdapter implements ILogAdapter {
  async log(entry: LogEntry): Promise<void> {
    // Send to remote, file, etc.
  }
}
```

---

## See Also
- `core/logging/types.ts` for type definitions
- `core/logging/log-manager.ts` for LogManager and adapter registry
- `core/logging/DefaultLogger.ts` for default logger
- `core/logging/LoggerContext.tsx` for React integration 