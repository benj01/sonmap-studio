export type LogContext = {
  userId?: string;
  sessionId?: string;
  requestId?: string;
  [key: string]: any;
};

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
  data?: any;
  context?: LogContext;
}

export interface ILogAdapter {
  log(entry: LogEntry): Promise<void>;
}

export type LoggingConfig = {
  logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  sourceFilters?: Record<string, 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'>;
  adapters?: string[]; // e.g., ['console', 'supabase']
};

export interface ILogger {
  debug(source: string, message: string, data?: any, context?: LogContext): Promise<void>;
  info(source: string, message: string, data?: any, context?: LogContext): Promise<void>;
  warn(source: string, message: string, data?: any, context?: LogContext): Promise<void>;
  error(source: string, message: string, data?: any, context?: LogContext): Promise<void>;
} 