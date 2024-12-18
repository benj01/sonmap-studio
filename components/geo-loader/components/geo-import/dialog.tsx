import { useState, useCallback, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from 'components/ui/dialog';
import { Button } from 'components/ui/button';
import { Alert, AlertDescription } from 'components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../../types/coordinates';
import { GeoImportDialogProps, ImportState, LogType, ImportOptions } from './types';
import { PreviewSection } from './preview-section';
import { SettingsSection } from './settings-section';
import { LogsSection } from './logs-section';
import { createProcessor } from '../../processors/base-processor';
import { ProcessorResult, AnalyzeResult, ProcessorOptions, ProcessorStats } from '../../processors/base-processor';
import { createPreviewManager, PreviewManager } from '../../preview/preview-manager';
import { LoaderResult, GeoFeature } from 'types/geo';

// Convert processor warnings to Analysis warnings format
const convertWarnings = (warnings: string[] = []): { type: string; message: string }[] => {
  return warnings.map(warning => ({
    type: 'warning',
    message: warning
  }));
};

// Convert ProcessorStats to LoaderResult statistics format
const convertStatistics = (stats: ProcessorStats) => {
  return {
    pointCount: stats.featureCount,
    layerCount: stats.layerCount,
    featureTypes: stats.featureTypes,
    failedTransformations: stats.failedTransformations,
    errors: stats.errors
  };
};

export function GeoImportDialog({
  isOpen,
  onClose,
  file,
  onImportComplete,
}: GeoImportDialogProps) {
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
          timestamp
        }))
      ];

      const hasErrors = prevState.hasErrors || uniqueLogs.some(log => log.type === 'error');

      return {
        ...prevState,
        logs: updatedLogs,
        hasErrors
      };
    });
  }, []);

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
    setCoordinateSystem(value as CoordinateSystem);
  }, []);

  // Processor callbacks for logging
  const onWarning = useCallback((message: string) => {
    addLogs([{ message, type: 'warning' }]);
  }, [addLogs]);

  const onError = useCallback((message: string) => {
    addLogs([{ message, type: 'error' }]);
  }, [addLogs]);

  const onProgress = useCallback((progress: number) => {
    addLogs([{ message: `Progress: ${(progress * 100).toFixed(1)}%`, type: 'info' }]);
  }, [addLogs]);

  // Handle dialog open/close and file analysis
  useEffect(() => {
    if (isOpen && file) {
      if (
        currentFileRef.current &&
        currentFileRef.current.name === file.name &&
        currentFileRef.current.size === file.size &&
        currentFileRef.current.lastModified === file.lastModified &&
        analysis
      ) {
        // Same file, already analyzed
        return;
      }

      // New file, reset state
      setState({
        logs: [],
        hasErrors: false,
        selectedLayers: [],
        visibleLayers: [],
        selectedTemplates: [],
      });
      processedLogsRef.current.clear();
      setAnalysis(null);
      setDxfData(null);

      currentFileRef.current = file;
      setLoading(true);

      const doAnalyze = async () => {
        try {
          const processor = await createProcessor(file, {
            onWarning,
            onError,
            onProgress,
          } as ProcessorOptions);

          if (!processor) {
            onError(`No processor available for file: ${file.name}`);
            return;
          }

          const result = await processor.analyze(file);
          setAnalysis(result);

          // Initialize layers
          const layers = result.layers || [];
          setState(prev => ({
            ...prev,
            selectedLayers: layers,
            visibleLayers: layers
          }));

          // Initialize coordinate system
          if (result.coordinateSystem) {
            setCoordinateSystem(result.coordinateSystem as CoordinateSystem);
          }

          // Initialize preview manager
          previewManagerRef.current = createPreviewManager({
            maxFeatures: 5000,
            visibleLayers: layers,
            analysis: {
              ...result,
              warnings: convertWarnings(result.warnings)
            }
          });
          if (result.preview) {
            previewManagerRef.current.setFeatures(result.preview);
          }

        } catch (err) {
          const error = err as Error;
          onError(`Analysis error: ${error.message}`);
        } finally {
          setLoading(false);
        }
      };
      doAnalyze();
    } else if (!isOpen) {
      currentFileRef.current = null;
    }
  }, [isOpen, file, analysis, onError, onProgress, onWarning]);

  const handleImport = async () => {
    if (!file) return;

    setLoading(true);
    try {
      const processor = await createProcessor(file, {
        onWarning,
        onError,
        onProgress,
        coordinateSystem,
        selectedLayers: state.selectedLayers,
        selectedTypes: state.selectedTemplates
      } as ProcessorOptions);

      if (!processor) {
        onError(`No processor available for file: ${file.name}`);
        return;
      }

      const processorResult = await processor.process(file);

      // Convert ProcessorResult to LoaderResult
      const result: LoaderResult = {
        features: processorResult.features.features as GeoFeature[],
        bounds: processorResult.bounds,
        layers: processorResult.layers || [],
        coordinateSystem: processorResult.coordinateSystem as CoordinateSystem,
        statistics: convertStatistics(processorResult.statistics)
      };

      const importLogs: { message: string; type: LogType }[] = [];
      if (result.coordinateSystem && result.coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
        importLogs.push({
          message: `Transformed coordinates from ${result.coordinateSystem} to ${COORDINATE_SYSTEMS.WGS84}`,
          type: 'info'
        });
      }

      if (result.statistics) {
        importLogs.push({
          message: `Imported ${result.statistics.pointCount} features`,
          type: 'info'
        });

        if (result.statistics.layerCount) {
          importLogs.push({
            message: `Found ${result.statistics.layerCount} layers`,
            type: 'info'
          });
        }

        Object.entries(result.statistics.featureTypes).forEach(([type, count]) => {
          importLogs.push({
            message: `- ${count} ${type} features`,
            type: 'info'
          });
        });

        if (result.statistics.failedTransformations && result.statistics.failedTransformations > 0) {
          importLogs.push({
            message: `Warning: ${result.statistics.failedTransformations} features failed coordinate transformation`,
            type: 'warning'
          });
        }

        if (result.statistics.errors && result.statistics.errors.length > 0) {
          result.statistics.errors.forEach(error => {
            importLogs.push({
              message: error.message ?
                `${error.type}: ${error.message} (${error.count} occurrence${error.count > 1 ? 's' : ''})` :
                `${error.type}: ${error.count} occurrence${error.count > 1 ? 's' : ''}`,
              type: 'error'
            });
          });
        }
      }

      addLogs(importLogs);

      onImportComplete(result);
      if (!state.hasErrors && !(result.statistics?.failedTransformations)) {
        onClose();
      }
    } catch (error) {
      const err = error as Error;
      addLogs([{
        message: `Import error: ${err.message}`,
        type: 'error'
      }]);
    } finally {
      setLoading(false);
    }
  };

  if (!file) return null;

  const options: ImportOptions = {
    selectedLayers: state.selectedLayers,
    visibleLayers: state.visibleLayers,
    selectedTemplates: state.selectedTemplates,
    coordinateSystem
  };

  const previewAvailable = analysis && previewManagerRef.current?.hasVisibleFeatures();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-lg">Import {file.name}</DialogTitle>
          <div className="flex items-center gap-2">
            {state.hasErrors && (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Errors occurred during import. Check logs below for more information.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          {/* Left side: Settings */}
          <SettingsSection
            file={file}
            dxfData={dxfData || undefined}
            analysis={analysis || undefined}
            options={options}
            selectedLayers={state.selectedLayers}
            visibleLayers={state.visibleLayers}
            selectedTemplates={state.selectedTemplates}
            onLayerToggle={handleLayerToggle}
            onLayerVisibilityToggle={handleLayerVisibilityToggle}
            onTemplateSelect={handleTemplateSelect}
            onCoordinateSystemChange={handleCoordinateSystemChange}
          />

          {/* Right side: Preview and Logs */}
          <div className="space-y-4">
            {/* Preview Map */}
            {previewAvailable && analysis?.bounds && previewManagerRef.current && (
              <PreviewSection
                previewManager={previewManagerRef.current}
                bounds={analysis.bounds}
                coordinateSystem={options.coordinateSystem || analysis.coordinateSystem}
                visibleLayers={state.visibleLayers}
                analysis={{
                  ...analysis,
                  warnings: convertWarnings(analysis.warnings)
                }}
              />
            )}

            {/* Logs */}
            <LogsSection
              logs={state.logs}
              loading={loading}
              hasErrors={state.hasErrors}
              onClearAndClose={() => {
                setState(prev => ({
                  ...prev,
                  logs: [],
                  hasErrors: false
                }));
                onClose();
              }}
            />
          </div>
        </div>

        {/* Import/Cancel Buttons */}
        <div className="flex justify-end space-x-2 mt-4 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={loading || state.hasErrors}
          >
            {loading ? 'Importing...' : 'Import'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
