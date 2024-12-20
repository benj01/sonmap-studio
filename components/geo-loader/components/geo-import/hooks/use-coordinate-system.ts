import { useState, useCallback, useEffect } from 'react';
import { CoordinateSystem, COORDINATE_SYSTEMS } from '../../../types/coordinates';
import { CoordinateSystemError, CoordinateTransformationError } from '../../../utils/errors';
import { AnalyzeResult, ProcessorOptions } from '../../../processors';
import { PreviewManager } from '../../../preview/preview-manager';
import { initializeCoordinateSystems, areCoordinateSystemsInitialized } from '../../../utils/coordinate-systems';

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
  initialized: boolean;
}

export function useCoordinateSystem({
  onWarning,
  onError,
  onProgress,
  getProcessor
}: CoordinateSystemHookProps) {
  const [state, setState] = useState<CoordinateSystemState>(() => {
    const isInitialized = areCoordinateSystemsInitialized();
    console.log('Initial coordinate system state:', { isInitialized });
    return {
      coordinateSystem: undefined,
      pendingCoordinateSystem: undefined,
      loading: false,
      initialized: isInitialized
    };
  });

  // Initialize coordinate systems immediately on mount
  useEffect(() => {
    const initializeSystems = async () => {
      console.log('Checking coordinate system initialization:', { 
        currentState: state.initialized,
        areSystemsInitialized: areCoordinateSystemsInitialized()
      });

      if (!state.initialized) {
        try {
          console.log('Attempting to initialize coordinate systems...');
          if (initializeCoordinateSystems()) {
            console.log('Coordinate systems initialized successfully');
            setState(prev => ({ ...prev, initialized: true }));
          }
        } catch (error) {
          console.error('Failed to initialize coordinate systems:', error);
          onError(`Failed to initialize coordinate systems: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    };
    initializeSystems();
  }, [state.initialized, onError]);

  const handleCoordinateSystemChange = useCallback((value: string) => {
    try {
      // Only update state if it's a valid coordinate system
      if (Object.values(COORDINATE_SYSTEMS).includes(value as CoordinateSystem)) {
        console.log('Changing coordinate system to:', value);
        setState(prev => ({
          ...prev,
          pendingCoordinateSystem: value as CoordinateSystem,
          coordinateSystem: value as CoordinateSystem // Update both to avoid needing to apply
        }));
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
        throw new CoordinateSystemError(
          'Failed to create processor'
        );
      }

      const result = await processor.analyze(file);

      // Update preview manager
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

        if (result.preview) {
          previewManager.setFeatures(result.preview);
        }
      }

      setState(prev => ({
        loading: false,
        coordinateSystem: prev.pendingCoordinateSystem,
        pendingCoordinateSystem: prev.pendingCoordinateSystem,
        initialized: true
      }));

      console.log('Successfully applied coordinate system');
      return result;
    } catch (error: unknown) {
      if (error instanceof CoordinateSystemError) {
        onError(`Coordinate system error: ${error.message}`);
      } else if (error instanceof CoordinateTransformationError) {
        onError(`Transformation error: ${error.message}`);
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
      loading: false,
      initialized: state.initialized
    });
  }, [state.initialized]);

  const initializeCoordinateSystem = useCallback((system?: CoordinateSystem) => {
    if (system && Object.values(COORDINATE_SYSTEMS).includes(system)) {
      console.log('Initializing coordinate system:', system);
      setState(prev => ({
        ...prev,
        coordinateSystem: system,
        pendingCoordinateSystem: system
      }));
    } else {
      console.log('Invalid coordinate system provided:', system);
    }
  }, []);

  // Log state changes
  useEffect(() => {
    console.log('Coordinate system state updated:', state);
  }, [state]);

  return {
    ...state,
    handleCoordinateSystemChange,
    applyCoordinateSystem,
    resetCoordinateSystem,
    initializeCoordinateSystem,
    hasChanges: state.pendingCoordinateSystem !== state.coordinateSystem
  };
}
