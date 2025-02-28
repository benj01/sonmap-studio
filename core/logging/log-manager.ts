import { saveAs } from 'file-saver';

/**
 * Log levels for the logging system
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
  data?: any;
}

/**
 * Singleton logger for the geo-loader system
 */
export class LogManager {
  private static instance: LogManager;
  private logs: LogEntry[] = [];
  private readonly MAX_LOGS = 10000; // Prevent memory issues
  private logLevel: LogLevel = LogLevel.INFO; // Default to INFO level
  private sourceFilters: Map<string, LogLevel> = new Map(); // Source-specific log levels
  private rateLimits: Map<string, number> = new Map(); // Track last log time for rate limiting
  private readonly RATE_LIMIT_MS = 1000; // Minimum ms between similar logs

  private constructor() {}

  /**
   * Configure specific components to use debug logging
   */
  public configureDefaultSources() {
    // Keep important components at INFO level for debugging
    this.sourceFilters.set('MapView', LogLevel.INFO);
    this.sourceFilters.set('useLayerData', LogLevel.INFO);
    this.sourceFilters.set('LayerItem', LogLevel.INFO);
    this.sourceFilters.set('MapContext', LogLevel.INFO);
    
    // Less critical components can stay at WARN
    this.sourceFilters.set('LayerList', LogLevel.WARN);
    this.sourceFilters.set('FileManager', LogLevel.WARN);
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): LogManager {
    if (!LogManager.instance) {
      LogManager.instance = new LogManager();
      LogManager.instance.configureDefaultSources();
    }
    return LogManager.instance;
  }

  /**
   * Add a source-specific log level filter
   */
  public addFilter(source: string, level: LogLevel): void {
    this.sourceFilters.set(source, level);
  }

  /**
   * Remove a source-specific log level filter
   */
  public removeFilter(source: string): void {
    this.sourceFilters.delete(source);
  }

  /**
   * Clear all source-specific filters
   */
  public clearFilters(): void {
    this.sourceFilters.clear();
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  public getLogLevel(): LogLevel {
    return this.logLevel;
  }

  public setComponentLogLevel(component: string, level: LogLevel): void {
    this.sourceFilters.set(component, level);
  }

  public getComponentLogLevel(component: string): LogLevel {
    return this.sourceFilters.get(component) || this.logLevel;
  }

  public getComponentFilters(): [string, LogLevel][] {
    return Array.from(this.sourceFilters.entries());
  }

  private shouldLog(level: LogLevel, source: string): boolean {
    // Check source-specific filter first
    const sourceLevel = this.sourceFilters.get(source);
    if (sourceLevel) {
      const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
      return levels.indexOf(level) >= levels.indexOf(sourceLevel);
    }
    
    // Fall back to global log level
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  private shouldRateLimit(key: string): boolean {
    // Only rate limit DEBUG level logs and specific noisy patterns
    if (!key.includes('debug') && 
        !key.includes('cleanup') && 
        !key.includes('lifecycle')) {
      return false;
    }

    const now = Date.now();
    const lastLog = this.rateLimits.get(key);
    if (lastLog && now - lastLog < this.RATE_LIMIT_MS) {
      return true;
    }
    this.rateLimits.set(key, now);
    return false;
  }

  /**
   * Safely stringify an object, handling circular references and large objects
   */
  private safeStringify(obj: any, indent: number = 2): string {
    const MAX_DEPTH = 3;
    const MAX_ARRAY_LENGTH = 10;
    const TRUNCATE_LENGTH = 100;
    const MAX_OBJECT_KEYS = 20;
    const SAFE_CLASSES = new Set(['Error', 'Date', 'RegExp', 'String', 'Number', 'Boolean']);

    function truncate(str: string): string {
      return str.length > TRUNCATE_LENGTH ? 
        str.slice(0, TRUNCATE_LENGTH) + '...' : str;
    }

    function sanitizeError(error: Error): Record<string, unknown> {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 3).join('\n')
      };
    }

    function isLargeObject(obj: any): boolean {
      return typeof obj === 'object' && 
             obj !== null && 
             !Array.isArray(obj) && 
             Object.keys(obj).length > MAX_OBJECT_KEYS;
    }

    let currentDepth = 0;
    const seen = new WeakSet();

    return JSON.stringify(obj, function(key, value) {
      // Skip internal properties, functions, and undefined values
      if (key.startsWith('_') || typeof value === 'function' || value === undefined) {
        return '[Omitted]';
      }

      // Handle null
      if (value === null) {
        return null;
      }

      // Handle primitive types directly
      if (typeof value !== 'object') {
        if (typeof value === 'string') {
          return truncate(value);
        }
        return value;
      }

      // Special handling for Error objects
      if (value instanceof Error) {
        return sanitizeError(value);
      }

      // Handle other objects
      if (typeof value === 'object') {
        // Handle circular references
        if (seen.has(value)) {
          return '[Circular]';
        }

        // Skip logging of logger instances
        if (value instanceof LogManager) {
          return '[Logger]';
        }

        // Handle safe built-in types
        if (SAFE_CLASSES.has(value.constructor?.name)) {
          return value.toString();
        }

        // Handle arrays
        if (Array.isArray(value)) {
          if (value.length > MAX_ARRAY_LENGTH) {
            return `[Array(${value.length})]`;
          }
          seen.add(value);
          const result = value.slice(0, MAX_ARRAY_LENGTH).map(item => {
            if (typeof item === 'object' && item !== null) {
              if (seen.has(item)) return '[Circular]';
              if (currentDepth >= MAX_DEPTH) return '[Nested]';
              if (isLargeObject(item)) return `[Large ${item.constructor?.name || 'Object'}]`;
            }
            return item;
          });
          if (value.length > MAX_ARRAY_LENGTH) {
            result.push(`...${value.length - MAX_ARRAY_LENGTH} more items`);
          }
          return result;
        }

        // Handle other objects
        seen.add(value);
        currentDepth++;

        // Check depth
        if (currentDepth > MAX_DEPTH) {
          const type = value.constructor ? value.constructor.name : 'Object';
          return `[${type}]`;
        }

        // Handle Maps and Sets
        if (value instanceof Map) {
          return `[Map(${value.size})]`;
        }
        if (value instanceof Set) {
          return `[Set(${value.size})]`;
        }

        // Handle large objects
        if (isLargeObject(value)) {
          const type = value.constructor ? value.constructor.name : 'Object';
          const keys = Object.keys(value);
          const preview = Object.fromEntries(
            keys.slice(0, MAX_OBJECT_KEYS).map(k => [k, value[k]])
          );
          if (keys.length > MAX_OBJECT_KEYS) {
            preview['...'] = `${keys.length - MAX_OBJECT_KEYS} more properties`;
          }
          return preview;
        }

        // For other objects, create a simplified version
        const simplified: Record<string, unknown> = {};
        for (const prop in value) {
          if (Object.prototype.hasOwnProperty.call(value, prop) && !prop.startsWith('_')) {
            simplified[prop] = value[prop];
          }
        }

        currentDepth--;
        return simplified;
      }

      return value;
    }, indent);
  }

