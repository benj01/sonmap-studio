import { useState, useCallback, useEffect } from 'react';
import { CoordinateSystem, COORDINATE_SYSTEMS } from '../../../types/coordinates';
import { GeoLoaderError } from '../../../core/errors/types';
import { AnalyzeResult } from '../../../core/processors/base/types';
import { ProcessorOptions } from '../../../core/processors/base/types';
import { PreviewManager } from '../../../preview/preview-manager';
import { coordinateSystemManager } from '../../../core/coordinate-system-manager';

interface CoordinateSystemHookProps {
  onWarning: (message: string) => void;
  onError: (message: string) => void;
  onProgress: (progress: number) => void;
  getProcessor: (file: File, options?: Partial<ProcessorOptions>) => Promise<any>;
}

interface CoordinateSystemState {
  coordinateSystem?: CoordinateSystem;
  pendingCoordinateSystem?: CoordinateSystem;
  loading: boolean;
}

export function useCoordinateSystem({
  onWarning,
  onError,
  onProgress,
  getProcessor
}: CoordinateSystemHookProps) {
  const [state, setState] = useState<CoordinateSystemState>({
    coordinateSystem: undefined,
    pendingCoordinateSystem: undefined,
    loading: false
  });

  // Initialize coordinate system manager on mount
  useEffect(() => {
    const initializeManager = async () => {
      if (!coordinateSystemManager.isInitialized()) {
        try {
          await coordinateSystemManager.initialize();
        } catch (error) {
          console.error('Failed to initialize coordinate system manager:', error);
          onError(`Failed to initialize coordinate systems: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    };
    initializeManager();
  }, [onError]);

  const handleCoordinateSystemChange = useCallback((value: string) => {
    try {
      // Only update pending state if it's a valid coordinate system
      if (Object.values(COORDINATE_SYSTEMS).includes(value as CoordinateSystem)) {
        console.log('Setting pending coordinate system to:', value);
        setState(prev => ({
          ...prev,
          pendingCoordinateSystem: value as CoordinateSystem
        }));
      } else {
        console.warn('Invalid coordinate system:', value);
      }
    } catch (error: unknown) {
      console.warn('Coordinate system validation error:', error instanceof Error ? error.message : String(error));
    }
  }, []);

  const applyCoordinateSystem = useCallback(async (
    file: File,
    analysis: AnalyzeResult | null,
    previewManager: PreviewManager | null
  ) => {
    if (!state.pendingCoordinateSystem || !file || !analysis) {
      console.log('Cannot apply coordinate system:', {
        hasPendingSystem: !!state.pendingCoordinateSystem,
        hasFile: !!file,
        hasAnalysis: !!analysis
      });
      return;
    }

    // Prevent multiple concurrent applications
    if (state.loading) {
      console.log('Coordinate system application already in progress');
      return;
    }

    setState(prev => ({ ...prev, loading: true }));
    try {
      console.log('Applying coordinate system:', state.pendingCoordinateSystem);
      const processor = await getProcessor(file, {
        coordinateSystem: state.pendingCoordinateSystem
      });

      if (!processor) {
        throw new GeoLoaderError(
          'Failed to create processor',
          'PROCESSOR_CREATION_ERROR'
        );
      }

      const result = await processor.analyze(file);

      // Update preview manager with streaming support
      if (previewManager) {
        previewManager.setOptions({
          coordinateSystem: state.pendingCoordinateSystem,
          analysis: {
            warnings: processor.getWarnings().map((message: string) => ({
              type: 'warning' as const,
              message
            }))
          }
        });

        // Update preview with new features
        if (result.preview) {
          await previewManager.setFeatures(result.preview);
          console.debug('[DEBUG] Updated preview features with new coordinate system:', {
            system: state.pendingCoordinateSystem,
            featureCount: result.preview.features?.length ?? 0
          });
        }
      }

      // Only update coordinateSystem after successful application
      setState(prev => ({
        loading: false,
        coordinateSystem: prev.pendingCoordinateSystem,
        pendingCoordinateSystem: undefined // Clear pending state
      }));

      console.log('Successfully applied coordinate system');
      return result;
    } catch (error: unknown) {
      if (error instanceof GeoLoaderError) {
        onError(`Coordinate system error: ${error.message}`);
      } else {
        onError(`Failed to apply coordinate system: ${error instanceof Error ? error.message : String(error)}`);
      }
      setState(prev => ({ ...prev, loading: false }));
      return null;
    }
  }, [state.pendingCoordinateSystem, state.loading, getProcessor, onError]);

  const resetCoordinateSystem = useCallback(() => {
    console.log('Resetting coordinate system state');
    setState({
      coordinateSystem: undefined,
      pendingCoordinateSystem: undefined,
      loading: false
    });
  }, []);

  const initializeCoordinateSystem = useCallback(async (system?: CoordinateSystem) => {
    if (system && Object.values(COORDINATE_SYSTEMS).includes(system)) {
      console.debug('[DEBUG] Initializing coordinate system:', system);
      
      // First validate the system with the manager
      if (!coordinateSystemManager.isInitialized()) {
        await coordinateSystemManager.initialize();
      }
      
      const supported = coordinateSystemManager.getSupportedSystems().includes(system);
      if (!supported) {
        console.warn('[DEBUG] Detected system not supported:', system);
        onWarning(`Detected coordinate system ${system} is not supported, using WGS84`);
        system = COORDINATE_SYSTEMS.WGS84;
      }

      // Set both current and pending to ensure immediate effect
      setState(prev => ({
        ...prev,
        coordinateSystem: system,
        pendingCoordinateSystem: system,
        loading: false
      }));

      console.debug('[DEBUG] Coordinate system initialized:', {
        system,
        supported,
        manager: 'initialized'
      });
    } else {
      console.warn('[DEBUG] Invalid coordinate system provided:', system);
      onWarning('Invalid coordinate system detected, using WGS84');
      setState(prev => ({
        ...prev,
        coordinateSystem: COORDINATE_SYSTEMS.WGS84,
        pendingCoordinateSystem: COORDINATE_SYSTEMS.WGS84,
        loading: false
      }));
    }
  }, [onWarning]);

  // Only log in development
  if (process.env.NODE_ENV === 'development') {
    useEffect(() => {
      console.debug('Coordinate system state:', state);
    }, [state]);
  }

  return {
    ...state,
    handleCoordinateSystemChange,
    applyCoordinateSystem,
    resetCoordinateSystem,
    initializeCoordinateSystem,
    hasChanges: state.pendingCoordinateSystem !== state.coordinateSystem
  };
}
