import { useEffect, useRef, memo, useCallback } from 'react';
import { useMapLayers } from '@/store/mapStore';
import { LogManager } from '@/core/logging/log-manager';
import type { LayerState } from '@/store/mapStore';

const SOURCE = 'LayerVerification';
const logManager = LogManager.getInstance();

const logger = {
  debug: (message: string, data?: any) => {
    logManager.debug(SOURCE, message, data);
  }
};

interface LayerVerificationProps {
  mapInitialized: boolean;
}

export const LayerVerification = memo(function LayerVerification({ mapInitialized }: LayerVerificationProps) {
  const verificationInProgress = useRef(false);
  const lastVerification = useRef<number>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const { layers, verifyLayer, updateLayerStatus } = useMapLayers();
  
  const verifyLayers = useCallback(() => {
    // Prevent too frequent verifications
    const now = Date.now();
    if (now - lastVerification.current < 1000) return;
    
    if (verificationInProgress.current) return;
    verificationInProgress.current = true;
    lastVerification.current = now;
    
    try {
      layers.forEach((layer: LayerState, layerId: string) => {
        if (layer.setupStatus === 'complete' && !verifyLayer(layerId)) {
          updateLayerStatus(layerId, 'error', 'Layer verification failed');
        }
      });
    } finally {
      verificationInProgress.current = false;
    }
  }, [layers, verifyLayer, updateLayerStatus]);
  
  useEffect(() => {
    if (!mapInitialized || verificationInProgress.current) return;
    
    // Clear any existing timers
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    
    // Initial verification after a delay
    timeoutRef.current = setTimeout(verifyLayers, 1000);
    
    // Periodic verification
    intervalRef.current = setInterval(verifyLayers, 30000);
    
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      verificationInProgress.current = false;
    };
  }, [mapInitialized, verifyLayers]);
  
  return null;
}); 