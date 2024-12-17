import { useState, useCallback, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from 'components/ui/dialog';
import { Button } from 'components/ui/button';
import { Alert, AlertDescription } from 'components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { COORDINATE_SYSTEMS } from '../../types/coordinates';
import { useGeoLoader } from '../../hooks/use-geo-loader';
import { GeoImportDialogProps, ImportState, LogEntry, LogType, ImportOptions } from './types';
import { PreviewSection } from './preview-section';
import { SettingsSection } from './settings-section';
import { LogsSection } from './logs-section';

export function GeoImportDialog({
  isOpen,
  onClose,
  file,
  onImportComplete,
}: GeoImportDialogProps) {
  const {
    loading,
    error: loaderError,
    analysis,
    options: loaderOptions,
    logs: loaderLogs,
    dxfData,
    setOptions,
    analyzeFile,
    loadFile,
    clearLogs,
  } = useGeoLoader();

  const [state, setState] = useState<ImportState>({
    logs: [],
    hasErrors: false,
    selectedLayers: [],
    visibleLayers: [],
    selectedTemplates: [],
  });

  // Create a derived options object that satisfies ImportOptions
  const options: ImportOptions = {
    ...loaderOptions,
    selectedLayers: state.selectedLayers,
    visibleLayers: state.visibleLayers,
    selectedTemplates: state.selectedTemplates,
  };

  // Use a ref to track the current file being analyzed
  const currentFileRef = useRef<File | null>(null);
  const processedLogsRef = useRef(new Set<string>());

  // Initialize visibleLayers with all available layers when dxfData changes
  useEffect(() => {
    if (dxfData?.tables?.layer?.layers) {
      const allLayers = Object.keys(dxfData.tables.layer.layers);
      setState(prev => ({
        ...prev,
        visibleLayers: allLayers
      }));
      setOptions(prev => ({
        ...prev,
        visibleLayers: allLayers
      }));
    }
  }, [dxfData, setOptions]);

  const addLogs = useCallback((newLogs: { message: string; type: LogType }[]) => {
    const timestamp = new Date();
    setState(prevState => {
      // Filter out logs we've already processed
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
    setState(prev => {
      const newLayers = enabled 
        ? [...prev.selectedLayers, layer]
        : prev.selectedLayers.filter(l => l !== layer);
      
      setOptions(opts => ({
        ...opts,
        selectedLayers: newLayers
      }));

      return {
        ...prev,
        selectedLayers: newLayers
      };
    });
  }, [setOptions]);

  const handleLayerVisibilityToggle = useCallback((layer: string, visible: boolean) => {
    setState(prev => {
      const newVisibleLayers = visible
        ? [...prev.visibleLayers, layer]
        : prev.visibleLayers.filter(l => l !== layer);
      
      setOptions(opts => ({
        ...opts,
        visibleLayers: newVisibleLayers
      }));

      return {
        ...prev,
        visibleLayers: newVisibleLayers
      };
    });
  }, [setOptions]);

  const handleTemplateSelect = useCallback((template: string, enabled: boolean) => {
    setState(prev => {
      const newTemplates = enabled
        ? [...prev.selectedTemplates, template]
        : prev.selectedTemplates.filter(t => t !== template);

      setOptions(opts => ({
        ...opts,
        selectedTemplates: newTemplates
      }));

      return {
        ...prev,
        selectedTemplates: newTemplates
      };
    });
  }, [setOptions]);

  const handleCoordinateSystemChange = useCallback((value: string) => {
    const coordinateSystem = Object.values(COORDINATE_SYSTEMS).includes(value as any)
      ? value as any
      : undefined;

    setOptions(prev => ({
      ...prev,
      coordinateSystem
    }));
  }, [setOptions]);

  // Handle loader logs
  useEffect(() => {
    if (loaderLogs.length > 0) {
      const newLogs = loaderLogs.map(message => ({
        message,
        type: message.toLowerCase().includes('error') ? 'error' as const :
              message.toLowerCase().includes('warn') ? 'warning' as const : 
              'info' as const
      }));
      addLogs(newLogs);
    }
  }, [loaderLogs, addLogs]);

  // Handle dialog open/close and file analysis
  useEffect(() => {
    if (isOpen) {
      // Only reset state and analyze if it's a new file
      if (file !== currentFileRef.current) {
        setState(prev => ({
          ...prev,
          logs: [],
          hasErrors: false,
          selectedLayers: [],
          visibleLayers: [],
          selectedTemplates: []
        }));
        processedLogsRef.current.clear();
        clearLogs();
        
        currentFileRef.current = file;
        if (file) {
          analyzeFile(file).catch(error => {
            addLogs([{
              message: `Analysis error: ${error.message}`,
              type: 'error'
            }]);
          });
        }
      }
    } else {
      currentFileRef.current = null;
    }
  }, [isOpen, file, clearLogs, analyzeFile, addLogs]);

  const handleImport = async () => {
    if (!file) return;

    try {
      const result = await loadFile(file);
      
      const importLogs: { message: string; type: LogType }[] = [];

      if (result.coordinateSystem) {
        if (result.coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
          importLogs.push({
            message: `Transformed coordinates from ${result.coordinateSystem} to ${COORDINATE_SYSTEMS.WGS84}`,
            type: 'info'
          });
        }
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

        if (result.statistics.failedTransformations) {
          importLogs.push({
            message: `Warning: ${result.statistics.failedTransformations} features failed coordinate transformation`,
            type: 'warning'
          });
        }

        if (result.statistics.errors) {
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
      if (!state.hasErrors && !result.statistics?.failedTransformations) {
        onClose();
      }
    } catch (error) {
      addLogs([{
        message: `Import error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error'
      }]);
    }
  };

  if (!file) return null;

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
            analysis={analysis}
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
            {analysis?.preview && (
              <PreviewSection
                preview={analysis.preview}
                bounds={analysis.bounds}
                coordinateSystem={options.coordinateSystem || analysis.coordinateSystem}
                visibleLayers={state.visibleLayers}
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
