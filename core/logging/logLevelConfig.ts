console.log('isLogLevelEnabled loaded');
import { isDebugEnabled } from '@/utils/logging/debugFlags';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'none';

const LOG_LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'none'];
const LOG_LEVEL_NUM: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  none: 5,
};

interface LogLevelConfig {
  global: LogLevel;
  modules: Record<string, LogLevel>;
  environment: 'development' | 'production' | 'test';
}

// Determine environment
const env = typeof process !== 'undefined' && process.env.NODE_ENV
  ? (process.env.NODE_ENV as 'development' | 'production' | 'test')
  : 'development';

// Default config
const defaultConfig: LogLevelConfig = {
  global: env === 'production' ? 'info' : 'debug',
  modules: {},
  environment: env,
};

let config: LogLevelConfig = { ...defaultConfig };

export function getLogLevel(moduleName?: string): LogLevel {
  if (moduleName && config.modules[moduleName]) {
    return config.modules[moduleName];
  }
  return config.global;
}

export function setLogLevel(level: LogLevel, moduleName?: string) {
  if (moduleName) {
    config.modules[moduleName] = level;
  } else {
    config.global = level;
  }
}

export function isLogLevelEnabled(moduleName: string, level: LogLevel): boolean {
  // If debug flag is enabled, treat as minimum 'debug' level
  if (isDebugEnabled(moduleName)) {
    const result = LOG_LEVEL_NUM[level] >= LOG_LEVEL_NUM['debug'];
    console.log('[LogLevel Diagnostic] (debug flag) module:', moduleName, 'requested:', level, 'configured: debug (forced by flag)', 'result:', result);
    return result;
  }
  const configuredLevel = getLogLevel(moduleName);
  const result = LOG_LEVEL_NUM[level] >= LOG_LEVEL_NUM[configuredLevel];
  console.log('[LogLevel Diagnostic] module:', moduleName, 'requested:', level, 'configured:', configuredLevel, 'result:', result);
  return result;
}

export function logLevelToNumber(level: LogLevel): number {
  return LOG_LEVEL_NUM[level];
}

export function getLogLevelConfig(): LogLevelConfig {
  return { ...config, modules: { ...config.modules } };
} 