'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback, useRef } from 'react';
import * as Cesium from 'cesium';
import { LogManager, LogLevel } from '@/core/logging/log-manager';

const SOURCE = 'CesiumContext';
const logManager = LogManager.getInstance();

// Configure logging for CesiumContext
logManager.setComponentLogLevel(SOURCE, LogLevel.INFO);

const logger = {
  info: (message: string, data?: any) => {
    logManager.info(SOURCE, message, data);
  },
  warn: (message: string, error?: any) => {
    logManager.warn(SOURCE, message, error);
  },
  error: (message: string, error?: any) => {
    logManager.error(SOURCE, message, error);
  },
  debug: (message: string, data?: any) => {
    logManager.debug(SOURCE, message, data);
  }
};

// Define the context shape
interface CesiumContextType {
  viewer: Cesium.Viewer | null;
  isInitialized: boolean;
  setViewer: (viewer: Cesium.Viewer | null) => void;
  setInitialized: (initialized: boolean) => void;
}

// Create the context with default values
const CesiumContext = createContext<CesiumContextType>({
  viewer: null,
  isInitialized: false,
  setViewer: () => {},
  setInitialized: () => {},
});

interface CesiumProviderProps {
  children: ReactNode;
}

export function CesiumProvider({ children }: CesiumProviderProps) {
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const [isInitialized, setIsInitializedState] = useState(false);
  const isMountedRef = useRef(false);
  const mountCountRef = useRef(0);
  const renderCountRef = useRef(0);

  // Track render cycles
  renderCountRef.current++;
  logger.info('CesiumContext: Render', {
    renderCount: renderCountRef.current,
    mountCount: mountCountRef.current,
    hasViewer: !!viewerRef.current,
    isInitialized,
    timestamp: new Date().toISOString()
  });

  // Memoize the setter functions to ensure stable references
  const setViewer = useCallback((newViewer: Cesium.Viewer | null) => {
    if (!isMountedRef.current) {
      logger.debug('CesiumContext: Ignoring setViewer during unmount');
      return;
    }
    logger.info('CesiumContext: Setting viewer', {
      hasNewViewer: !!newViewer,
      hasPreviousViewer: !!viewerRef.current,
      timestamp: new Date().toISOString()
    });
    viewerRef.current = newViewer;
  }, []);

  const setInitialized = useCallback((initialized: boolean) => {
    if (!isMountedRef.current) {
      logger.debug('CesiumContext: Ignoring setInitialized during unmount');
      return;
    }
    logger.info('CesiumContext: Setting initialization state', {
      newState: initialized,
      previousState: isInitialized,
      timestamp: new Date().toISOString()
    });
    setIsInitializedState(initialized);
  }, [isInitialized]);

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    viewer: viewerRef.current,
    isInitialized,
    setViewer,
    setInitialized
  }), [isInitialized, setViewer, setInitialized]);

  // Log provider lifecycle
  useEffect(() => {
    mountCountRef.current++;
    isMountedRef.current = true;
    logger.info('CesiumContext: Provider mounted', {
      mountCount: mountCountRef.current,
      renderCount: renderCountRef.current,
      hasViewer: !!viewerRef.current,
      isInitialized,
      timestamp: new Date().toISOString()
    });
    
    return () => {
      isMountedRef.current = false;
      logger.info('CesiumContext: Provider unmounting', {
        mountCount: mountCountRef.current,
        renderCount: renderCountRef.current,
        hasViewer: !!viewerRef.current,
        isInitialized,
        timestamp: new Date().toISOString()
      });
      
      // Use queueMicrotask to ensure this runs after potential remount effects
      queueMicrotask(() => {
        // Only destroy if we're still unmounted (not a Strict Mode remount)
        // and if we have a viewer instance
        if (!isMountedRef.current && viewerRef.current && !viewerRef.current.isDestroyed()) {
          logger.info('CesiumContext: Destroying Cesium viewer on final unmount');
          try {
            viewerRef.current.destroy();
            viewerRef.current = null;
          } catch (error) {
            logger.error('CesiumContext: Error destroying viewer', { error });
          }
        } else {
          logger.debug('CesiumContext: Skipping viewer destruction', {
            isMounted: isMountedRef.current,
            hasViewer: !!viewerRef.current,
            isDestroyed: viewerRef.current?.isDestroyed()
          });
        }
      });
    };
  }, []); // Empty dependency array - only run on mount/unmount

  return (
    <CesiumContext.Provider value={contextValue}>
      {children}
    </CesiumContext.Provider>
  );
}

// Custom hook for using the Cesium context
export function useCesium() {
  const context = useContext(CesiumContext);
  if (context === undefined) {
    throw new Error('useCesium must be used within a CesiumProvider');
  }
  return context;
} 