/**
 * Interface defining the contract for logging functionality
 * Used to abstract logging implementation details and enable different logging strategies
 */
export interface ILogger {
  /**
   * Log a debug level message
   * @param source - The source component or module generating the log
   * @param message - The log message
   * @param data - Optional additional data to log
   */
  debug(source: string, message: string, data?: any): void;

  /**
   * Log an info level message
   * @param source - The source component or module generating the log
   * @param message - The log message
   * @param data - Optional additional data to log
   */
  info(source: string, message: string, data?: any): void;

  /**
   * Log a warning level message
   * @param source - The source component or module generating the log
   * @param message - The log message
   * @param data - Optional additional data to log
   */
  warn(source: string, message: string, data?: any): void;

  /**
   * Log an error level message
   * @param source - The source component or module generating the log
   * @param message - The log message
   * @param data - Optional additional data to log
   */
  error(source: string, message: string, data?: any): void;
} 