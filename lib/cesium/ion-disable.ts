import * as Cesium from 'cesium';
import { dbLogger } from '@/utils/logging/dbLogger';

const SOURCE = 'IonDisable';

/**
 * Completely disables Cesium Ion services by:
 * 1. Setting empty access token
 * 2. Disabling default server
 * 3. Intercepting and blocking Ion requests
 * 4. Disabling Ion-dependent features
 */
export function fullyDisableIon() {
  try {
    dbLogger.info('Starting Ion disable process', { source: SOURCE }).catch(() => {});

    // 1. Empty the access token
    Cesium.Ion.defaultAccessToken = '';
    dbLogger.debug('Cleared Ion access token', { source: SOURCE }).catch(() => {});

    // 2. Disable Ion default server
    if ('defaultServer' in Cesium.Ion) {
      (Cesium.Ion as unknown as { defaultServer?: unknown }).defaultServer = undefined;
      dbLogger.debug('Cleared Ion default server', { source: SOURCE }).catch(() => {});
    }

    // 3. Intercept any Ion requests
    if (Cesium.Resource) {
      const originalFetch = Cesium.Resource.prototype.fetch;
      Cesium.Resource.prototype.fetch = function(options?: unknown) {
        if (this.url && typeof this.url === 'string' && this.url.indexOf('cesium.com') >= 0) {
          dbLogger.warn('Blocked Ion request', { url: this.url, source: SOURCE }).catch(() => {});
          return Promise.reject(new Error('Ion requests disabled'));
        }
        // Type guard: only pass options if it's a non-null object or undefined
        if ((typeof options === 'object' && options !== null) || typeof options === 'undefined') {
          return originalFetch.call(this, options);
        }
        // If options is not a non-null object, call without arguments
        return originalFetch.call(this);
      };
      dbLogger.debug('Added Ion request interceptor', { source: SOURCE }).catch(() => {});
    }

    // 4. Disable Ion-dependent features
    if (Cesium.Ion) {
      // Disable any Ion-specific features
      (Cesium.Ion as unknown as { disableDefaultAccessToken?: boolean; disableDefaultServer?: boolean }).disableDefaultAccessToken = true;
      (Cesium.Ion as unknown as { disableDefaultAccessToken?: boolean; disableDefaultServer?: boolean }).disableDefaultServer = true;
      dbLogger.debug('Disabled Ion-specific features', { source: SOURCE }).catch(() => {});
    }

    // 5. Override any Ion-related functions
    if (Cesium.Ion) {
      // Override Ion.fromAssetId to prevent asset loading
      (Cesium.Ion as unknown as { fromAssetId?: () => Promise<never> }).fromAssetId = () => {
        dbLogger.warn('Attempted to load Ion asset - blocked', { source: SOURCE }).catch(() => {});
        return Promise.reject(new Error('Ion asset loading disabled'));
      };
      dbLogger.debug('Overrode Ion asset loading functions', { source: SOURCE }).catch(() => {});
    }

    dbLogger.info('Cesium Ion fully disabled', { source: SOURCE }).catch(() => {});
    return true;
  } catch (error: unknown) {
    dbLogger.error('Error disabling Cesium Ion', { error, source: SOURCE }).catch(() => {});
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
      dbLogger.warn('Ion access token is not empty', { source: SOURCE }).catch(() => {});
      return false;
    }

    // Check default server
    if ('defaultServer' in Cesium.Ion && (Cesium.Ion as unknown as { defaultServer?: unknown }).defaultServer !== undefined) {
      dbLogger.warn('Ion default server is not disabled', { source: SOURCE }).catch(() => {});
      return false;
    }

    // Check if Resource fetch is intercepted
    if (Cesium.Resource) {
      const fetch = Cesium.Resource.prototype.fetch;
      if (typeof fetch === 'function' && !fetch.toString().includes('Blocked Ion request')) {
        dbLogger.warn('Ion request interceptor is not in place', { source: SOURCE }).catch(() => {});
        return false;
      }
    }

    dbLogger.info('Ion disabled verification passed', { source: SOURCE }).catch(() => {});
    return true;
  } catch (error: unknown) {
    dbLogger.error('Error verifying Ion disabled state', { error, source: SOURCE }).catch(() => {});
    return false;
  }
} 