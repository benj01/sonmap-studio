'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback, useRef } from 'react';
import * as Cesium from 'cesium';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'CesiumContext';
const logManager = LogManager.getInstance();

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
  const [viewer, setViewerState] = useState<Cesium.Viewer | null>(null);
  const [isInitialized, setIsInitializedState] = useState(false);
  const mountCount = useRef(0);
  const renderCount = useRef(0);
  const isUnmounting = useRef(false);

  // Track render cycles
  renderCount.current++;
  logger.info('CesiumContext: Render', {
    renderCount: renderCount.current,
    mountCount: mountCount.current,
    hasViewer: !!viewer,
    isInitialized,
    timestamp: new Date().toISOString()
  });

  // Memoize the setter functions to ensure stable references
  const setViewer = useCallback((newViewer: Cesium.Viewer | null) => {
    if (isUnmounting.current) {
      logger.warn('CesiumContext: Ignoring setViewer during unmount');
      return;
    }
    logger.info('CesiumContext: Setting viewer', {
      hasNewViewer: !!newViewer,
      hasPreviousViewer: !!viewer,
      timestamp: new Date().toISOString()
    });
    setViewerState(newViewer);
  }, [viewer]);

  const setInitialized = useCallback((initialized: boolean) => {
    if (isUnmounting.current) {
      logger.warn('CesiumContext: Ignoring setInitialized during unmount');
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
    viewer,
    isInitialized,
    setViewer,
    setInitialized
  }), [viewer, isInitialized, setViewer, setInitialized]);

  // Log provider lifecycle
  useEffect(() => {
    mountCount.current++;
    isUnmounting.current = false;
    logger.info('CesiumContext: Provider mounted', {
      mountCount: mountCount.current,
      renderCount: renderCount.current,
      hasViewer: !!viewer,
      isInitialized,
      timestamp: new Date().toISOString()
    });
    
    return () => {
      isUnmounting.current = true;
      logger.info('CesiumContext: Provider unmounting', {
        mountCount: mountCount.current,
        renderCount: renderCount.current,
        hasViewer: !!viewer,
        isInitialized,
        timestamp: new Date().toISOString()
      });
      
      // Only destroy the viewer if this is the final unmount
      if (viewer && !viewer.isDestroyed() && mountCount.current > 1) {
        logger.info('CesiumContext: Destroying Cesium viewer on provider unmount');
        viewer.destroy();
      }
      setIsInitializedState(false);
    };
  }, [viewer, isInitialized]);

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