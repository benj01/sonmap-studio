import { LogManager, LogLevel } from '@/core/logging/log-manager';

class Logger {
  private static instance: Logger;
  private logManager: LogManager;

  private constructor() {
    this.logManager = LogManager.getInstance();
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  // Create a logger with a fixed source
  public static forComponent(source: string): {
    debug: (message: string, data?: any) => void;
    info: (message: string, data?: any) => void;
    warn: (message: string, data?: any) => void;
    error: (message: string, data?: any) => void;
  } {
    const logManager = LogManager.getInstance();
    return {
      debug: (message: string, data?: any) => logManager.debug(source, message, data),
      info: (message: string, data?: any) => logManager.info(source, message, data),
      warn: (message: string, data?: any) => logManager.warn(source, message, data),
      error: (message: string, data?: any) => logManager.error(source, message, data)
    };
  }

  // Original methods
  public debug(source: string, message: string, data?: any): void {
    this.logManager.debug(source, message, data);
  }

  public info(source: string, message: string, data?: any): void {
    this.logManager.info(source, message, data);
  }

  public warn(source: string, message: string, data?: any): void {
    this.logManager.warn(source, message, data);
  }

  public error(source: string, message: string, data?: any): void {
    this.logManager.error(source, message, data);
  }

  // Configuration methods
  public setLogLevel(level: LogLevel): void {
    this.logManager.setLogLevel(level);
  }

  public setComponentLogLevel(component: string, level: LogLevel): void {
    this.logManager.setComponentLogLevel(component, level);
  }

  // Additional useful methods
  public downloadLogs(filename?: string): void {
    this.logManager.downloadLogs(filename);
  }

  public getLogs() {
    return this.logManager.getLogs();
  }

  public clearLogs(): void {
    this.logManager.clearLogs();
  }
}

// Export the singleton instance
export const logger = Logger.getInstance();

// Export the component logger factory
export const createLogger = Logger.forComponent; 