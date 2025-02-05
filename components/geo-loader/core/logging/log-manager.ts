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
  level: LogLevel;
  source: string;
  message: string;
  details?: Record<string, any>;
}

/**
 * Singleton logger for the geo-loader system
 */
export class LogManager {
  private static instance: LogManager;
  private logs: LogEntry[] = [];
  private readonly MAX_LOGS = 10000; // Prevent memory issues

  private constructor() {}

  /**
   * Get the singleton instance
   */
  public static getInstance(): LogManager {
    if (!LogManager.instance) {
      LogManager.instance = new LogManager();
    }
    return LogManager.instance;
  }

  /**
   * Safely stringify an object, handling circular references
   */
  private safeStringify(obj: any, indent: number = 2): string {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular Reference]';
        }
        seen.add(value);
      }
      return value;
    }, indent);
  }

  private formatLogEntry(entry: LogEntry): string {
    const dataStr = entry.details ? `\n${this.safeStringify(entry.details)}` : '';
    return `[${entry.timestamp}] [${entry.level}] [${entry.source}] ${entry.message}${dataStr}\n`;
  }

  /**
   * Log a debug message
   */
  public debug(source: string, message: string, details?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, source, message, details);
  }

  /**
   * Log an info message
   */
  public info(source: string, message: string, details?: Record<string, any>): void {
    this.log(LogLevel.INFO, source, message, details);
  }

  /**
   * Log a warning message
   */
  public warn(source: string, message: string, details?: Record<string, any>): void {
    this.log(LogLevel.WARN, source, message, details);
  }

  /**
   * Log an error message
   */
  public error(source: string, message: string, details?: Record<string, any>): void {
    this.log(LogLevel.ERROR, source, message, details);
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

  /**
   * Internal logging method
   */
  private log(level: LogLevel, source: string, message: string, details?: Record<string, any>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      details
    };

    this.logs.push(entry);
    if (this.logs.length > this.MAX_LOGS) {
      this.logs.shift(); // Remove oldest log if buffer is full
    }
    
    // Also log to console for development
    const consoleMessage = `[${entry.timestamp}] [${level}] [${source}] ${message}`;
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(consoleMessage, details);
        break;
      case LogLevel.INFO:
        console.info(consoleMessage, details);
        break;
      case LogLevel.WARN:
        console.warn(consoleMessage, details);
        break;
      case LogLevel.ERROR:
        console.error(consoleMessage, details);
        break;
    }
  }

  public downloadLogs(filename: string = 'sonmap-logs.txt') {
    const logText = this.logs.map(entry => this.formatLogEntry(entry)).join('\n');
    const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, filename);
  }
} 