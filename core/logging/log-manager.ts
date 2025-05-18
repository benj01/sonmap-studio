/* eslint-disable no-restricted-syntax */
// NOTE: LogManager is for internal logger system use only. All application logging must use dbLogger from @/utils/logging/dbLogger. Direct LogManager usage is prohibited in application code.
import { saveAs } from 'file-saver';
import { LoggingConfig, LogEntry, ILogAdapter, LogContext } from './types';
import { v4 as uuidv4 } from 'uuid';
import { isLogLevelEnabled, setLogLevel, getLogLevel, LogLevel } from './logLevelConfig';

/**
 * Singleton logger for the geo-loader system
 */
export class LogManager {
  private static instance: LogManager;
  private logs: LogEntry[] = [];
  private readonly MAX_LOGS = 10000; // Prevent memory issues
  private rateLimits: Map<string, number> = new Map(); // Track last log time for rate limiting
  private readonly RATE_LIMIT_MS = process.env.NODE_ENV === 'development' ? 100 : 1000; // Shorter rate limit in development
  private config: LoggingConfig = loadLoggingConfig();
  private adapters: ILogAdapter[] = this.config.adapters?.map(a => adapterRegistry[a]).filter(Boolean) || [adapterRegistry['console']];
  private readonly instanceId: string;

  private constructor() {
    this.instanceId = uuidv4();
    // Log the instance ID on creation for diagnostics
    // eslint-disable-next-line no-console
    console.info(`[LogManager] Created instance with ID: ${this.instanceId}`);
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): LogManager {
    if (!LogManager.instance) {
      LogManager.instance = new LogManager();
    }
    return LogManager.instance;
  }

  // Log level management now delegates to logLevelConfig
  public setLogLevel(level: LogLevel): void {
    setLogLevel(level);
  }

  public getLogLevel(): LogLevel {
    return getLogLevel();
  }

  public setComponentLogLevel(component: string, level: LogLevel): void {
    setLogLevel(level, component);
  }

  public getComponentLogLevel(component: string): LogLevel {
    return getLogLevel(component);
  }

  public getComponentFilters(): [string, LogLevel][] {
    // Not all modules may be present in config, so return empty array or fetch from config if needed
    // For compatibility, return global and modules from logLevelConfig
    const config = require('./logLevelConfig');
    const logLevelConfig = config.getLogLevelConfig();
    return Object.entries(logLevelConfig.modules);
  }

  public addFilter(source: string, level: LogLevel): void {
    setLogLevel(level, source);
  }

  public removeFilter(source: string): void {
    setLogLevel(getLogLevel(), source); // Reset to global
  }

  public clearFilters(): void {
    // Clear all module-specific overrides
    const config = require('./logLevelConfig');
    const logLevelConfig = config.getLogLevelConfig();
    Object.keys(logLevelConfig.modules).forEach(module => setLogLevel(getLogLevel(), module));
  }

