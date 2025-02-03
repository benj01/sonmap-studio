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

export function GeoImportDialog({
  isOpen,
  onClose,
  file,
  onImportComplete,
}: GeoImportDialogProps) {
  const [currentPhase, setCurrentPhase] = useState<keyof typeof PROGRESS_PHASES | null>(null);

  // Initialize hooks with enhanced error handling
  const {
    logs,
    hasErrors,
    onWarning,
    onError,
    onInfo,
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
      onInfo(`Processing file: ${file.name}`);
    }
  }, [file, onInfo]);

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
      onInfo(`[${phase}] Step: ${PROGRESS_PHASES[phase].description} (${Math.floor(progress * 100)}%)`);
    }

    // Only log progress at 10% intervals to reduce noise
    const progressPercent = Math.floor(progress * 100);
    if (progressPercent % 10 === 0) {
      onInfo(`Progress: ${progressPercent}%`);
    }
  }, [currentPhase, onInfo]);

  // Initialize shared processor
  const { getProcessor, resetProcessor } = useProcessor({
    onWarning,
    onError,
    onProgress
  });

  // Enhanced file analysis with debug logging
  const {
    loading: analysisLoading,
    analysis,
    dxfData,
    selectedLayers,
    visibleLayers,
    selectedTemplates,
    previewManager,
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
    getProcessor
  });

  // Debug logging for state changes
  useEffect(() => {
    console.debug('[DEBUG] Dialog state updated:', {
      selectedLayers,
      visibleLayers,
      selectedTemplates,
      hasErrors,
      currentPhase
    });
  }, [selectedLayers, visibleLayers, selectedTemplates, hasErrors, currentPhase]);

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
    loading: coordinateSystemLoading,
    coordinateSystem,
    pendingCoordinateSystem,
    hasChanges: coordinateSystemChanged,
    handleCoordinateSystemChange,
    applyCoordinateSystem,
    initializeCoordinateSystem,
    resetCoordinateSystem
  } = useCoordinateSystem({
    onWarning,
    onError,
    onProgress,
    getProcessor
  });

  // Enhanced error handling for coordinate system changes
  const handleCoordinateSystemChangeWrapper = useCallback(async (newSystem: string) => {
    // Validate that the new system is a valid coordinate system
    if (!Object.values(COORDINATE_SYSTEMS).includes(newSystem as CoordinateSystem)) {
      onError(`Invalid coordinate system: ${newSystem}`);
      return;
    }
    try {
      onInfo(`Attempting to change coordinate system to ${newSystem}`);
      await handleCoordinateSystemChange(newSystem as CoordinateSystem);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onError(`Failed to change coordinate system: ${message}`);
    }
  }, [handleCoordinateSystemChange, onError, onInfo]);

  const { importFile } = useImportProcess({
    onWarning,
    onError,
    onProgress,
    getProcessor
  });

  // Initialize coordinate system once when analysis first completes
  const analysisRef = useRef<AnalyzeResult | null>(null);
  const initializeCoordinateSystemOnce = useCallback(() => {
    if (!analysis?.coordinateSystem || analysis === analysisRef.current) return;

    console.debug('[DEBUG] Analysis state:', {
      coordinateSystem: analysis.coordinateSystem,
      featureCount: analysis.preview?.features?.length || 0,
      bounds: analysis.bounds,
      layers: analysis.layers
    });

    // Validate that it's a known coordinate system
    const system = Object.values(COORDINATE_SYSTEMS).find(sys => sys === analysis.coordinateSystem);
    if (system) {
      console.debug('[DEBUG] Initializing detected coordinate system:', system);
      initializeCoordinateSystem(system);
    } else {
      console.warn('[DEBUG] Unknown coordinate system:', analysis.coordinateSystem);
      onWarning(`Unknown coordinate system detected: ${analysis.coordinateSystem}, using WGS84`);
      initializeCoordinateSystem(COORDINATE_SYSTEMS.WGS84);
    }

    // Log preview state
    if (previewManager) {
      console.debug('[DEBUG] Preview manager state:', {
        features: analysis.preview?.features?.length || 0,
        coordinateSystem: system || COORDINATE_SYSTEMS.WGS84,
        bounds: analysis.bounds,
        layers: selectedLayers
      });
    }

    analysisRef.current = analysis;
  }, [analysis, initializeCoordinateSystem, onWarning, previewManager, selectedLayers]);

  useEffect(() => {
    initializeCoordinateSystemOnce();
  }, [initializeCoordinateSystemOnce]);

  // Reset everything when dialog closes
  useEffect(() => {
    if (!isOpen) {
      console.debug('[DEBUG] Dialog closed, cleaning up...');
      resetProcessor();
      resetCoordinateSystem();
      clearLogs();
      setCurrentPhase(null);
      // Reset file analysis state
      if (previewManager) {
        console.debug('[DEBUG] Cleaning up preview manager');
        previewManager.dispose();
      }
    }
  }, [isOpen, resetProcessor, resetCoordinateSystem, clearLogs, previewManager]);

  const handleClearAndClose = useCallback(() => {
    console.debug('[DEBUG] Clearing and closing dialog');
    clearLogs();
    if (previewManager) {
      console.debug('[DEBUG] Cleaning up preview manager');
      previewManager.dispose();
    }
    onClose();
  }, [clearLogs, previewManager, onClose]);

  const handleApplyCoordinateSystem = async () => {
    if (!file) return;
    
    onInfo('Applying coordinate system changes...');
    console.debug('[DEBUG] Applying coordinate system:', {
      current: coordinateSystem,
      pending: pendingCoordinateSystem,
      fileType: file.name.split('.').pop()?.toLowerCase(),
      hasAnalysis: !!analysis,
      hasPreviewManager: !!previewManager
    });

    try {
      const result = await applyCoordinateSystem(file, analysis, previewManager);
      if (result) {
        console.debug('[DEBUG] Coordinate system applied:', {
          newSystem: pendingCoordinateSystem,
          featureCount: result.preview?.features?.length || 0,
          bounds: result.bounds
        });
        onInfo(`Successfully applied coordinate system: ${pendingCoordinateSystem}`);
      }
    } catch (error) {
      console.error('[DEBUG] Coordinate system application failed:', error);
      const message = error instanceof Error ? error.message : String(error);
      onError(`Failed to apply coordinate system: ${message}`);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    onInfo(`Starting import of ${file.name}...`);
    console.debug('[DEBUG] Starting import:', {
      fileType: file.name.split('.').pop()?.toLowerCase(),
      coordinateSystem,
      selectedLayers,
      featureCount: analysis?.preview?.features?.length || 0
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
            onInfo('Import completed successfully');
            onClose();
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes('Duplicate')) {
            onError('A file with this name already exists. Please delete the existing file first.');
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onError(`Import failed: ${message}`);
    }
  };

  // Get list of supported formats
  const supportedFormats = ['.geojson', '.json', '.kml', '.gpx', '.dxf', '.shp', '.csv', '.xyz', '.txt'];
  const shapefileFormats = ['.shp', '.dbf', '.shx', '.prj'];

  if (!file) return null;

  const loading = analysisLoading || coordinateSystemLoading;

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
          onError(`Please select the main .shp file to import a shapefile.`);
          return;
        }
        
        if (!relatedFiles['.dbf']) missingFiles.push('.dbf');
        if (!relatedFiles['.shx']) missingFiles.push('.shx');
        
        if (missingFiles.length > 0) {
          onError(`Missing required shapefile components: ${missingFiles.join(', ')}. A complete shapefile requires .shp, .dbf, and .shx files.`);
        }
      } else {
        onError(`Unsupported file format. Supported formats: ${supportedFormats.join(', ')}`);
      }
    }
  }, [isFormatSupported, isShapefileComponent, onError, supportedFormats, file]);

  const handleDownloadLogs = () => {
    const logger = LogManager.getInstance();
    const filename = `sonmap-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    logger.downloadLogs(filename);
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
                {analysis?.coordinateSystem && (
                  <div className="text-sm text-muted-foreground mb-3">
                    Detected: {analysis.coordinateSystem}
                  </div>
                )}
                <div className="space-y-2">
                  <select
                    id="coordinate-system"
                    value={pendingCoordinateSystem || coordinateSystem}
                    onChange={(e) => handleCoordinateSystemChangeWrapper(e.target.value as string)}
                    disabled={loading}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value={COORDINATE_SYSTEMS.WGS84}>WGS 84 (EPSG:4326)</option>
                    <option value={COORDINATE_SYSTEMS.SWISS_LV95}>Swiss LV95 (EPSG:2056)</option>
                    <option value={COORDINATE_SYSTEMS.SWISS_LV03}>Swiss LV03 (EPSG:21781)</option>
                  </select>
                  {pendingCoordinateSystem && (
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
              {previewManager && analysis && (
                <div className="h-full">
                  <PreviewMap
                    preview={{
                      points: {
                        type: "FeatureCollection" as const,
                        features: []
                      },
                      lines: {
                        type: "FeatureCollection" as const,
                        features: []
                      },
                      polygons: {
                        type: "FeatureCollection" as const,
                        features: analysis.preview?.features || []
                      },
                      bounds: analysis.bounds,
                      layers: selectedLayers || [],
                      previewManager: previewManager,
                      coordinateSystem: coordinateSystem
                    }}
                    bounds={analysis.bounds}
                    coordinateSystem={coordinateSystem}
                    visibleLayers={visibleLayers}
                    selectedElement={{
                      type: "feature",
                      layer: selectedLayers?.[0] || "default"
                    }}
                    analysis={{
                      warnings: (analysis.preview?.features || []).length === 0 ? [{
                        type: 'warning',
                        message: 'No features available for preview'
                      }] : []
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
