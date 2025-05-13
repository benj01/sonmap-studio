// Centralized debug flag system for module-specific verbose logging
// Supports browser (window.APP_DEBUG_FLAGS) and Node/server (in-memory object)
// In production, all debug flags are off and cannot be enabled

/**
 * Extend Window interface for APP_DEBUG_FLAGS
 */
declare global {
  interface Window {
    APP_DEBUG_FLAGS?: Record<string, boolean>;
  }
}

/**
 * Type for debug flag map
 */
export type DebugFlagMap = Record<string, boolean>;

const isProd = typeof process !== 'undefined' && process.env.NODE_ENV === 'production';

// Internal flag store (Node/server or fallback)
let debugFlags: DebugFlagMap = {};

// Browser: use window.APP_DEBUG_FLAGS if available
function getWindowDebugFlags(): DebugFlagMap | undefined {
  if (typeof window !== 'undefined' && window.APP_DEBUG_FLAGS) {
    return window.APP_DEBUG_FLAGS as DebugFlagMap;
  }
  return undefined;
}

// Browser: load from localStorage if present
function loadLocalStorageFlags(): DebugFlagMap | undefined {
  if (typeof window !== 'undefined' && window.localStorage) {
    const raw = window.localStorage.getItem('APP_DEBUG_FLAGS');
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {}
    }
  }
  return undefined;
}

// Node: load from process.env (e.g., DEBUG_FLAGS="ShapefileParser,FileProcessor")
function loadEnvFlags(): DebugFlagMap | undefined {
  if (typeof process !== 'undefined' && process.env.DEBUG_FLAGS) {
    const flags = process.env.DEBUG_FLAGS.split(',').map(f => f.trim()).filter(Boolean);
    const map: DebugFlagMap = {};
    for (const flag of flags) map[flag] = true;
    return map;
  }
  return undefined;
}

// Initialize debug flags (dev only)
function initDebugFlags() {
  if (isProd) return {}; // All flags off in production
  // Browser: window, then localStorage
  const winFlags = getWindowDebugFlags();
  if (winFlags) return { ...winFlags };
  const lsFlags = loadLocalStorageFlags();
  if (lsFlags) return { ...lsFlags };
  // Node: process.env
  const envFlags = loadEnvFlags();
  if (envFlags) return { ...envFlags };
  return {};
}

debugFlags = initDebugFlags();

/**
 * Check if debug is enabled for a given module
 * @param module - The module name (e.g., 'ShapefileParser')
 */
export function isDebugEnabled(module: string): boolean {
  if (isProd) return false;
  // Browser: check window first
  const winFlags = getWindowDebugFlags();
  if (winFlags && typeof winFlags[module] === 'boolean') return winFlags[module];
  // Fallback: internal store
  return !!debugFlags[module];
}

/**
 * Set debug flag for a module (dev only)
 * @param module - The module name
 * @param enabled - true to enable, false to disable
 */
export function setDebugFlag(module: string, enabled: boolean): void {
  if (isProd) return;
  // Browser: set on window and localStorage
  if (typeof window !== 'undefined') {
    if (!window.APP_DEBUG_FLAGS) window.APP_DEBUG_FLAGS = {};
    window.APP_DEBUG_FLAGS[module] = enabled;
    window.localStorage?.setItem('APP_DEBUG_FLAGS', JSON.stringify(window.APP_DEBUG_FLAGS));
  }
  // Node/server: set in-memory
  debugFlags[module] = enabled;
}

/**
 * Get all current debug flags
 */
export function getDebugFlags(): DebugFlagMap {
  if (isProd) return {};
  // Browser: window first
  const winFlags = getWindowDebugFlags();
  if (winFlags) return { ...winFlags };
  return { ...debugFlags };
}

/**
 * Reset all debug flags (dev only)
 */
export function resetDebugFlags(): void {
  if (isProd) return;
  // Browser: clear window and localStorage
  if (typeof window !== 'undefined') {
    window.APP_DEBUG_FLAGS = {};
    window.localStorage?.removeItem('APP_DEBUG_FLAGS');
  }
  // Node/server: clear in-memory
  debugFlags = {};
} 