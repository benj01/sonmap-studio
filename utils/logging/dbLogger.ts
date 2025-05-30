// Always import dbLogger using the alias '@/utils/logging/dbLogger' to ensure singleton behavior across the app.
// Do NOT use relative imports like './dbLogger'.
/* eslint-disable no-restricted-syntax */
import { LogContext } from '@/core/logging/types';
import { isLogLevelEnabled, LogLevel } from '@/core/logging/logLevelConfig';
import { LogManager } from '@/core/logging/log-manager';

// Create an event emitter for logging events
type LogEventListener = (log: LogEntry) => void;

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  data?: Record<string, unknown>;
  context?: LogContext;
}

class LogEventEmitter {
  private listeners: LogEventListener[] = [];

  addListener(listener: LogEventListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  emit(log: LogEntry) {
    this.listeners.forEach(listener => listener(log));
  }
}

const logEmitter = new LogEventEmitter();

// Core logging functionality
const logToConsole = (level: string, message: string, data?: unknown, context?: LogContext) => {
  const timestamp = new Date().toISOString();
  const source = context?.source || 'unknown';
  const logMessage = `[${timestamp}] [${source}] ${message}`;
  let dataStr = '';
  if (data !== undefined) {
    try {
      dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    } catch {
      dataStr = String(data);
    }
  }
  switch (level) {
    case 'debug':
      console.debug(logMessage, dataStr);
      break;
    case 'info':
      console.info(logMessage, dataStr);
      break;
    case 'warn':
      console.warn(logMessage, dataStr);
      break;
    case 'error':
      console.error(logMessage, dataStr);
      break;
    default:
      console.log(logMessage, dataStr);
  }
};

function normalizeData(data?: unknown): Record<string, unknown> | undefined {
  if (data === undefined) return undefined;
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) return data as Record<string, unknown>;
  return { value: data };
}

function shouldLog(level: LogLevel, context?: LogContext): boolean {
  // Always allow error logs
  if (level === 'error') return true;
  const source = (context && typeof context === 'object' && 'source' in context && typeof (context as any).source === 'string')
    ? (context as any).source as string
    : 'unknown';
  return isLogLevelEnabled(source, level);
}

function getSource(context?: LogContext): string {
  return (context && typeof context === 'object' && 'source' in context && typeof (context as any).source === 'string')
    ? (context as any).source as string
    : 'unknown';
}

export const dbLogger = {
  addLogListener: (listener: LogEventListener) => {
    return logEmitter.addListener(listener);
  },

  async debug(message: string, data?: unknown, context?: LogContext) {
    const source = getSource(context);
    if (isLogLevelEnabled(source, 'debug')) {
      await LogManager.getInstance().debug(source, message, data, context);
      const logEntry = {
        timestamp: new Date().toISOString(),
        level: 'debug',
        message,
        data: normalizeData(data),
        context
      };
      logEmitter.emit(logEntry);
    }
  },

  async info(message: string, data?: unknown, context?: LogContext) {
    const source = getSource(context);
    const enabled = isLogLevelEnabled(source, 'info');
    if (enabled) {
      await LogManager.getInstance().info(source, message, data, context);
      const logEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message,
        data: normalizeData(data),
        context
      };
      logEmitter.emit(logEntry);
    }
  },

  async warn(message: string, data?: unknown, context?: LogContext) {
    const source = getSource(context);
    if (isLogLevelEnabled(source, 'warn')) {
      await LogManager.getInstance().warn(source, message, data, context);
      const logEntry = {
        timestamp: new Date().toISOString(),
        level: 'warn',
        message,
        data: normalizeData(data),
        context
      };
      logEmitter.emit(logEntry);
    }
  },

  async error(message: string, data?: unknown, context?: LogContext) {
    const source = getSource(context);
    if (isLogLevelEnabled(source, 'error')) {
      await LogManager.getInstance().error(source, message, data, context);
      const logEntry = {
        timestamp: new Date().toISOString(),
        level: 'error',
        message,
        data: normalizeData(data),
        context
      };
      logEmitter.emit(logEntry);
    }
  }
};

// Export a type for the logger to help with type checking
export type DbLogger = typeof dbLogger;

declare global {
  // eslint-disable-next-line no-var
  var __DB_LOGGER_ID: string | undefined;
}

// --- DIAGNOSTIC: Singleton Instance Check ---
if (!globalThis.__DB_LOGGER_ID) {
  globalThis.__DB_LOGGER_ID = Math.random().toString(36).slice(2);
  // Diagnostic log removed for production cleanliness. Uncomment for debugging:
  // console.log('[dbLogger] instance created:', globalThis.__DB_LOGGER_ID);
} else {
  // Diagnostic log removed for production cleanliness. Uncomment for debugging:
  // console.log('[dbLogger] instance reused:', globalThis.__DB_LOGGER_ID);
}
// --- END DIAGNOSTIC ---

/* eslint-enable no-restricted-syntax */ 