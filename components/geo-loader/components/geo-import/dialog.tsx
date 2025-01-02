import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from 'components/ui/dialog';
import { GeoImportDialogProps } from './types';
import { ImportHeader } from './components/import-header';
import { ImportContent } from './components/import-content';
import { ImportControls } from './components/import-controls';
import { useImportLogs } from './hooks/use-import-logs';
import { useFileAnalysis } from './hooks/use-file-analysis';
import { useCoordinateSystem } from './hooks/use-coordinate-system';
import { useImportProcess } from './hooks/use-import-process';
import { useProcessor } from './hooks/use-processor';
import { AnalyzeResult } from '../../core/processors/base/types';

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

  if (!file) return null;

  const options = {
    selectedLayers,
    visibleLayers,
    selectedTemplates,
    coordinateSystem
  };

  const loading = analysisLoading || coordinateSystemLoading;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClearAndClose()}>
      <DialogContent className="max-w-4xl h-[90vh]">
        <DialogTitle>Import {file?.name}</DialogTitle>
        <DialogDescription>
          Configure import settings and preview the data
        </DialogDescription>

        <div className="flex flex-col h-full gap-4 pt-4">
          <ImportContent
            file={file}
            dxfData={dxfData}
            analysis={analysis}
            options={options}
            selectedLayers={selectedLayers}
            visibleLayers={visibleLayers}
            selectedTemplates={selectedTemplates}
            previewManager={previewManager}
            logs={logs}
            loading={loading}
            hasErrors={hasErrors}
            pendingCoordinateSystem={pendingCoordinateSystem}
            onLayerToggle={handleLayerToggleWrapper}
            onLayerVisibilityToggle={handleLayerVisibilityToggleWrapper}
            onTemplateSelect={handleTemplateSelectWrapper}
            onCoordinateSystemChange={handleCoordinateSystemChangeWrapper}
            onApplyCoordinateSystem={handleApplyCoordinateSystem}
            onClearAndClose={handleClearAndClose}
          />

          <ImportControls
            loading={loading}
            hasErrors={hasErrors}
            coordinateSystemChanged={coordinateSystemChanged}
            pendingCoordinateSystem={pendingCoordinateSystem}
            onClose={onClose}
            onApplyCoordinateSystem={handleApplyCoordinateSystem}
            onImport={handleImport}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
