import { LogManager } from './log-manager';
import { ILogger } from './ILogger';

/**
 * Default implementation of ILogger that uses the LogManager singleton internally
 * This maintains backward compatibility while providing a clean interface
 */
export class DefaultLogger implements ILogger {
  private logManager = LogManager.getInstance();

  /**
   * Log a debug level message
   * @param source - The source component or module generating the log
   * @param message - The log message
   * @param data - Optional additional data to log
   */
  debug(source: string, message: string, data?: any): void {
    this.logManager.debug(source, message, data);
  }

  /**
   * Log an info level message
   * @param source - The source component or module generating the log
   * @param message - The log message
   * @param data - Optional additional data to log
   */
  info(source: string, message: string, data?: any): void {
    this.logManager.info(source, message, data);
  }

  /**
   * Log a warning level message
   * @param source - The source component or module generating the log
   * @param message - The log message
   * @param data - Optional additional data to log
   */
  warn(source: string, message: string, data?: any): void {
    this.logManager.warn(source, message, data);
  }

  /**
   * Log an error level message
   * @param source - The source component or module generating the log
   * @param message - The log message
   * @param data - Optional additional data to log
   */
  error(source: string, message: string, data?: any): void {
    this.logManager.error(source, message, data);
  }
} 