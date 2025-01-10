import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogPortal, DialogOverlay } from 'components/ui/dialog';
import { Feature } from 'geojson';
import { GeoImportDialogProps } from './types';
import { useImportLogs } from './hooks/use-import-logs';
import { useFileAnalysis } from './hooks/use-file-analysis';
import { useCoordinateSystem } from './hooks/use-coordinate-system';
import { useImportProcess } from './hooks/use-import-process';
import { useProcessor } from './hooks/use-processor';
import { AnalyzeResult } from '../../core/processors/base/types';
import { LoaderResult, GeoFeature } from 'types/geo';

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
    try {
      onInfo(`Attempting to change coordinate system to ${newSystem}`);
      await handleCoordinateSystemChange(newSystem);
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
  useEffect(() => {
    // Only initialize if this is the first time we get analysis
    if (analysis?.coordinateSystem && analysis !== analysisRef.current) {
      console.debug('Initializing coordinate system from analysis:', analysis.coordinateSystem);
      initializeCoordinateSystem(analysis.coordinateSystem);
      analysisRef.current = analysis;
    }
  }, [analysis, initializeCoordinateSystem]);

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

    try {
      const result = await applyCoordinateSystem(file, analysis, previewManager);
      if (result) {
        onInfo(`Successfully applied coordinate system: ${pendingCoordinateSystem}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onError(`Failed to apply coordinate system: ${message}`);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    onInfo(`Starting import of ${file.name}...`);

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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClearAndClose()}>
      <DialogPortal>
        <DialogOverlay className="bg-black/80" />
        <DialogContent className="max-w-4xl h-[90vh] overflow-y-auto fixed z-50">
          <DialogTitle>Import {file.name}</DialogTitle>
          <DialogDescription>
            Configure import settings and preview the data
          </DialogDescription>

          <div className="flex flex-col h-full gap-4 pt-4">
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

            {/* Coordinate System Selection */}
            <div className="flex items-center gap-2">
              <span className="text-sm">Coordinate System:</span>
              <select
                value={pendingCoordinateSystem || coordinateSystem}
                onChange={(e) => handleCoordinateSystemChangeWrapper(e.target.value)}
                disabled={loading}
                className="text-sm border rounded px-2 py-1"
              >
                <option value="EPSG:4326">WGS 84 (EPSG:4326)</option>
                <option value="EPSG:3857">Web Mercator (EPSG:3857)</option>
              </select>
              {pendingCoordinateSystem && (
                <button
                  onClick={handleApplyCoordinateSystem}
                  className="px-2 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Apply
                </button>
              )}
            </div>

            {/* Layer Controls */}
            {selectedLayers && selectedLayers.length > 0 && (
              <div className="border rounded p-4">
                <h3 className="font-medium mb-2">Layers</h3>
                <div className="space-y-2">
                  {selectedLayers.map((layer) => (
                    <div key={layer} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={layer}
                        checked={visibleLayers?.includes(layer)}
                        onChange={(e) => handleLayerVisibilityToggleWrapper(layer, e.target.checked)}
                      />
                      <label htmlFor={layer}>{layer}</label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Preview Section */}
            {previewManager && (
              <div className="flex-1 min-h-[400px] border rounded">
                {/* Preview content will be rendered by the preview manager */}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={handleClearAndClose}
                className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={loading || hasErrors}
                className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
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
