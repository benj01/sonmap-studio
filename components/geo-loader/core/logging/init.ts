import { LogManager, LogLevel } from './log-manager';

/**
 * Initialize the logger with proper configuration
 */
export function initializeLogger(): void {
  const logger = LogManager.getInstance();
  
  // Clear any existing logs first
  logger.clearLogs();
  
  // Set debug level for development to capture all logs
  if (process.env.NODE_ENV === 'development') {
    // Override to DEBUG level for troubleshooting
    logger.setLogLevel(LogLevel.DEBUG);
    
    // Remove filters to capture all component logs
    logger.clearFilters();
    
    // Add specific filters only for very noisy components
    logger.addFilter('LineLayer', LogLevel.INFO);
    logger.addFilter('PreviewMap', LogLevel.INFO);
    
    // Ensure shapefile-related components log everything
    logger.addFilter('ShapefileProcessor', LogLevel.DEBUG);
    logger.addFilter('PreviewManager', LogLevel.DEBUG);
    logger.addFilter('FeatureManager', LogLevel.DEBUG);
  } else {
    // In production, only show ERROR level
    logger.setLogLevel(LogLevel.ERROR);
  }
  
  // Set specific component log levels
  logger.setComponentLogLevel('LineLayer', LogLevel.DEBUG);
  logger.setComponentLogLevel('PreviewMap', LogLevel.DEBUG);
  logger.setComponentLogLevel('ShapefileProcessor', LogLevel.DEBUG);
  logger.setComponentLogLevel('PreviewManager', LogLevel.DEBUG);
  logger.setComponentLogLevel('FeatureManager', LogLevel.DEBUG);
  logger.setComponentLogLevel('CoordinateSystemManager', LogLevel.DEBUG);
  logger.setComponentLogLevel('CoordinateSystemHandler', LogLevel.DEBUG);
  logger.setComponentLogLevel('PreviewFeatureManager', LogLevel.DEBUG);
  logger.setComponentLogLevel('FeatureProcessor', LogLevel.DEBUG);
  
  // Log initialization with details
  logger.info('LogManager', 'Logger initialized', {
    environment: process.env.NODE_ENV,
    logLevel: LogLevel[logger.getLogLevel()],
    filters: logger.getComponentFilters()
  });
} 