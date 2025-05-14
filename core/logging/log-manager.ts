/* eslint-disable no-restricted-syntax */
// NOTE: LogManager is for internal logger system use only. All application logging must use dbLogger from @/utils/logging/dbLogger. Direct LogManager usage is prohibited in application code.
import { saveAs } from 'file-saver';
import { LoggingConfig, LogEntry, ILogAdapter, LogContext } from './types';

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
  private config: LoggingConfig = loadLoggingConfig();
  private adapters: ILogAdapter[] = this.config.adapters?.map(a => adapterRegistry[a]).filter(Boolean) || [adapterRegistry['console']];

  private constructor() {}

  /**
   * Configure specific components to use debug logging
   */
  public configureDefaultSources() {
    // Core functionality - INFO/WARN is usually good
    this.sourceFilters.set('Auth', LogLevel.WARN);
    this.sourceFilters.set('LoginForm', LogLevel.WARN);
    this.sourceFilters.set('ModalProvider', LogLevel.WARN);
    this.sourceFilters.set('FileManager', LogLevel.WARN);
    this.sourceFilters.set('ImportManager', LogLevel.INFO);

    // Import Wizard components - Enable debug logging
    this.sourceFilters.set('ImportWizard', LogLevel.DEBUG);
    this.sourceFilters.set('FileSelectStep', LogLevel.DEBUG);
    this.sourceFilters.set('GeoFileUpload', LogLevel.DEBUG);
    this.sourceFilters.set('GeoImportDialog', LogLevel.DEBUG);
    // Add ReviewStep and GeoJsonParser for fine-grained control
    this.sourceFilters.set('ReviewStep', LogLevel.INFO); // Default to INFO, can be set to DEBUG
    this.sourceFilters.set('GeoJsonParser', LogLevel.INFO); // Default to INFO, can be set to DEBUG
    this.sourceFilters.set('MapPreview', LogLevel.INFO); // Default to INFO, can be set to DEBUG

    // Map components - Focus on lifecycle events
    this.sourceFilters.set('MapContainer', LogLevel.WARN);
    this.sourceFilters.set('CesiumContext', LogLevel.INFO);
    this.sourceFilters.set('CesiumView', LogLevel.INFO);
    this.sourceFilters.set('MapView', LogLevel.WARN);
    this.sourceFilters.set('LayerList', LogLevel.WARN);
    this.sourceFilters.set('LayerItem', LogLevel.WARN);
    this.sourceFilters.set('MapContext', LogLevel.WARN);
    this.sourceFilters.set('Toolbar', LogLevel.WARN);
    this.sourceFilters.set('LayerPanel', LogLevel.WARN);
    this.sourceFilters.set('MapLayers', LogLevel.WARN);

    // Cesium-specific components - More granular control
    this.sourceFilters.set('CesiumCamera', LogLevel.WARN);
    this.sourceFilters.set('CesiumScene', LogLevel.WARN);
    this.sourceFilters.set('CesiumTerrain', LogLevel.WARN);
    this.sourceFilters.set('CesiumImagery', LogLevel.WARN);
    this.sourceFilters.set('CesiumPrimitives', LogLevel.WARN);

    // Hooks and Layer Components - Reduced from DEBUG to WARN
    this.sourceFilters.set('useAutoZoom', LogLevel.WARN);
    this.sourceFilters.set('layerHooks', LogLevel.WARN);
    this.sourceFilters.set('useLayerData', LogLevel.WARN);
    this.sourceFilters.set('useMapbox', LogLevel.WARN);
    this.sourceFilters.set('MapLayer', LogLevel.WARN);
    this.sourceFilters.set('layerStore', LogLevel.INFO);
    
    // Swiss Height Transformation - Set to DEBUG for detailed logging
    this.sourceFilters.set('coordinates', LogLevel.DEBUG);
    this.sourceFilters.set('HeightTransformBatchService', LogLevel.DEBUG);
    this.sourceFilters.set('HeightTransformService', LogLevel.DEBUG);
    this.sourceFilters.set('HeightConfigurationDialog', LogLevel.DEBUG);
    this.sourceFilters.set('api/coordinates/transform', LogLevel.INFO);
    this.sourceFilters.set('api/coordinates/transform-batch', LogLevel.INFO);
    this.sourceFilters.set('api/height-transformation/initialize', LogLevel.DEBUG);
    this.sourceFilters.set('api/height-transformation/feature-counts', LogLevel.DEBUG);
    this.sourceFilters.set('api/height-transformation/status', LogLevel.DEBUG);
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
    if (this.shouldLog(LogLevel.DEBUG, source)) {
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
    if (this.shouldLog(LogLevel.INFO, source)) {
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
    if (this.shouldLog(LogLevel.WARN, source)) {
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
    if (this.shouldLog(LogLevel.ERROR, source)) {
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
    const { level, source, message, data, context } = entry;
    const ctx = context ? ` | ctx: ${JSON.stringify(context)}` : '';
    if (level === 'warn') {
      if (data) {
        console.warn(`[${source}] ${message}${ctx}`, data);
      } else {
        console.warn(`[${source}] ${message}${ctx}`);
      }
    } else if (level === 'error') {
      if (data) {
        console.error(`[${source}] ${message}${ctx}`, data);
      } else {
        console.error(`[${source}] ${message}${ctx}`);
      }
    }
    // For info/debug, do not log to console
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