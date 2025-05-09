/* eslint-disable no-restricted-syntax */
import { LogContext } from '@/core/logging/types';

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
  
  switch (level) {
    case 'debug':
      console.debug(logMessage, data || '');
      break;
    case 'info':
      console.info(logMessage, data || '');
      break;
    case 'warn':
      console.warn(logMessage, data || '');
      break;
    case 'error':
      console.error(logMessage, data || '');
      break;
    default:
      console.log(logMessage, data || '');
  }
};

export const dbLogger = {
  addLogListener: (listener: LogEventListener) => logEmitter.addListener(listener),

  async debug(message: string, data?: unknown, context?: LogContext) {
    const timestamp = new Date().toISOString();
    
    // Only emit events for non-debug panel logs
    if (context?.source !== 'DebugPanel') {
      logEmitter.emit({
        timestamp,
        level: 'debug',
        message,
        data: data as Record<string, unknown>,
        context
      });
    }
    
    logToConsole('debug', message, data, context);
  },

  async info(message: string, data?: unknown, context?: LogContext) {
    const timestamp = new Date().toISOString();
    
    if (context?.source !== 'DebugPanel') {
      logEmitter.emit({
        timestamp,
        level: 'info',
        message,
        data: data as Record<string, unknown>,
        context
      });
    }
    
    logToConsole('info', message, data, context);
  },

  async warn(message: string, data?: unknown, context?: LogContext) {
    const timestamp = new Date().toISOString();
    
    if (context?.source !== 'DebugPanel') {
      logEmitter.emit({
        timestamp,
        level: 'warn',
        message,
        data: data as Record<string, unknown>,
        context
      });
    }
    
    logToConsole('warn', message, data, context);
  },

  async error(message: string, data?: unknown, context?: LogContext) {
    const timestamp = new Date().toISOString();
    
    if (context?.source !== 'DebugPanel') {
      logEmitter.emit({
        timestamp,
        level: 'error',
        message,
        data: data as Record<string, unknown>,
        context
      });
    }
    
    logToConsole('error', message, data, context);
  }
};

// Export a type for the logger to help with type checking
export type DbLogger = typeof dbLogger;

/* eslint-enable no-restricted-syntax */ 