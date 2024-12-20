import { useState, useCallback } from 'react';
import { CoordinateSystem, COORDINATE_SYSTEMS } from '../../../types/coordinates';
import { CoordinateSystemError, TransformationError } from '../../../utils/coordinate-systems';
import { AnalyzeResult, ProcessorOptions, createProcessor } from '../../../processors';
import { PreviewManager } from '../../../preview/preview-manager';
import { Warning, Analysis } from '../../../types/map';

interface CoordinateSystemHookProps {
  onWarning: (message: string) => void;
  onError: (message: string) => void;
  onProgress: (progress: number) => void;
}

interface CoordinateSystemState {
  coordinateSystem?: CoordinateSystem;
  pendingCoordinateSystem?: CoordinateSystem;
  loading: boolean;
}

function convertWarningsToAnalysis(warnings: string[] = []): Analysis {
  return {
    warnings: warnings.map(message => ({
      type: 'warning',
      message
    }))
  };
}

export function useCoordinateSystem({
  onWarning,
  onError,
  onProgress
}: CoordinateSystemHookProps) {
  const [state, setState] = useState<CoordinateSystemState>({
    coordinateSystem: undefined,
    pendingCoordinateSystem: undefined,
    loading: false
  });

  const handleCoordinateSystemChange = useCallback((value: string) => {
    // Validate coordinate system
    if (!Object.values(COORDINATE_SYSTEMS).includes(value as CoordinateSystem)) {
      onError(`Invalid coordinate system: ${value}`);
      return;
    }
    setState(prev => ({
      ...prev,
      pendingCoordinateSystem: value as CoordinateSystem
    }));
  }, [onError]);

  const applyCoordinateSystem = useCallback(async (
    file: File,
    analysis: AnalyzeResult | null,
    previewManager: PreviewManager | null
  ) => {
    if (!state.pendingCoordinateSystem || !file || !analysis) return;

    setState(prev => ({ ...prev, loading: true }));
    try {
      const processor = await createProcessor(file, {
        onWarning,
        onError,
        onProgress,
        coordinateSystem: state.pendingCoordinateSystem
      } as ProcessorOptions);

      if (!processor) {
        throw new Error(`No processor available for file: ${file.name}`);
      }

      const result = await processor.analyze(file);

      // Convert warnings to Analysis format
      const analysisWithWarnings = convertWarningsToAnalysis(result.warnings);

      // Update preview manager
      if (previewManager && result.preview) {
        previewManager.setOptions({
          coordinateSystem: state.pendingCoordinateSystem,
          analysis: analysisWithWarnings
        });
        previewManager.setFeatures(result.preview);
      }

      setState(prev => ({
        ...prev,
        loading: false,
        coordinateSystem: prev.pendingCoordinateSystem,
        pendingCoordinateSystem: undefined
      }));

      return result;
    } catch (error) {
      if (error instanceof CoordinateSystemError) {
        onError(`Coordinate system error: ${error.message}`);
      } else if (error instanceof TransformationError) {
        onError(`Transformation error: ${error.message}`);
      } else {
        onError(`Failed to apply coordinate system: ${error instanceof Error ? error.message : String(error)}`);
      }
      setState(prev => ({ ...prev, loading: false }));
      return null;
    }
  }, [state.pendingCoordinateSystem, onWarning, onError, onProgress]);

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
