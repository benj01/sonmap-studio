import * as Cesium from 'cesium';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'IonDisable';
const logManager = LogManager.getInstance();

const logger = {
  info: (message: string, data?: any) => {
    logManager.info(SOURCE, message, data);
    console.log(`[${SOURCE}] ${message}`, data);
  },
  warn: (message: string, error?: any) => {
    logManager.warn(SOURCE, message, error);
    console.warn(`[${SOURCE}] ${message}`, error);
  },
  error: (message: string, error?: any) => {
    logManager.error(SOURCE, message, error);
    console.error(`[${SOURCE}] ${message}`, error);
  },
  debug: (message: string, data?: any) => {
    logManager.debug(SOURCE, message, data);
    console.debug(`[${SOURCE}] ${message}`, data);
  }
};

/**
 * Completely disables Cesium Ion services by:
 * 1. Setting empty access token
 * 2. Disabling default server
 * 3. Intercepting and blocking Ion requests
 * 4. Disabling Ion-dependent features
 */
export function fullyDisableIon() {
  try {
    logger.info('Starting Ion disable process');

    // 1. Empty the access token
    Cesium.Ion.defaultAccessToken = '';
    logger.debug('Cleared Ion access token');

    // 2. Disable Ion default server
    if ('defaultServer' in Cesium.Ion) {
      (Cesium.Ion as any).defaultServer = undefined;
      logger.debug('Cleared Ion default server');
    }

    // 3. Intercept any Ion requests
    if (Cesium.Resource) {
      const originalFetch = Cesium.Resource.prototype.fetch;
      Cesium.Resource.prototype.fetch = function(options?: any) {
        if (this.url && this.url.indexOf('cesium.com') >= 0) {
          logger.warn('Blocked Ion request:', this.url);
          return Promise.reject(new Error('Ion requests disabled'));
        }
        return originalFetch.call(this, options);
      };
      logger.debug('Added Ion request interceptor');
    }

    // 4. Disable Ion-dependent features
    if (Cesium.Ion) {
      // Disable any Ion-specific features
      (Cesium.Ion as any).disableDefaultAccessToken = true;
      (Cesium.Ion as any).disableDefaultServer = true;
      logger.debug('Disabled Ion-specific features');
    }

    // 5. Override any Ion-related functions
    if (Cesium.Ion) {
      // Override Ion.fromAssetId to prevent asset loading
      (Cesium.Ion as any).fromAssetId = () => {
        logger.warn('Attempted to load Ion asset - blocked');
        return Promise.reject(new Error('Ion asset loading disabled'));
      };
      logger.debug('Overrode Ion asset loading functions');
    }

    logger.info('Cesium Ion fully disabled');
    return true;
  } catch (error) {
    logger.error('Error disabling Cesium Ion:', error);
    return false;
  }
}

/**
 * Verifies that Ion is properly disabled by checking various indicators
 */
export function verifyIonDisabled(): boolean {
  try {
    // Check access token
    if (Cesium.Ion.defaultAccessToken !== '') {
      logger.warn('Ion access token is not empty');
      return false;
    }

    // Check default server
    if ('defaultServer' in Cesium.Ion && (Cesium.Ion as any).defaultServer !== undefined) {
      logger.warn('Ion default server is not disabled');
      return false;
    }

    // Check if Resource fetch is intercepted
    if (Cesium.Resource) {
      const fetch = Cesium.Resource.prototype.fetch;
      if (typeof fetch === 'function' && !fetch.toString().includes('Blocked Ion request')) {
        logger.warn('Ion request interceptor is not in place');
        return false;
      }
    }

    logger.info('Ion disabled verification passed');
    return true;
  } catch (error) {
    logger.error('Error verifying Ion disabled state:', error);
    return false;
  }
} 