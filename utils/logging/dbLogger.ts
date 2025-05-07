/* eslint-disable no-restricted-syntax */
import { DefaultLogger } from '@/core/logging/DefaultLogger';
import { LogContext } from '@/core/logging/types';

const logger = new DefaultLogger();
const DB_SOURCE = 'DB';

export const dbLogger = {
  async debug(message: string, data?: unknown, context?: LogContext) {
    await logger.debug(DB_SOURCE, message, data, context);
  },
  async info(message: string, data?: unknown, context?: LogContext) {
    await logger.info(DB_SOURCE, message, data, context);
  },
  async warn(message: string, data?: unknown, context?: LogContext) {
    await logger.warn(DB_SOURCE, message, data, context);
  },
  async error(message: string, data?: unknown, context?: LogContext) {
    await logger.error(DB_SOURCE, message, data, context);
  },
};
/* eslint-enable no-restricted-syntax */ 