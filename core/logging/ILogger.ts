/**
 * Interface defining the contract for logging functionality
 * Used to abstract logging implementation details and enable different logging strategies
 */
import { LogContext } from './types';

export interface ILogger {
  /**
   * Log a debug level message
   * @param source - The source component or module generating the log
   * @param message - The log message
   * @param data - Optional additional data to log
   * @param context - Optional log context
   */
  debug(source: string, message: string, data?: any, context?: LogContext): Promise<void>;

  /**
   * Log an info level message
   * @param source - The source component or module generating the log
   * @param message - The log message
   * @param data - Optional additional data to log
   * @param context - Optional log context
   */
  info(source: string, message: string, data?: any, context?: LogContext): Promise<void>;

  /**
   * Log a warning level message
   * @param source - The source component or module generating the log
   * @param message - The log message
   * @param data - Optional additional data to log
   * @param context - Optional log context
   */
  warn(source: string, message: string, data?: any, context?: LogContext): Promise<void>;

  /**
   * Log an error level message
   * @param source - The source component or module generating the log
   * @param message - The log message
   * @param data - Optional additional data to log
   * @param context - Optional log context
   */
  error(source: string, message: string, data?: any, context?: LogContext): Promise<void>;
} 