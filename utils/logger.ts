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

  public setLogLevel(level: LogLevel): void {
    this.logManager.setLogLevel(level);
  }

  public setComponentLogLevel(component: string, level: LogLevel): void {
    this.logManager.setComponentLogLevel(component, level);
  }
}

export const logger = Logger.getInstance(); 