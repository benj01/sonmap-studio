import { useState, useCallback, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from 'components/ui/dialog'
import { Button } from 'components/ui/button'
import { ScrollArea } from 'components/ui/scroll-area'
import { Alert, AlertDescription } from 'components/ui/alert'
import { LoaderResult } from 'types/geo'
import { Info, AlertTriangle } from 'lucide-react'
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../types/coordinates'
import { DxfStructureView } from './dxf-structure-view'
import { DxfData } from '../utils/dxf/types'
import { PreviewMap } from './preview-map'
import { CoordinateSystemSelect } from './coordinate-system-select'
import { useGeoLoader } from '../hooks/use-geo-loader'

interface GeoImportDialogProps {
  isOpen: boolean
  onClose: () => void
  file: File | null
  onImportComplete: (result: LoaderResult) => void
}

interface LogEntry {
  message: string
  type: 'info' | 'warning' | 'error'
  timestamp: Date
}

type LogType = LogEntry['type']

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
    options,
    logs: loaderLogs,
    dxfData,
    setOptions,
    analyzeFile,
    loadFile,
    clearLogs,
  } = useGeoLoader();

  const [state, setState] = useState<{
    logs: LogEntry[]
    hasErrors: boolean
    selectedLayers: string[]
    visibleLayers: string[]
    selectedTemplates: string[]
  }>({
    logs: [],
    hasErrors: false,
    selectedLayers: [],
    visibleLayers: [],
    selectedTemplates: [],
  });

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
    // Ensure the value is a valid CoordinateSystem
    const coordinateSystem = Object.values(COORDINATE_SYSTEMS).includes(value as CoordinateSystem)
      ? value as CoordinateSystem
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

  const isDxfFile = file.name.toLowerCase().endsWith('.dxf');
  const showCoordinateWarning = analysis?.coordinateSystem === COORDINATE_SYSTEMS.WGS84 && 
    analysis?.bounds && (
      Math.abs(analysis.bounds.maxX) > 180 || 
      Math.abs(analysis.bounds.minX) > 180 || 
      Math.abs(analysis.bounds.maxY) > 90 || 
      Math.abs(analysis.bounds.minY) > 90
    );

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
          {/* Left side: Structure and Coordinate System */}
          <div className="space-y-4">
            {/* Coordinate System Warning */}
            {showCoordinateWarning && (
              <Alert className="mb-4 border-yellow-500 bg-yellow-50 text-yellow-900">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Your coordinates appear to be in a local/projected system. Please select the correct coordinate system below to ensure proper transformation.
                </AlertDescription>
              </Alert>
            )}

            {/* Coordinate System Select */}
            <div className="border rounded-lg p-4">
              <CoordinateSystemSelect
                value={options.coordinateSystem || ''}
                defaultValue={analysis?.coordinateSystem}
                onChange={handleCoordinateSystemChange}
              />
            </div>

            {/* DXF Structure View */}
            {isDxfFile && dxfData && (
              <div className="border rounded-lg p-4">
                <h4 className="text-sm font-medium mb-2">Structure</h4>
                <DxfStructureView
                  dxfData={dxfData}
                  selectedLayers={state.selectedLayers}
                  onLayerToggle={handleLayerToggle}
                  visibleLayers={state.visibleLayers}
                  onLayerVisibilityToggle={handleLayerVisibilityToggle}
                  selectedTemplates={state.selectedTemplates}
                  onTemplateSelect={handleTemplateSelect}
                />
              </div>
            )}
          </div>

          {/* Right side: Preview and Logs */}
          <div className="space-y-4">
            {/* Preview Map */}
            <div className="border rounded-lg p-4">
              <h4 className="text-sm font-medium mb-2">Preview</h4>
              <div className="h-[400px] w-full bg-accent rounded-md overflow-hidden">
                {analysis?.preview && (
                  <PreviewMap
                    preview={analysis.preview}
                    bounds={analysis.bounds}
                    coordinateSystem={options.coordinateSystem || analysis.coordinateSystem}
                    visibleLayers={state.visibleLayers}
                  />
                )}
              </div>
            </div>

            {/* Logs section */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium">Import Logs</h4>
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  {state.hasErrors && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setState(prev => ({ 
                          ...prev, 
                          logs: [], 
                          hasErrors: false 
                        }));
                        onClose();
                      }}
                    >
                      Clear & Close
                    </Button>
                  )}
                </div>
              </div>
              <ScrollArea className="h-[200px] w-full rounded-md">
                <div className="pr-4">
                  {loading && state.logs.length === 0 && (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  )}
                  {!loading && state.logs.length === 0 && (
                    <p className="text-sm text-muted-foreground">No logs available yet...</p>
                  )}
                  {state.logs.length > 0 && (
                    <div className="space-y-1">
                      {state.logs.map((log, index) => (
                        <div
                          key={`${log.timestamp.getTime()}-${index}`}
                          className={`py-1 text-sm ${
                            log.type === 'error'
                              ? 'text-destructive'
                              : log.type === 'warning'
                              ? 'text-yellow-600'
                              : 'text-foreground'
                          }`}
                        >
                          <span className="text-muted-foreground">
                            {log.timestamp.toLocaleTimeString()}{' '}
                          </span>
                          {log.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
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
  )
}
