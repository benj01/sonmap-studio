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

        if (result.preview) {
          if (Symbol.asyncIterator in result.preview) {
            // Stream features
            await previewManager.generatePreview(
              result.preview[Symbol.asyncIterator](),
              file.name
            );
          } else {
            // Fallback for non-streaming preview
            previewManager.setFeatures(result.preview);
          }
        }
      }

      setState(prev => ({
        loading: false,
        coordinateSystem: prev.pendingCoordinateSystem,
        pendingCoordinateSystem: prev.pendingCoordinateSystem
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
