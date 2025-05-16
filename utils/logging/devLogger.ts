// Always import dbLogger using the alias '@/utils/logging/dbLogger' to ensure singleton behavior across the app.
// Do NOT use relative imports like './dbLogger'.
import { useEffect, useRef, useCallback } from 'react';
import { dbLogger } from '@/utils/logging/dbLogger';

export const useDevLogger = (componentName: string) => {
  const mountCount = useRef(0);
  const isDevMode = process.env.NODE_ENV === 'development';
  const isStrictMode = isDevMode;

  useEffect(() => {
    if (!isDevMode) return;

    const logMount = async () => {
      mountCount.current += 1;
      if (mountCount.current === 1) {
        await dbLogger.debug(`[Strict Mode First Mount] ${componentName}`, {
          mountCount: mountCount.current,
          isStrictMode
        }, { source: componentName });
      } else if (mountCount.current === 2) {
        await dbLogger.debug(`${componentName} mounted`, {
          mountCount: mountCount.current,
          isStrictMode
        }, { source: componentName });
      }
    };

    logMount();

    return () => {
      if (mountCount.current === 1) {
        void dbLogger.debug(`[Strict Mode First Cleanup] ${componentName}`, undefined, { source: componentName });
      } else if (mountCount.current === 2) {
        void dbLogger.debug(`${componentName} unmounted`, undefined, { source: componentName });
      }
    };
  }, [componentName, isStrictMode]);

  const log = useCallback(async (message: string, data?: Record<string, unknown>) => {
    if (!isDevMode) return;
    if (!isStrictMode || mountCount.current >= 2) {
      await dbLogger.debug(`${componentName}: ${message}`, data, { source: componentName });
    }
  }, [componentName, isStrictMode]);

  const logError = useCallback(async (error: unknown, context?: string) => {
    if (!isDevMode) return;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    await dbLogger.error(`${componentName}: ${context || 'Error'}`, {
      error: errorMessage,
      stack: errorStack,
      mountCount: mountCount.current
    }, { source: componentName });
  }, [componentName]);

  const logInfo = useCallback(async (message: string, data?: Record<string, unknown>) => {
    if (!isDevMode) return;
    if (!isStrictMode || mountCount.current >= 2) {
      await dbLogger.info(`${componentName}: ${message}`, data, { source: componentName });
    }
  }, [componentName]);

  const logWarning = useCallback(async (message: string, data?: Record<string, unknown>) => {
    if (!isDevMode) return;
    await dbLogger.warn(`${componentName}: ${message}`, {
      ...data,
      mountCount: mountCount.current
    }, { source: componentName });
  }, [componentName]);

  const shouldLog = useCallback(() => {
    return !isStrictMode || mountCount.current >= 2;
  }, [isStrictMode]);

  return {
    log,
    logError,
    logInfo,
    logWarning,
    shouldLog,
    isDevMode,
    mountCount: mountCount.current
  };
}; 