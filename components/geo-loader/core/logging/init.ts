import { LogManager, LogLevel } from './log-manager';

/**
 * Initialize the logger with proper configuration
 */
export function initializeLogger(): void {
  const logger = LogManager.getInstance();
  
  // Clear any existing logs first
  logger.clearLogs();
  
  // Set strict log levels based on environment
  if (process.env.NODE_ENV === 'development') {
    // In development, use LOG_LEVEL from env or default to WARN to reduce noise
    const logLevel = process.env.LOG_LEVEL || 'WARN';
    logger.setLogLevel(LogLevel[logLevel as keyof typeof LogLevel] || LogLevel.WARN);
    
    // Disable debug logging for specific components known to be noisy
    logger.addFilter('LineLayer', LogLevel.WARN);
    logger.addFilter('PreviewMap', LogLevel.WARN);
    logger.addFilter('MapLayers', LogLevel.WARN);
    logger.addFilter('ShapefileProcessor', LogLevel.ERROR); // Only log errors for shapefile processing
  } else {
    // In production, only show ERROR level
    logger.setLogLevel(LogLevel.ERROR);
  }
  
  // Log initialization with minimal details
  logger.info('LogManager', 'Logger initialized', {
    environment: process.env.NODE_ENV,
    logLevel: logger.getLogLevel()
  });
} 