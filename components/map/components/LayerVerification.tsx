import { useEffect, useRef, memo, useCallback } from 'react';
import { dbLogger } from '@/utils/logging/dbLogger';
import { useLayers } from '@/store/layers/hooks';
import { useVerificationQueue } from '@/store/verification/hooks';
import { useMapInstance } from '@/store/map/hooks';
import { useLayerStore } from '@/store/layers/layerStore';

interface LayerVerificationProps {
  mapInitialized: boolean;
}

// Type guard for _layerId
function hasLayerId(obj: unknown, layerId: string): boolean {
  return typeof obj === 'object' && obj !== null && '_layerId' in obj && (obj as { _layerId: string })._layerId === layerId;
}

export const LayerVerification = memo(function LayerVerification({ mapInitialized }: LayerVerificationProps) {
  const verificationInProgress = useRef(false);
  const lastVerification = useRef<number>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // New store hooks
  const { layers } = useLayers();
  const { addToPending, removeFromPending } = useVerificationQueue();
  const { cesiumInstance } = useMapInstance();

  const verifyLayer = useCallback((layerId: string) => {
    if (!cesiumInstance) return false;

    try {
      const layer = layers.find(l => l.id === layerId);
      if (!layer) return false;

      // Cesium-specific: check DataSource, Primitive, or ImageryLayer with matching layerId
      // Only Viewer has these properties
      if (
        'dataSources' in cesiumInstance &&
        'scene' in cesiumInstance &&
        'imageryLayers' in cesiumInstance
      ) {
        const hasLayer =
          // DataSource
          Array.from({ length: cesiumInstance.dataSources.length })
            .some((_, i) => cesiumInstance.dataSources.get(i)?.name === layerId) ||
          // Primitive
          Array.from({ length: cesiumInstance.scene.primitives.length })
            .some((_, i) => hasLayerId(cesiumInstance.scene.primitives.get(i), layerId)) ||
          // ImageryLayer
          Array.from({ length: cesiumInstance.imageryLayers.length })
            .some((_, i) => hasLayerId(cesiumInstance.imageryLayers.get(i), layerId));

        const hasSource = hasLayer; // For Cesium, if the layer is present, the source is present.

        return hasLayer && hasSource;
      } else {
        return false;
      }
    } catch (error) {
      void dbLogger.debug('Error verifying layer', { error, layerId }).catch(() => {});
      return false;
    }
  }, [cesiumInstance, layers]);

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
        
        // Update layer status using store action (no hook violation)
        if (isValid) {
          useLayerStore.getState().updateLayerStatus(layerId, 'complete');
        } else {
          useLayerStore.getState().updateLayerStatus(layerId, 'error', 'Layer verification failed');
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
  
  return null;
}); 