  private formatLogEntry(entry: LogEntry): string {
    let dataStr = '';
    if (entry.data) {
      try {
        dataStr = '\n' + this.safeStringify(entry.data);
      } catch (error) {
        dataStr = '\n[Error stringifying data]';
      }
    }
    return `[${entry.timestamp}] [${entry.level}] [${entry.source}] ${entry.message}${dataStr}\n`;
  }

  private addLog(entry: LogEntry) {
    // Rate limit similar logs
    const rateKey = `${entry.source}:${entry.level}:${entry.message}`;
    if (this.shouldRateLimit(rateKey)) {
      return;
    }

    this.logs.push(entry);
    // Also output to console for immediate feedback
    const consoleMethod = entry.level === 'error' ? 'error' : 
                         entry.level === 'warn' ? 'warn' : 
                         entry.level === 'info' ? 'info' : 'debug';
    
    if (entry.data) {
      console[consoleMethod](`[${entry.source}] ${entry.message}`, entry.data);
    } else {
      console[consoleMethod](`[${entry.source}] ${entry.message}`);
    }

    // Trim old logs if we exceed MAX_LOGS
    if (this.logs.length > this.MAX_LOGS) {
      this.logs = this.logs.slice(-this.MAX_LOGS);
    }
  }

  /**
   * Log a debug message
   */
  public debug(source: string, message: string, data?: any): void {
    if (this.shouldLog(LogLevel.DEBUG, source)) {
      this.addLog({
        timestamp: new Date().toISOString(),
        level: 'debug',
        source,
        message,
        data
      });
    }
  }

  /**
   * Log an info message
   */
  public info(source: string, message: string, data?: any): void {
    if (this.shouldLog(LogLevel.INFO, source)) {
      this.addLog({
        timestamp: new Date().toISOString(),
        level: 'info',
        source,
        message,
        data
      });
    }
  }

  /**
   * Log a warning message
   */
  public warn(source: string, message: string, data?: any): void {
    if (this.shouldLog(LogLevel.WARN, source)) {
      this.addLog({
        timestamp: new Date().toISOString(),
        level: 'warn',
        source,
        message,
        data
      });
    }
  }

  /**
   * Log an error message
   */
  public error(source: string, message: string, data?: any): void {
    if (this.shouldLog(LogLevel.ERROR, source)) {
      this.addLog({
        timestamp: new Date().toISOString(),
        level: 'error',
        source,
        message,
        data
      });
    }
  }

  /**
   * Get all logs
   */
  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Clear all logs
   */
  public clearLogs(): void {
    this.logs = [];
  }

  public downloadLogs(filename: string = 'sonmap-logs.txt'): void {
    // Format logs with proper timestamps and structure
    const formattedLogs = this.logs.map(entry => {
      const detailsStr = entry.data ? `\nDetails: ${this.safeStringify(entry.data, 2)}` : '';
      return `[${entry.timestamp}] [${entry.level}] [${entry.source}] ${entry.message}${detailsStr}\n`;
    }).join('\n');

    // Add header with system information
    const header = [
      '=== Sonmap Studio Logs ===',
      `Generated: ${new Date().toISOString()}`,
      `Environment: ${process.env.NODE_ENV}`,
      `Log Level: ${this.logLevel}`,
      `Total Logs: ${this.logs.length}`,
      '========================\n\n'
    ].join('\n');

    const fullLog = header + formattedLogs;
    
    // Create and save the file
    const blob = new Blob([fullLog], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, filename);
  }
} 