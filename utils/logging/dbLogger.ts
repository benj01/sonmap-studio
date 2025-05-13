/* eslint-disable no-restricted-syntax */
import { LogContext } from '@/core/logging/types';
import { isLogLevelEnabled, LogLevel } from '@/core/logging/logLevelConfig';

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

export const dbLogger = {
  addLogListener: (listener: LogEventListener) => logEmitter.addListener(listener),

  async debug(message: string, data?: unknown, context?: LogContext) {
    if (!shouldLog('debug', context)) return;
    const timestamp = new Date().toISOString();
    if (context?.source !== 'DebugPanel') {
      logEmitter.emit({
        timestamp,
        level: 'debug',
        message,
        data: normalizeData(data),
        context
      });
    }
    logToConsole('debug', message, data, context);
  },

  async info(message: string, data?: unknown, context?: LogContext) {
    if (!shouldLog('info', context)) return;
    const timestamp = new Date().toISOString();
    if (context?.source !== 'DebugPanel') {
      logEmitter.emit({
        timestamp,
        level: 'info',
        message,
        data: normalizeData(data),
        context
      });
    }
    logToConsole('info', message, data, context);
  },

  async warn(message: string, data?: unknown, context?: LogContext) {
    if (!shouldLog('warn', context)) return;
    const timestamp = new Date().toISOString();
    if (context?.source !== 'DebugPanel') {
      logEmitter.emit({
        timestamp,
        level: 'warn',
        message,
        data: normalizeData(data),
        context
      });
    }
    logToConsole('warn', message, data, context);
  },

  async error(message: string, data?: unknown, context?: LogContext) {
    // Always log errors
    const timestamp = new Date().toISOString();
    if (context?.source !== 'DebugPanel') {
      logEmitter.emit({
        timestamp,
        level: 'error',
        message,
        data: normalizeData(data),
        context
      });
    }
    logToConsole('error', message, data, context);
  }
};

// Export a type for the logger to help with type checking
export type DbLogger = typeof dbLogger;

/* eslint-enable no-restricted-syntax */ 