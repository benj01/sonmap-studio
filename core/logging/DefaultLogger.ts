import { dbLogger } from '@/utils/logging/dbLogger';
import { ILogger } from './ILogger';
import { LogContext } from './types';

// DefaultLogger is a thin wrapper for dbLogger for backward compatibility.
// Direct LogManager usage is prohibited in application code. Use dbLogger or DefaultLogger only.

/**
 * Default implementation of ILogger that uses the LogManager singleton internally
 * This maintains backward compatibility while providing a clean interface
 */
export class DefaultLogger implements ILogger {
  /**
   * Log a debug level message
   * @param source - The source component or module generating the log
   * @param message - The log message
   * @param data - Optional additional data to log
   */
  async debug(source: string, message: string, data?: unknown, context?: LogContext): Promise<void> {
    await dbLogger.debug(`[${source}] ${message}`, data, context);
  }

  /**
   * Log an info level message
   * @param source - The source component or module generating the log
   * @param message - The log message
   * @param data - Optional additional data to log
   */
  async info(source: string, message: string, data?: unknown, context?: LogContext): Promise<void> {
    await dbLogger.info(`[${source}] ${message}`, data, context);
  }

  /**
   * Log a warning level message
   * @param source - The source component or module generating the log
   * @param message - The log message
   * @param data - Optional additional data to log
   */
  async warn(source: string, message: string, data?: unknown, context?: LogContext): Promise<void> {
    await dbLogger.warn(`[${source}] ${message}`, data, context);
  }

  /**
   * Log an error level message
   * @param source - The source component or module generating the log
   * @param message - The log message
   * @param data - Optional additional data to log
   */
  async error(source: string, message: string, data?: unknown, context?: LogContext): Promise<void> {
    await dbLogger.error(`[${source}] ${message}`, data, context);
  }
} 