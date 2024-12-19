import { useState, useCallback, useRef, useMemo } from 'react';
import { ImportState, ImportOptions, LogType } from './types';
import { ErrorReporter, Severity, ErrorContext } from '../../utils/errors';
import { PreviewManager } from '../../preview/preview-manager';
import { AnalyzeResult, ProcessorOptions } from '../../processors';
import { CoordinateSystem, COORDINATE_SYSTEMS } from '../../types/coordinates';
import { createProcessor } from '../../processors';
import { convertWarnings, convertStatistics, PROGRESS_PHASES } from './utils';
import { Warning, Analysis } from '../../types/map';
import proj4 from 'proj4';

// Helper function to convert AnalyzeResult warnings to Analysis warnings
function convertToAnalysis(result: AnalyzeResult): Analysis {
  return {
    warnings: (result.warnings || []).map(w => ({
      type: w.type,
      message: w.message,
      entity: w.context?.entity as Warning['entity']
    }))
  };
}

export function useImport(parentErrorReporter: ErrorReporter) {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [dxfData, setDxfData] = useState<any | null>(null);
  const [state, setState] = useState<ImportState>({
    logs: [],
    hasErrors: false,
    selectedLayers: [],
    visibleLayers: [],
    selectedTemplates: [],
  });
  const [coordinateSystem, setCoordinateSystem] = useState<CoordinateSystem | undefined>(undefined);
  const [pendingCoordinateSystem, setPendingCoordinateSystem] = useState<CoordinateSystem | undefined>(undefined);
  const [currentPhase, setCurrentPhase] = useState<keyof typeof PROGRESS_PHASES | null>(null);

  // Preview manager instance
  const previewManagerRef = useRef<PreviewManager | null>(null);

  // For deduplicating logs
  const processedLogsRef = useRef(new Set<string>());
  // Track current file to re-analyze only when changed
  const currentFileRef = useRef<File | null>(null);

  const addLogs = useCallback((newLogs: { message: string; type: LogType }[]) => {
    const timestamp = new Date();
    setState((prevState: ImportState) => {
      const uniqueLogs = newLogs.filter(log => {
        const logId = `${log.type}:${log.message}`;
        if (processedLogsRef.current.has(logId)) {
          return false;
        }
        processedLogsRef.current.add(logId);
        return true;
      });

      if (uniqueLogs.length === 0) {
        return prevState;
      }

      const updatedLogs = [
        ...prevState.logs,
        ...uniqueLogs.map(log => ({
          ...log,
          timestamp,
          severity: log.type === 'error' ? Severity.ERROR : 
                    log.type === 'warning' ? Severity.WARNING : 
                    Severity.INFO
        }))
      ];

      const hasErrors = prevState.hasErrors || uniqueLogs.some(log => log.type === 'error');

      return {
        ...prevState,
        logs: updatedLogs,
        hasErrors
      };
    });

    // Forward logs to parent error reporter
    newLogs.forEach(log => {
      const context: ErrorContext = { timestamp };
      switch (log.type) {
        case 'error':
          parentErrorReporter.reportError('IMPORT_ERROR', log.message, context);
          break;
        case 'warning':
          parentErrorReporter.reportWarning('IMPORT_WARNING', log.message, context);
          break;
        case 'info':
          parentErrorReporter.reportInfo('IMPORT_INFO', log.message, context);
          break;
      }
    });
  }, [parentErrorReporter]);

  // Create a local error reporter that integrates with addLogs
  const localErrorReporter = useMemo<ErrorReporter>(() => ({
    reportError(type: string, message: string, context?: ErrorContext) {
      addLogs([{ message, type: 'error' }]);
      parentErrorReporter.reportError(type, message, context);
    },
    reportWarning(type: string, message: string, context?: ErrorContext) {
      addLogs([{ message, type: 'warning' }]);
      parentErrorReporter.reportWarning(type, message, context);
    },
    reportInfo(type: string, message: string, context?: ErrorContext) {
      addLogs([{ message, type: 'info' }]);
      parentErrorReporter.reportInfo(type, message, context);
    },
    getReports() {
      return state.logs.map(log => ({
        type: log.type.toUpperCase(),
        message: log.message,
        severity: log.severity,
        timestamp: log.timestamp,
        context: undefined
      }));
    },
    getErrors() {
      return this.getReports().filter(r => r.severity === Severity.ERROR);
    },
    getWarnings() {
      return this.getReports().filter(r => r.severity === Severity.WARNING);
    },
    hasErrors() {
      return state.hasErrors;
    },
    clear() {
      setState(prev => ({ ...prev, logs: [], hasErrors: false }));
      processedLogsRef.current.clear();
    }
  }), [addLogs, parentErrorReporter, state.logs, state.hasErrors]);

  // Processor callbacks for logging
  const onProgress = useCallback((progress: number) => {
    // Determine current phase based on progress
    let phase: keyof typeof PROGRESS_PHASES;
    if (progress <= PROGRESS_PHASES.PARSE.END) {
      phase = 'PARSE';
    } else if (progress <= PROGRESS_PHASES.ANALYZE.END) {
      phase = 'ANALYZE';
    } else {
      phase = 'CONVERT';
    }

    // Log phase transition if the phase has changed
    if (phase !== currentPhase) {
      setCurrentPhase(phase);
      // Add a unique suffix to ensure this log isn't deduplicated
      localErrorReporter.reportInfo('PROGRESS', 
        `Step: ${PROGRESS_PHASES[phase].description} (phase: ${phase}-${Date.now()})`
      );
    }

    // Log progress percentage
    localErrorReporter.reportInfo('PROGRESS', 
      `Progress: ${(progress * 100).toFixed(1)}%`
    );
  }, [localErrorReporter, currentPhase]);

  const handleLayerToggle = useCallback((layer: string, enabled: boolean) => {
    setState((prev: ImportState) => {
      const newLayers = enabled 
        ? [...prev.selectedLayers, layer]
        : prev.selectedLayers.filter((l: string) => l !== layer);

      return {
        ...prev,
        selectedLayers: newLayers
      };
    });
  }, []);

  const handleLayerVisibilityToggle = useCallback((layer: string, visible: boolean) => {
    setState((prev: ImportState) => {
      const newVisibleLayers = visible
        ? [...prev.visibleLayers, layer]
        : prev.visibleLayers.filter((l: string) => l !== layer);

      return {
        ...prev,
        visibleLayers: newVisibleLayers
      };
    });
  }, []);

  const handleTemplateSelect = useCallback((template: string, enabled: boolean) => {
    setState((prev: ImportState) => {
      const newTemplates = enabled
        ? [...prev.selectedTemplates, template]
        : prev.selectedTemplates.filter((t: string) => t !== template);

      return {
        ...prev,
        selectedTemplates: newTemplates
      };
    });
  }, []);

  const handleCoordinateSystemChange = useCallback((value: string) => {
    // Verify coordinate system is registered before setting
    if (!proj4.defs(value)) {
      localErrorReporter.reportError('COORDINATE_SYSTEM', `Cannot use coordinate system ${value}: not properly initialized`);
      return;
    }
    setPendingCoordinateSystem(value as CoordinateSystem);
  }, [localErrorReporter]);

  const handleApplyCoordinateSystem = useCallback(async (file: File) => {
    if (!pendingCoordinateSystem || !file || !analysis) return;

    setLoading(true);
    try {
      const processor = await createProcessor(file, {
        coordinateSystem: pendingCoordinateSystem,
        errorReporter: localErrorReporter,
        onProgress
      });

      if (!processor) {
        localErrorReporter.reportError('PROCESSOR', `No processor available for file: ${file.name}`);
        return;
      }

      const result = await processor.analyze(file);
      setAnalysis(result);
      setDxfData(result.dxfData);
      setCoordinateSystem(pendingCoordinateSystem);
      setPendingCoordinateSystem(undefined);

      // Update preview manager
      if (previewManagerRef.current && result.preview) {
        previewManagerRef.current.setOptions({
          maxFeatures: 5000,
          visibleLayers: state.visibleLayers,
          analysis: convertToAnalysis(result),
          errorReporter: localErrorReporter
        });
        previewManagerRef.current.setCoordinateSystem(pendingCoordinateSystem, proj4);
        previewManagerRef.current.setFeatures(result.preview);
      }

      localErrorReporter.reportInfo('COORDINATE_SYSTEM', `Applied coordinate system: ${pendingCoordinateSystem}`);
    } catch (error: unknown) {
      const err = error as Error;
      localErrorReporter.reportError(
        'COORDINATE_SYSTEM',
        `Failed to apply coordinate system: ${err.message}`,
        { error: err, pendingCoordinateSystem }
      );
    } finally {
      setLoading(false);
    }
  }, [pendingCoordinateSystem, analysis, onProgress, localErrorReporter, state.visibleLayers]);

  const handleImport = useCallback(async (file: File, onImportComplete: (result: any) => void, onClose: () => void) => {
    if (!file) return;

    // Verify coordinate system is properly initialized
    if (coordinateSystem && !proj4.defs(coordinateSystem)) {
      localErrorReporter.reportError(
        'COORDINATE_SYSTEM',
        `Cannot import with coordinate system ${coordinateSystem}: not properly initialized`,
        { coordinateSystem }
      );
      return;
    }

    setLoading(true);
    try {
      const processor = await createProcessor(file, {
        coordinateSystem,
        selectedLayers: state.selectedLayers,
        selectedTypes: state.selectedTemplates,
        errorReporter: localErrorReporter,
        onProgress
      });

      if (!processor) {
        localErrorReporter.reportError('PROCESSOR', `No processor available for file: ${file.name}`);
        return;
      }

      const processorResult = await processor.process(file);

      // Convert ProcessorResult to LoaderResult
      const result = {
        features: processorResult.features.features,
        bounds: processorResult.bounds,
        layers: processorResult.layers || [],
        coordinateSystem: processorResult.coordinateSystem as CoordinateSystem,
        statistics: convertStatistics(processorResult.statistics)
      };

      if (result.coordinateSystem && result.coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
        localErrorReporter.reportInfo('COORDINATE_SYSTEM', 
          `Transformed coordinates from ${result.coordinateSystem} to ${COORDINATE_SYSTEMS.WGS84}`
        );
      }

      if (result.statistics) {
        localErrorReporter.reportInfo('IMPORT', `Imported ${result.statistics.pointCount} features`);

        if (result.statistics.layerCount) {
          localErrorReporter.reportInfo('IMPORT', `Found ${result.statistics.layerCount} layers`);
        }

        Object.entries(result.statistics.featureTypes).forEach(([type, count]) => {
          localErrorReporter.reportInfo('IMPORT', `${count} ${type} features`);
        });

        if (result.statistics.failedTransformations && result.statistics.failedTransformations > 0) {
          localErrorReporter.reportWarning(
            'COORDINATE_SYSTEM',
            `${result.statistics.failedTransformations} features failed coordinate transformation`
          );
        }

        if (result.statistics.errors && result.statistics.errors.length > 0) {
          result.statistics.errors.forEach((error: { type: string; message?: string; count: number }) => {
            localErrorReporter.reportError(
              'IMPORT',
              error.message ?
                `${error.type}: ${error.message} (${error.count} occurrence${error.count > 1 ? 's' : ''})` :
                `${error.type}: ${error.count} occurrence${error.count > 1 ? 's' : ''}`,
              { errorType: error.type, count: error.count }
            );
          });
        }
      }

      try {
        await onImportComplete(result);
        if (!state.hasErrors && !(result.statistics?.failedTransformations)) {
          onClose();
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.message.includes('Duplicate')) {
          localErrorReporter.reportError(
            'IMPORT',
            'A file with this name already exists. Please delete the existing file first.',
            { error }
          );
        } else {
          throw error;
        }
      }
    } catch (error: unknown) {
      const err = error as Error;
      localErrorReporter.reportError(
        'IMPORT',
        'Import error',
        { error: err, file: file.name }
      );
    } finally {
      setLoading(false);
    }
  }, [coordinateSystem, onProgress, localErrorReporter, state.hasErrors, state.selectedLayers, state.selectedTemplates]);

  return {
    loading,
    analysis,
    dxfData,
    state,
    coordinateSystem,
    pendingCoordinateSystem,
    currentPhase,
    previewManagerRef,
    handleLayerToggle,
    handleLayerVisibilityToggle,
    handleTemplateSelect,
    handleCoordinateSystemChange,
    handleApplyCoordinateSystem,
    handleImport,
    localErrorReporter,
    setAnalysis,
    setDxfData,
    setCoordinateSystem,
    setPendingCoordinateSystem,
    setCurrentPhase,
    setState,
    currentFileRef,
    processedLogsRef,
    onProgress,
  };
}
