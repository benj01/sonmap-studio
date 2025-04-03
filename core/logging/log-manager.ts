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
  private readonly RATE_LIMIT_MS = process.env.NODE_ENV === 'development' ? 100 : 1000; // Shorter rate limit in development

  private constructor() {}

  /**
   * Configure specific components to use debug logging
   */
  public configureDefaultSources() {
    // Core functionality - INFO/WARN is usually good
    this.sourceFilters.set('Auth', LogLevel.WARN);
    this.sourceFilters.set('FileManager', LogLevel.WARN);
    this.sourceFilters.set('ImportManager', LogLevel.INFO); // Keep INFO for import status

    // UI components - Raise level for less noise during normal operation
    this.sourceFilters.set('MapView', LogLevel.INFO); // Keep INFO for load events
    this.sourceFilters.set('LayerList', LogLevel.WARN);
    this.sourceFilters.set('LayerItem', LogLevel.WARN);
    this.sourceFilters.set('MapContext', LogLevel.WARN);
    this.sourceFilters.set('Toolbar', LogLevel.WARN);
    this.sourceFilters.set('LayerPanel', LogLevel.WARN); // Quieten panel renders
    this.sourceFilters.set('MapLayers', LogLevel.WARN);  // Quieten MapLayers renders

    // Hooks and Layer Components - Enable DEBUG for debugging
    this.sourceFilters.set('useAutoZoom', LogLevel.DEBUG); // Enable detailed logging
    this.sourceFilters.set('layerHooks', LogLevel.DEBUG); // Enable for useAreInitialLayersReady etc.
    this.sourceFilters.set('useLayerData', LogLevel.WARN);
    this.sourceFilters.set('useMapbox', LogLevel.WARN);
    this.sourceFilters.set('MapLayer', LogLevel.DEBUG); // Enable detailed logging
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
    // Rate limit these noisy patterns
    const noisyPatterns = [
      'Loading existing files',
      'Files loaded',
      'Loading files',
      'No files returned',
      'No project ID provided',
      'Matching companion check',
      'Processing files',
      'Files processed',
      'cleanup',
      'lifecycle',
      'Map initialization',
      'Map style loaded',
      'Map fully loaded',
      'Auth state change',
      'Initial session check',
      'Layer loaded',
      'Layer setup',
      'Downloading file',
      'Geometry cleaned',
      'Geometry repaired',
      'Found self-intersections',
      'Preview coordinate transformation'
    ];

    // Never rate limit these important messages
    const importantPatterns = [
      'Import starting',
      'Import complete',
      'Batch complete',
      'Feature errors',
      'Upload progress',
      'Stream complete',
      'Import failed',
      'Upload failed',
      'Error processing',
      'Error importing',
      'Error transforming',
      'Error loading files',
      'Style update',
      'Effect UPDATE_STYLE',
      'Setting paint property',
      'Setting layout property'
    ];

    // In development, treat all logs as potentially duplicated due to strict mode
    if (process.env.NODE_ENV === 'development') {
      const now = Date.now();
      const lastLog = this.rateLimits.get(key);
      if (lastLog && now - lastLog < this.RATE_LIMIT_MS) {
        // Skip rate limiting for important patterns
        if (importantPatterns.some(pattern => key.includes(pattern))) {
          return false;
        }
        return true;
      }
      this.rateLimits.set(key, now);
      return false;
    }

    // In production, only rate limit noisy patterns
    if (importantPatterns.some(pattern => key.includes(pattern))) {
      return false;
    }

    if (noisyPatterns.some(pattern => key.includes(pattern))) {
      const now = Date.now();
      const lastLog = this.rateLimits.get(key);
      if (lastLog && now - lastLog < this.RATE_LIMIT_MS) {
        return true;
      }
      this.rateLimits.set(key, now);
    }

    return false;
  }

  /**
   * Safely stringify an object, handling circular references and large objects
   */
  public safeStringify(obj: any, indent: number = 2): string {
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
    try {
      // Validate entry
      if (!entry || typeof entry !== 'object') {
        console.warn('Invalid log entry:', entry);
        return;
      }

      // Validate and sanitize message
      if (!entry.message || typeof entry.message !== 'string') {
        console.warn('Invalid message in log entry:', entry);
        return;
      }

      // Validate source
      if (!entry.source || typeof entry.source !== 'string') {
        console.warn('Invalid source in log entry:', entry);
        return;
      }

      // Rate limit similar logs
      const rateKey = `${entry.source}:${entry.level}:${entry.message}`;
      if (this.shouldRateLimit(rateKey)) {
        return;
      }

      // Add to logs array
      this.logs.push(entry);
      
      // Show important logs in console
      const isImportant = entry.level === 'error' || 
                       entry.level === 'warn' ||
                       (typeof entry.message === 'string' && (
                         entry.message.includes('Import') ||
                         entry.message.includes('Batch') ||
                         entry.message.includes('Upload')
                       ));

      if (isImportant) {
        const consoleMethod = entry.level === 'error' ? 'error' : 
                          entry.level === 'warn' ? 'warn' : 'info';
        
        let logData = undefined;
        if (entry.data) {
          try {
            // For feature arrays, only show count
            const data = { ...entry.data };
            if (data?.features && Array.isArray(data.features)) {
              data.featureCount = data.features.length;
              delete data.features;
            }
            logData = data;
          } catch (err) {
            console.warn('Error processing log data:', err);
          }
        }

        if (logData) {
          console[consoleMethod](`[${entry.source}] ${entry.message}`, logData);
        } else {
          console[consoleMethod](`[${entry.source}] ${entry.message}`);
        }
      }

      // Trim old logs if we exceed MAX_LOGS
      if (this.logs.length > this.MAX_LOGS) {
        this.logs = this.logs.slice(-this.MAX_LOGS);
      }
    } catch (error) {
      console.error('Error adding log entry:', { error, entry });
    }
  }

  /**
   * Log a debug message
   */
  public debug(source: string | undefined, message: string | undefined, data?: any): void {
    try {
      if (!source || typeof source !== 'string' || !message || typeof message !== 'string') {
        console.warn('Invalid log parameters:', { source, message });
        return;
      }

      if (this.shouldLog(LogLevel.DEBUG, source)) {
        this.addLog({
          timestamp: new Date().toISOString(),
          level: 'debug',
          source: source.trim(),
          message: message.trim(),
          data: data === undefined ? undefined : data
        });
      }
    } catch (error) {
      console.error('Error in debug log:', { error, source, message, data });
    }
  }

  /**
   * Log an info message
   */
  public info(source: string | undefined, message: string | undefined, data?: any): void {
    try {
      if (!source || typeof source !== 'string' || !message || typeof message !== 'string') {
        console.warn('Invalid log parameters:', { source, message });
        return;
      }

      if (this.shouldLog(LogLevel.INFO, source)) {
        this.addLog({
          timestamp: new Date().toISOString(),
          level: 'info',
          source: source.trim(),
          message: message.trim(),
          data: data === undefined ? undefined : data
        });
      }
    } catch (error) {
      console.error('Error in info log:', { error, source, message, data });
    }
  }

  /**
   * Log a warning message
   */
  public warn(source: string | undefined, message: string | undefined, data?: any): void {
    try {
      if (!source || typeof source !== 'string' || !message || typeof message !== 'string') {
        console.warn('Invalid log parameters:', { source, message });
        return;
      }

      if (this.shouldLog(LogLevel.WARN, source)) {
        this.addLog({
          timestamp: new Date().toISOString(),
          level: 'warn',
          source: source.trim(),
          message: message.trim(),
          data: data === undefined ? undefined : data
        });
      }
    } catch (error) {
      console.error('Error in warn log:', { error, source, message, data });
    }
  }

  /**
   * Log an error message
   */
  public error(source: string | undefined, message: string | undefined, data?: any): void {
    try {
      if (!source || typeof source !== 'string' || !message || typeof message !== 'string') {
        console.warn('Invalid log parameters:', { source, message });
        return;
      }

      if (this.shouldLog(LogLevel.ERROR, source)) {
        this.addLog({
          timestamp: new Date().toISOString(),
          level: 'error',
          source: source.trim(),
          message: message.trim(),
          data: data === undefined ? undefined : data
        });
      }
    } catch (error) {
      console.error('Error in error log:', { error, source, message, data });
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