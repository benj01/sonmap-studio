import { useState, useCallback } from 'react';
import { CoordinateSystem, COORDINATE_SYSTEMS } from '../../../types/coordinates';
import { CoordinateSystemError, CoordinateTransformationError } from '../../../utils/errors';
import { AnalyzeResult, ProcessorOptions } from '../../../processors';
import { PreviewManager } from '../../../preview/preview-manager';
import { initializeCoordinateSystems } from '../../../utils/coordinate-systems';

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

  const handleCoordinateSystemChange = useCallback((value: string) => {
    try {
      // Only update state if it's a valid coordinate system
      if (Object.values(COORDINATE_SYSTEMS).includes(value as CoordinateSystem)) {
        setState(prev => ({
          ...prev,
          pendingCoordinateSystem: value as CoordinateSystem
        }));
      }
    } catch (error: unknown) {
      // Silently ignore validation errors to prevent re-render loops
      console.warn('Coordinate system validation error:', error instanceof Error ? error.message : String(error));
    }
  }, []);

  const applyCoordinateSystem = useCallback(async (
    file: File,
    analysis: AnalyzeResult | null,
    previewManager: PreviewManager | null
  ) => {
    if (!state.pendingCoordinateSystem || !file || !analysis) return;

    // Prevent multiple concurrent applications
    if (state.loading) return;

    setState(prev => ({ ...prev, loading: true }));
    try {
      // Ensure coordinate systems are initialized
      try {
        if (!initializeCoordinateSystems()) {
          throw new CoordinateSystemError('Failed to initialize coordinate systems');
        }
      } catch (error) {
        if (error instanceof CoordinateSystemError) {
          throw error;
        }
        throw new CoordinateSystemError(
          `Failed to initialize coordinate systems: ${error instanceof Error ? error.message : String(error)}`
        );
      }

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
        pendingCoordinateSystem: undefined
      }));

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
    setState({
      coordinateSystem: undefined,
      pendingCoordinateSystem: undefined,
      loading: false
    });
  }, []);

  const initializeCoordinateSystem = useCallback((system?: CoordinateSystem) => {
    if (system && Object.values(COORDINATE_SYSTEMS).includes(system)) {
      setState(prev => ({
        ...prev,
        coordinateSystem: system,
        pendingCoordinateSystem: system
      }));
    }
  }, []);

  return {
    ...state,
    handleCoordinateSystemChange,
    applyCoordinateSystem,
    resetCoordinateSystem,
    initializeCoordinateSystem,
    hasChanges: state.pendingCoordinateSystem !== state.coordinateSystem
  };
}
