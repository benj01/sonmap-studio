import { useEffect, useRef, memo, useCallback } from 'react';
import { LogManager } from '@/core/logging/log-manager';
import { useLayers } from '@/store/layers/hooks';
import { useVerificationQueue } from '@/store/verification/hooks';
import { useMapInstance } from '@/store/map/hooks';
import { useComponentMigration } from '@/store/migration/hooks';
import { useLayerStatus } from '@/store/layers/hooks';
import type { Layer } from '@/store/layers/types';

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

  // New store hooks
  const { layers } = useLayers();
  const { addToPending, removeFromPending, addToInProgress, removeFromInProgress } = useVerificationQueue();
  const { mapboxInstance } = useMapInstance();
  const { updateComponentProgress } = useComponentMigration('LayerVerification');

  const verifyLayer = useCallback((layerId: string) => {
    if (!mapboxInstance) return false;

    try {
      const layer = layers.find(l => l.id === layerId);
      if (!layer) return false;

      const hasLayer = !!mapboxInstance.getLayer(layerId);
      const hasSource = !layer.sourceId || !!mapboxInstance.getSource(layer.sourceId);

      return hasLayer && hasSource;
    } catch (error) {
      logger.debug('Error verifying layer', { error, layerId });
      return false;
    }
  }, [mapboxInstance, layers]);

  const verifyLayers = useCallback(() => {
    // Prevent too frequent verifications
    const now = Date.now();
    if (now - lastVerification.current < 1000) return;
    
    if (verificationInProgress.current) return;
    verificationInProgress.current = true;
    lastVerification.current = now;
    
    try {
      // Get all layers that need verification
      const layersToVerify = layers
        .filter(layer => layer.setupStatus === 'complete')
        .map(layer => layer.id);

      // Process each layer
      layersToVerify.forEach(layerId => {
        // Add to pending queue
        addToPending(layerId);
        
        // Verify the layer
        const isValid = verifyLayer(layerId);
        
        // Update layer status
        const { updateStatus } = useLayerStatus(layerId);
        if (isValid) {
          updateStatus('complete');
        } else {
          updateStatus('error', 'Layer verification failed');
        }
        
        // Remove from pending queue
        removeFromPending(layerId);
      });
    } finally {
      verificationInProgress.current = false;
    }
  }, [
    layers,
    verifyLayer,
    addToPending,
    removeFromPending
  ]);
  
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

  // Update migration progress
  useEffect(() => {
    if (mapInitialized) {
      updateComponentProgress(100);
    }
  }, [mapInitialized, updateComponentProgress]);
  
  return null;
}); 