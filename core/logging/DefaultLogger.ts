import { ILogger } from './ILogger';
import { LogContext } from './types';
import { dbLogger } from '@/utils/logging/dbLogger';

// DefaultLogger is a thin wrapper for dbLogger for backward compatibility.
// Direct LogManager usage is prohibited in application code. Use dbLogger or DefaultLogger only.

/**
 * Default implementation of ILogger that wraps dbLogger
 * This maintains backward compatibility while enforcing the use of dbLogger
 */
export class DefaultLogger implements ILogger {
  /**
   * Log a debug level message
   * @param source - The source component or module generating the log
   * @param message - The log message
   * @param data - Optional additional data to log
   */
  async debug(source: string, message: string, data?: unknown, context?: LogContext): Promise<void> {
    await dbLogger.debug(message, data, { ...context, source });
  }

  /**
   * Log an info level message
   * @param source - The source component or module generating the log
   * @param message - The log message
   * @param data - Optional additional data to log
   */
  async info(source: string, message: string, data?: unknown, context?: LogContext): Promise<void> {
    await dbLogger.info(message, data, { ...context, source });
  }

  /**
   * Log a warning level message
   * @param source - The source component or module generating the log
   * @param message - The log message
   * @param data - Optional additional data to log
   */
  async warn(source: string, message: string, data?: unknown, context?: LogContext): Promise<void> {
    await dbLogger.warn(message, data, { ...context, source });
  }

  /**
   * Log an error level message
   * @param source - The source component or module generating the log
   * @param message - The log message
   * @param data - Optional additional data to log
   */
  async error(source: string, message: string, data?: unknown, context?: LogContext): Promise<void> {
    await dbLogger.error(message, data, { ...context, source });
  }
} 