  private shouldLog(level: LogLevel, source: string): boolean {
    return isLogLevelEnabled(source, level);
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
      'Preview coordinate transformation',
      
      // Cesium-specific noisy patterns
      'Container state check',
      'Terrain provider created',
      'Viewer state check',
      'Scene loading status',
      'Initial camera position',
      'Global state updates',
      'Style update',
      'Effect UPDATE_STYLE',
      'Setting paint property',
      'Setting layout property',
      // New Cesium-specific noisy patterns
      'Camera position update',
      'Scene render',
      'Frame render',
      'Terrain tile loading',
      'Imagery tile loading',
      'Layer visibility change',
      'Primitive update',
      'Entity update',
      'Property change',
      'View state update',
      'Scene mode change',
      'Camera move',
      'Camera zoom',
      'Camera rotate',
      'Camera tilt',
      'Camera pan'
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
      
      // Cesium-specific important patterns
      'CesiumContext: Provider mounted',
      'CesiumContext: Provider unmounting',
      'CesiumContext: Setting viewer',
      'CesiumContext: Setting initialization state',
      'CesiumView: Starting initialization process',
      'CesiumView: Creating Cesium viewer',
      'CesiumView: Viewer created successfully',
      'CesiumView: Waiting for scene stability',
      'CesiumView: Scene stable for 10 frames',
      'CesiumView: Setting initialization state to true',
      'CesiumView: Cesium viewer fully initialized and stable',
      // New Cesium-specific important patterns
      'CesiumView: Error initializing Cesium viewer',
      'CesiumView: Error creating terrain provider',
      'CesiumView: Error setting camera position',
      'CesiumView: Error updating view state',
      'CesiumView: Scene initialization failed',
      'CesiumView: Terrain provider error',
      'CesiumView: Imagery provider error',
      'CesiumView: Entity creation failed',
      'CesiumView: Primitive creation failed',
      'CesiumView: Camera control error',
      'CesiumView: Scene render error',
      'CesiumView: Memory allocation error',
      'CesiumView: WebGL context lost',
      'CesiumView: Resource loading failed'
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
  public safeStringify(obj: unknown, indent: number = 2): string {
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

    function isLargeObject(obj: unknown): boolean {
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
    try {
      dataStr = '\n' + this.safeStringify(entry.data);
    } catch {
      dataStr = '\n[Error stringifying data]';
    }
    return `[${entry.timestamp}] [${entry.level}] [${entry.source}] ${entry.message}${dataStr}\n`;
  }

  private async addLog(entry: LogEntry) {
    try {
      // Forced info log for diagnosis (recursion guard)
      if (entry.message !== 'FORCED_ADDLOG_CHECK') {
        await this.info(entry.source, 'FORCED_ADDLOG_CHECK', {
          originalLevel: entry.level,
          originalMessage: entry.message,
          diagnostic: true,
          logManagerInstanceId: this.instanceId
        });
      }
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
        if (entry.level === 'warn') {
          console.warn(`[${entry.source}] ${entry.message}`);
        } else if (entry.level === 'error') {
          console.error(`[${entry.source}] ${entry.message}`);
        }
      }

      // Send to all adapters
      await Promise.all(this.adapters.map(adapter => adapter.log(entry)));

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
  public async debug(source: string, message: string, data?: unknown, context?: LogContext): Promise<void> {
    if (this.shouldLog('debug', source)) {
      await this.addLog({
        timestamp: new Date().toISOString(),
        level: 'debug', source, message, data, context
      });
    }
  }

  /**
   * Log an info message
   */
  public async info(source: string, message: string, data?: unknown, context?: LogContext): Promise<void> {
    if (this.shouldLog('info', source)) {
      await this.addLog({
        timestamp: new Date().toISOString(),
        level: 'info', source, message, data, context
      });
    }
  }

  /**
   * Log a warning message
   */
  public async warn(source: string, message: string, data?: unknown, context?: LogContext): Promise<void> {
    if (this.shouldLog('warn', source)) {
      await this.addLog({
        timestamp: new Date().toISOString(),
        level: 'warn', source, message, data, context
      });
    }
  }

  /**
   * Log an error message
   */
  public async error(source: string, message: string, data?: unknown, context?: LogContext): Promise<void> {
    if (this.shouldLog('error', source)) {
      await this.addLog({
        timestamp: new Date().toISOString(),
        level: 'error', source, message, data, context
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
      `Log Level: ${this.getLogLevel()}`,
      `Total Logs: ${this.logs.length}`,
      '========================\n\n'
    ].join('\n');

    const fullLog = header + formattedLogs;
    
    // Create and save the file
    const blob = new Blob([fullLog], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, filename);
  }
}

// Config loader (env or JSON)
function loadLoggingConfig(): LoggingConfig {
  // Try .env first
  const logLevel = process.env.LOG_LEVEL as LoggingConfig['logLevel'] || 'INFO';
  let sourceFilters: LoggingConfig['sourceFilters'] = undefined;
  if (process.env.LOG_SOURCES) {
    sourceFilters = process.env.LOG_SOURCES.split(',').reduce((acc, pair) => {
      const [src, lvl] = pair.split(':');
      if (src && lvl) acc[src.trim()] = lvl.trim() as LoggingConfig['logLevel'];
      return acc;
    }, {} as Record<string, LoggingConfig['logLevel']>);
  }
  // TODO: Optionally load from logging.config.json
  return { logLevel, sourceFilters, adapters: ['console'] };
}

// Adapter registry
const adapterRegistry: Record<string, ILogAdapter> = {};

// Console adapter (default)
class ConsoleAdapter implements ILogAdapter {
  async log(entry: LogEntry): Promise<void> {
    // Do nothing: suppress all console output
  }
}
adapterRegistry['console'] = new ConsoleAdapter();

// Supabase adapter (implementation)
class SupabaseAdapter implements ILogAdapter {
  async log(entry: LogEntry): Promise<void> {
    try {
      // You may want to make the endpoint configurable
      const endpoint = process.env.SUPABASE_LOG_ENDPOINT || '/api/log';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      if (!res.ok) {
        // Fallback: log to console if Supabase logging fails
        console.warn('[SupabaseAdapter] Failed to log to Supabase:', res.status, await res.text());
      }
    } catch (err) {
      // Fallback: log to console if fetch throws
      console.error('[SupabaseAdapter] Error logging to Supabase:', err, entry);
    }
  }
}
adapterRegistry['supabase'] = new SupabaseAdapter();
// To enable: add 'supabase' to adapters in LoggingConfig 
/* eslint-enable no-restricted-syntax */ 