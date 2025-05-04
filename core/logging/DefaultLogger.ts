import { LogManager } from './log-manager';
import { ILogger } from './ILogger';
import { LogContext } from './types';

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
  async debug(source: string, message: string, data?: any, context?: LogContext): Promise<void> {
    await this.logManager.debug(source, message, data, context);
  }

  /**
   * Log an info level message
   * @param source - The source component or module generating the log
   * @param message - The log message
   * @param data - Optional additional data to log
   */
  async info(source: string, message: string, data?: any, context?: LogContext): Promise<void> {
    await this.logManager.info(source, message, data, context);
  }

  /**
   * Log a warning level message
   * @param source - The source component or module generating the log
   * @param message - The log message
   * @param data - Optional additional data to log
   */
  async warn(source: string, message: string, data?: any, context?: LogContext): Promise<void> {
    await this.logManager.warn(source, message, data, context);
  }

  /**
   * Log an error level message
   * @param source - The source component or module generating the log
   * @param message - The log message
   * @param data - Optional additional data to log
   */
  async error(source: string, message: string, data?: any, context?: LogContext): Promise<void> {
    await this.logManager.error(source, message, data, context);
  }
} 