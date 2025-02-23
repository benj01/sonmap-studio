export function createLogger(source: string) {
  return {
    debug: (message: string, data?: any) => {
      console.debug(`[${source}] ${message}`, data);
    },
    info: (message: string, data?: any) => {
      console.info(`[${source}] ${message}`, data);
    },
    warn: (message: string, data?: any) => {
      console.warn(`[${source}] ${message}`, data);
    },
    error: (message: string, data?: any) => {
      console.error(`[${source}] ${message}`, data);
    }
  };
} 