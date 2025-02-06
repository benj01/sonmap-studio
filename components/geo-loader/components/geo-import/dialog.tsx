import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogPortal, DialogOverlay } from 'components/ui/dialog';
import { Feature, FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../../types/coordinates';
import { PreviewMap } from '../preview-map';
import { GeoImportDialogProps } from './types';
import { useImportLogs } from './hooks/use-import-logs';
import { useFileAnalysis } from './hooks/use-file-analysis';
import { useCoordinateSystem } from './hooks/use-coordinate-system';
import { useImportProcess } from './hooks/use-import-process';
import { useProcessor } from './hooks/use-processor';
import { AnalyzeResult } from '../../core/processors/base/types';
import { LoaderResult, GeoFeature } from 'types/geo';
import { LogManager } from '../../core/logging/log-manager';
import { PreviewManager } from '../../preview/preview-manager';

// Empty feature collection for initialization
const emptyFeatureCollection: FeatureCollection = {
  type: "FeatureCollection" as const,
  features: [] as Feature[]
};

// Progress phases with descriptions
const PROGRESS_PHASES = {
  PARSE: {
    START: 0,
    END: 0.3,
    description: "Reading and parsing raw file data"
  },
  ANALYZE: {
    START: 0.3,
    END: 0.4,
    description: "Analyzing file structure and detecting coordinate system"
  },
  CONVERT: {
    START: 0.4,
    END: 1.0,
    description: "Converting to GeoJSON and transforming coordinates"
  }
} as const;

interface State {
  coordinateSystem: CoordinateSystem;
  pendingCoordinateSystem: CoordinateSystem;
  analysisResult: AnalyzeResult<any, any> | null;
  currentPhase: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  file: File;
  onImportComplete: (result: any) => void;
}

interface FileAnalysisResult {
  loading: boolean;
  analysis: AnalyzeResult<any, any> | null;
  dxfData: any;
  selectedLayers: string[];
  visibleLayers: string[];
  selectedTemplates: string[];
  previewManager: PreviewManager | null;
  handleLayerToggle: (layer: string, enabled: boolean) => void;
  handleLayerVisibilityToggle: (layer: string, visible: boolean) => void;
  handleTemplateSelect: (template: string, enabled: boolean) => void;
  analyzeFile: (file: File) => Promise<void>;
}

export function GeoImportDialog({
  isOpen,
  onClose,
  file,
  onImportComplete,
}: Props) {
  const { onWarning, onError, onInfo } = useImportLogs();
  const { getProcessor } = useProcessor({ onWarning, onError, onProgress: () => {} });
  const {
    coordinateSystem,
    pendingCoordinateSystem,
    loading: loadingCoordinateSystem,
    handleCoordinateSystemChange,
    applyCoordinateSystem,
    initializeCoordinateSystem
  } = useCoordinateSystem({ onWarning, onError, onProgress: () => {}, getProcessor });

  const [state, setState] = useState<State>({
    coordinateSystem: COORDINATE_SYSTEMS.WGS84,
    pendingCoordinateSystem: COORDINATE_SYSTEMS.WGS84,
    analysisResult: null,
    currentPhase: 'initial'
  });

  const [previewManager, setPreviewManager] = useState<PreviewManager | null>(null);
  const [visibleLayers, setVisibleLayers] = useState<string[]>(['shapes']);

  // Initialize hooks with enhanced error handling
  const {
    logs,
    hasErrors,
    onWarning: importLogsWarning,
    onError: importLogsError,
    onInfo: importLogsInfo,
    clearLogs
  } = useImportLogs();

  // Listen for error state changes
  useEffect(() => {
    const handleErrorStateChange = () => {
      console.log('[DEBUG] Dialog detected error state change, logs:', logs);
    };
    window.addEventListener('error-state-changed', handleErrorStateChange);
    return () => window.removeEventListener('error-state-changed', handleErrorStateChange);
  }, [logs]);

  // Force log updates when file changes
  useEffect(() => {
    if (file) {
      console.log('[DEBUG] Dialog received new file:', file.name);
      importLogsInfo(`Processing file: ${file.name}`);
    }
  }, [file, importLogsInfo]);

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
    if (phase !== state.currentPhase) {
      setState(prev => ({
        ...prev,
        currentPhase: phase
      }));
      importLogsInfo(`[${phase}] Step: ${PROGRESS_PHASES[phase].description} (${Math.floor(progress * 100)}%)`);
    }

    // Only log progress at 10% intervals to reduce noise
    const progressPercent = Math.floor(progress * 100);
    if (progressPercent % 10 === 0) {
      importLogsInfo(`Progress: ${progressPercent}%`);
    }
  }, [state.currentPhase, importLogsInfo]);

  // Enhanced file analysis with debug logging
  const {
    loading: analysisLoading,
    analysis: analysisResult,
    dxfData,
    selectedLayers,
    visibleLayers: analysisVisibleLayers,
    selectedTemplates,
    previewManager: analysisPreviewManager,
    handleLayerToggle,
    handleLayerVisibilityToggle,
    handleTemplateSelect,
    analyzeFile
  } = useFileAnalysis({
    file,
    onWarning,
    onError,
    onProgress: (progress) => {
      onProgress(progress);
      console.debug('[DEBUG] File analysis progress:', { progress });
    },
    getProcessor,
    initializeCoordinateSystem
  }) as FileAnalysisResult;

  // Debug logging for state changes
  useEffect(() => {
    console.debug('[DEBUG] Dialog state updated:', {
      selectedLayers,
      analysisVisibleLayers,
      selectedTemplates,
      hasErrors,
      currentPhase: state.currentPhase
    });
  }, [selectedLayers, analysisVisibleLayers, selectedTemplates, hasErrors, state.currentPhase]);

  // Enhanced layer toggle handlers
  const handleLayerToggleWrapper = useCallback((layer: string, enabled: boolean) => {
    console.debug('[DEBUG] Dialog layer toggle:', { layer, enabled });
    handleLayerToggle(layer, enabled);
  }, [handleLayerToggle]);

  const handleLayerVisibilityToggleWrapper = useCallback((layer: string, visible: boolean) => {
    console.debug('[DEBUG] Dialog layer visibility toggle:', { layer, visible });
    handleLayerVisibilityToggle(layer, visible);
  }, [handleLayerVisibilityToggle]);

  const handleTemplateSelectWrapper = useCallback((template: string, enabled: boolean) => {
    console.debug('[DEBUG] Dialog template select:', { template, enabled });
    handleTemplateSelect(template, enabled);
  }, [handleTemplateSelect]);

  const {
    coordinateSystem: detectedSystem,
    pendingCoordinateSystem: pendingSystem,
    hasChanges: coordinateSystemChanged,
    handleCoordinateSystemChange: handleDetectedSystemChange,
    applyCoordinateSystem: applyDetectedSystem,
    initializeCoordinateSystem: initializeDetectedSystem,
    resetCoordinateSystem
  } = useCoordinateSystem({
    onWarning,
    onError,
    onProgress,
    getProcessor
  });

  // Enhanced error handling for coordinate system changes
  const handleCoordinateSystemChangeWrapper = useCallback((value: CoordinateSystem) => {
    console.debug('[DEBUG] Coordinate system change:', {
      from: state.coordinateSystem,
      to: value
    });
    setState(prev => ({
      ...prev,
      pendingCoordinateSystem: value
    }));
    handleDetectedSystemChange(value);
  }, [state.coordinateSystem, handleDetectedSystemChange]);

  const { importFile } = useImportProcess({
    onWarning,
    onError,
    onProgress,
    getProcessor
  });

  // Initialize coordinate system once when analysis first completes
  const analysisRef = useRef<AnalyzeResult | null>(null);
  const initializeCoordinateSystemOnce = useCallback(() => {
    if (!analysisResult || analysisResult === analysisRef.current) return;

    console.debug('[DEBUG] Initializing coordinate system from analysis result:', {
      analysisResult,
      metadata: analysisResult.metadata,
      rawCrs: analysisResult.metadata?.crs || (analysisResult as any).crs,
      state: {
        current: state.coordinateSystem,
        pending: state.pendingCoordinateSystem
      }
    });

    // Get coordinate system from metadata or root level
    const detectedSystem = analysisResult.metadata?.crs || (analysisResult as any).crs;
    
    if (!detectedSystem) {
      console.warn('[DEBUG] No coordinate system detected:', {
        analysisResult,
        metadata: analysisResult.metadata,
        rawResult: analysisResult
      });
      importLogsWarning('No coordinate system detected in analysis result');
      return;
    }

    // Try to match by EPSG code first
    const epsgMatch = detectedSystem.match(/EPSG:(\d+)/i);
    if (epsgMatch) {
      const epsgCode = epsgMatch[0].toUpperCase();
      // Find matching system by EPSG code
      const matchingEpsg = Object.entries(COORDINATE_SYSTEMS).find(
        ([_, value]) => value.toUpperCase() === epsgCode
      );

      if (matchingEpsg) {
        const [systemKey, systemValue] = matchingEpsg;
        console.debug('[DEBUG] Found matching EPSG code:', {
          key: systemKey,
          value: systemValue,
          detected: detectedSystem,
          epsgCode,
          source: analysisResult.metadata?.crs ? 'metadata' : 'root'
        });
        
        initializeDetectedSystem(systemValue);
        setState(prev => ({
          ...prev,
          coordinateSystem: systemValue,
          pendingCoordinateSystem: systemValue
        }));
        return;
      }

      // If no exact match, try to find a system that includes this EPSG code
      const systemWithEpsg = Object.entries(COORDINATE_SYSTEMS).find(
        ([_, value]) => value.toUpperCase().includes(epsgCode)
      );

      if (systemWithEpsg) {
        const [systemKey, systemValue] = systemWithEpsg;
        console.debug('[DEBUG] Found system containing EPSG code:', {
          key: systemKey,
          value: systemValue,
          detected: detectedSystem,
          epsgCode,
          source: analysisResult.metadata?.crs ? 'metadata' : 'root'
        });
        
        initializeDetectedSystem(systemValue);
        setState(prev => ({
          ...prev,
          coordinateSystem: systemValue,
          pendingCoordinateSystem: systemValue
        }));
        return;
      }
    }

    // Try exact match with COORDINATE_SYSTEMS values
    const matchingSystem = Object.entries(COORDINATE_SYSTEMS).find(
      ([_, value]) => value === detectedSystem
    );

    if (matchingSystem) {
      const [systemKey, systemValue] = matchingSystem;
      console.debug('[DEBUG] Found exact matching coordinate system:', {
        key: systemKey,
        value: systemValue,
        detected: detectedSystem,
        source: analysisResult.metadata?.crs ? 'metadata' : 'root'
      });
      
      initializeDetectedSystem(systemValue);
      setState(prev => ({
        ...prev,
        coordinateSystem: systemValue,
        pendingCoordinateSystem: systemValue
      }));
      return;
    }

    // If we get here, we couldn't match the system
    console.warn('[DEBUG] Could not match coordinate system:', {
      detectedSystem,
      availableSystems: COORDINATE_SYSTEMS,
      source: analysisResult.metadata?.crs ? 'metadata' : 'root'
    });
    importLogsWarning(`Unrecognized coordinate system: ${detectedSystem}`);
    
    analysisRef.current = analysisResult;
  }, [analysisResult, initializeDetectedSystem, importLogsWarning, state.coordinateSystem]);

  useEffect(() => {
    initializeCoordinateSystemOnce();
  }, [initializeCoordinateSystemOnce]);

  // Reset everything when dialog closes
  useEffect(() => {
    if (!isOpen) {
      console.debug('[DEBUG] Dialog closed, cleaning up...');
      resetCoordinateSystem();
      clearLogs();
      setState(prev => ({
        ...prev,
        currentPhase: 'initial'
      }));
      // Reset file analysis state
      if (analysisPreviewManager) {
        console.debug('[DEBUG] Cleaning up preview manager');
        analysisPreviewManager.dispose();
      }
    }
  }, [isOpen, resetCoordinateSystem, clearLogs, analysisPreviewManager]);

  const handleClearAndClose = useCallback(() => {
    console.debug('[DEBUG] Clearing and closing dialog');
    clearLogs();
    if (analysisPreviewManager) {
      console.debug('[DEBUG] Cleaning up preview manager');
      analysisPreviewManager.dispose();
    }
    onClose();
  }, [clearLogs, analysisPreviewManager, onClose]);

  const handleApplyCoordinateSystem = async () => {
    if (!file) return;
    
    importLogsInfo('Applying coordinate system changes...');
    console.debug('[DEBUG] Applying coordinate system:', {
      current: coordinateSystem,
      pending: pendingSystem,
      fileType: file.name.split('.').pop()?.toLowerCase(),
      hasAnalysis: !!analysisResult,
      hasPreviewManager: !!analysisPreviewManager
    });

    try {
      const result = await applyDetectedSystem(file, analysisResult, analysisPreviewManager);
      if (result) {
        console.debug('[DEBUG] Coordinate system applied:', {
          newSystem: pendingSystem,
          featureCount: result.preview?.features?.length || 0,
          bounds: result.bounds
        });
        setState(prev => ({
          ...prev,
          coordinateSystem: prev.pendingCoordinateSystem
        }));
        importLogsInfo(`Successfully applied coordinate system: ${pendingSystem}`);
      }
    } catch (error) {
      console.error('[DEBUG] Coordinate system application failed:', error);
      const message = error instanceof Error ? error.message : String(error);
      importLogsError(`Failed to apply coordinate system: ${message}`);
      // Reset pending state on error
      setState(prev => ({
        ...prev,
        pendingCoordinateSystem: prev.coordinateSystem
      }));
    }
  };

  const handleImport = async () => {
    if (!file) return;

    importLogsInfo(`Starting import of ${file.name}...`);
    console.debug('[DEBUG] Starting import:', {
      fileType: file.name.split('.').pop()?.toLowerCase(),
      coordinateSystem,
      selectedLayers,
      featureCount: analysisResult?.features?.length || 0
    });

    try {
      const result = await importFile(file, {
        coordinateSystem,
        selectedLayers: selectedLayers || [],
        selectedTemplates: selectedTemplates || []
      });

      if (result) {
        try {
          await onImportComplete(result);
          if (!hasErrors) {
            importLogsInfo('Import completed successfully');
            onClose();
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes('Duplicate')) {
            importLogsError('A file with this name already exists. Please delete the existing file first.');
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      importLogsError(`Import failed: ${message}`);
    }
  };

  // Get list of supported formats
  const supportedFormats = ['.geojson', '.json', '.kml', '.gpx', '.dxf', '.shp', '.csv', '.xyz', '.txt'];
  const shapefileFormats = ['.shp', '.dbf', '.shx', '.prj'];

  if (!file) return null;

  const loading = analysisLoading || loadingCoordinateSystem;

  // Check file format support
  const fileExtension = `.${file.name.split('.').pop()?.toLowerCase()}`;
  const isFormatSupported = supportedFormats.includes(fileExtension);
  const isShapefileComponent = shapefileFormats.some(ext => file.name.toLowerCase().endsWith(ext));

  // Validate file format and components
  useEffect(() => {
    if (!isFormatSupported) {
      if (isShapefileComponent) {
        // For shapefiles, check if we have all required companion files
        const relatedFiles = (file as any).relatedFiles || {};
        const missingFiles = [];
        
        if (!file.name.toLowerCase().endsWith('.shp')) {
          importLogsError(`Please select the main .shp file to import a shapefile.`);
          return;
        }
        
        if (!relatedFiles['.dbf']) missingFiles.push('.dbf');
        if (!relatedFiles['.shx']) missingFiles.push('.shx');
        
        if (missingFiles.length > 0) {
          importLogsError(`Missing required shapefile components: ${missingFiles.join(', ')}. A complete shapefile requires .shp, .dbf, and .shx files.`);
        }
      } else {
        importLogsError(`Unsupported file format. Supported formats: ${supportedFormats.join(', ')}`);
      }
    }
  }, [isFormatSupported, isShapefileComponent, importLogsError, supportedFormats, file]);

  const handleDownloadLogs = () => {
    const logger = LogManager.getInstance();
    const filename = `sonmap-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    logger.downloadLogs(filename);
  };

  const handleFeatureFilter = (f: GeoFeature) => {
    // ... existing code ...
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClearAndClose()}>
      <DialogPortal>
        <DialogOverlay className="bg-black/80" />
        <DialogContent className="max-w-4xl h-[90vh] overflow-y-auto fixed z-50">
          <div className="flex justify-between items-center">
            <DialogTitle>Import {file?.name}</DialogTitle>
            <button
              onClick={handleDownloadLogs}
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
              title="Download debug logs"
            >
              📥 Download Logs
            </button>
          </div>
          <DialogDescription>
            Configure import settings and preview the data
          </DialogDescription>

          <div className="grid h-full gap-4 pt-4" style={{ gridTemplateColumns: '300px 1fr', gridTemplateRows: 'auto 1fr auto' }}>
            {/* Error Display */}
            {hasErrors && logs && logs.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-4">
                {logs.map((log, index) => (
                  <div key={index} className="text-red-700">
                    {log.message}
                  </div>
                ))}
              </div>
            )}

            {/* Left Column - Top: Coordinate System */}
            <div className="col-span-1 space-y-2">
              <div className="border rounded-lg p-4 bg-background shadow-sm">
                <h3 className="text-sm font-medium mb-3">Coordinate System</h3>
                {analysisResult?.metadata?.crs && (
                  <div className="text-sm text-muted-foreground mb-3">
                    Detected: {analysisResult.metadata.crs}
                  </div>
                )}
                <div className="space-y-2">
                  <select
                    id="coordinate-system"
                    value={pendingSystem || coordinateSystem}
                    onChange={(e) => handleCoordinateSystemChangeWrapper(e.target.value as CoordinateSystem)}
                    disabled={loading}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value={COORDINATE_SYSTEMS.WGS84}>WGS 84 (EPSG:4326)</option>
                    <option value={COORDINATE_SYSTEMS.SWISS_LV95}>Swiss LV95 (EPSG:2056)</option>
                    <option value={COORDINATE_SYSTEMS.SWISS_LV03}>Swiss LV03 (EPSG:21781)</option>
                  </select>
                  {pendingSystem !== coordinateSystem && (
                    <button
                      onClick={handleApplyCoordinateSystem}
                      className="w-full inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
                    >
                      Apply
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column - Preview Map */}
            <div className="col-span-1 row-span-2 border rounded-lg bg-background shadow-sm overflow-hidden">
              {analysisResult && analysisPreviewManager && (
                <div className="h-full">
                  <PreviewMap
                    preview={{
                      points: {
                        type: "FeatureCollection" as const,
                        features: analysisResult.features?.filter(f => f.geometry.type === 'Point' || f.geometry.type === 'MultiPoint') || []
                      },
                      lines: {
                        type: "FeatureCollection" as const,
                        features: analysisResult.features?.filter(f => f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString') || []
                      },
                      polygons: {
                        type: "FeatureCollection" as const,
                        features: analysisResult.features?.filter(f => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') || []
                      },
                      bounds: analysisResult.metadata?.bounds,
                      layers: ['shapes'],
                      previewManager: analysisPreviewManager,
                      coordinateSystem: analysisResult.metadata?.crs as CoordinateSystem | undefined
                    }}
                    bounds={analysisResult.metadata?.bounds}
                    coordinateSystem={analysisResult.metadata?.crs as CoordinateSystem | undefined}
                    visibleLayers={visibleLayers}
                    selectedElement={{
                      type: "feature",
                      layer: "shapes"
                    }}
                    analysis={{
                      warnings: []
                    }}
                  />
                </div>
              )}
            </div>

            {/* Left Column - Bottom: Layer Controls */}
            <div className="col-span-1">
              {selectedLayers && selectedLayers.length > 0 && (
                <div className="border rounded-lg p-4 bg-background shadow-sm">
                  <h3 className="text-sm font-medium mb-3">Layers</h3>
                  <div className="space-y-3">
                    {selectedLayers.map((layer) => (
                      <div key={layer} className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id={layer}
                          checked={visibleLayers?.includes(layer)}
                          onChange={(e) => handleLayerVisibilityToggleWrapper(layer, e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <label htmlFor={layer} className="text-sm">
                          {layer}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Row - Action Buttons */}
            <div className="col-span-2 flex justify-end gap-3">
              <button
                onClick={handleClearAndClose}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={loading || hasErrors}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
              >
                Import
              </button>
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
