/**
 * Log level enumeration
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

/**
 * Logger interface
 */
export interface Logger {
  debug(source: string, message: string, data?: Record<string, unknown>): void;
  info(source: string, message: string, data?: Record<string, unknown>): void;
  warn(source: string, message: string, data?: Record<string, unknown>): void;
  error(source: string, message: string, data?: Record<string, unknown>): void;
}

/**
 * Default logger implementation
 */
export class DefaultLogger implements Logger {
  constructor(private readonly minLevel: LogLevel = LogLevel.INFO) {}

  public debug(source: string, message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this.log(LogLevel.DEBUG, source, message, data);
    }
  }

  public info(source: string, message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.INFO)) {
      this.log(LogLevel.INFO, source, message, data);
    }
  }

  public warn(source: string, message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      this.log(LogLevel.WARN, source, message, data);
    }
  }

  public error(source: string, message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      this.log(LogLevel.ERROR, source, message, data);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = Object.values(LogLevel);
    const minLevelIndex = levels.indexOf(this.minLevel);
    const currentLevelIndex = levels.indexOf(level);
    return currentLevelIndex >= minLevelIndex;
  }

  private log(level: LogLevel, source: string, message: string, data?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      level,
      source,
      message,
      ...data
    };

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(JSON.stringify(logData));
        break;
      case LogLevel.INFO:
        console.info(JSON.stringify(logData));
        break;
      case LogLevel.WARN:
        console.warn(JSON.stringify(logData));
        break;
      case LogLevel.ERROR:
        console.error(JSON.stringify(logData));
        break;
    }
  }
} 