import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent } from 'components/ui/dialog';
import { GeoImportDialogProps } from './types';
import { ImportHeader } from './components/import-header';
import { ImportContent } from './components/import-content';
import { ImportControls } from './components/import-controls';
import { useImportLogs } from './hooks/use-import-logs';
import { useFileAnalysis } from './hooks/use-file-analysis';
import { useCoordinateSystem } from './hooks/use-coordinate-system';
import { useImportProcess } from './hooks/use-import-process';
import { useProcessor } from './hooks/use-processor';

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

  // Initialize hooks
  const {
    logs,
    hasErrors,
    onWarning,
    onError,
    onInfo,
    clearLogs
  } = useImportLogs();

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
      onInfo(`Step: ${PROGRESS_PHASES[phase].description}`);
    }

    onInfo(`Progress: ${(progress * 100).toFixed(1)}%`);
  }, [currentPhase, onInfo]);

  // Initialize shared processor
  const { getProcessor, resetProcessor } = useProcessor({
    onWarning,
    onError,
    onProgress
  });

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
    onProgress,
    getProcessor
  });

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

  const { importFile } = useImportProcess({
    onWarning,
    onError,
    onProgress,
    getProcessor
  });

  // Initialize coordinate system when analysis completes
  useEffect(() => {
    if (analysis?.coordinateSystem) {
      console.log('Initializing coordinate system from analysis:', analysis.coordinateSystem);
      initializeCoordinateSystem(analysis.coordinateSystem);
    }
  }, [analysis, initializeCoordinateSystem]);

  // Reset everything when dialog closes
  useEffect(() => {
    if (!isOpen) {
      resetProcessor();
      resetCoordinateSystem();
      clearLogs();
      setCurrentPhase(null);
    }
  }, [isOpen, resetProcessor, resetCoordinateSystem, clearLogs]);

  const handleApplyCoordinateSystem = async () => {
    if (!file) return;
    const result = await applyCoordinateSystem(file, analysis, previewManager);
    if (result) {
      onInfo(`Applied coordinate system: ${pendingCoordinateSystem}`);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    const result = await importFile(file, {
      coordinateSystem,
      selectedLayers: selectedLayers || [],
      selectedTemplates: selectedTemplates || []
    });

    if (result) {
      try {
        await onImportComplete(result);
        if (!hasErrors) {
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
  };

  const handleClearAndClose = () => {
    clearLogs();
    onClose();
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
      <DialogContent className="max-w-6xl">
        <ImportHeader
          fileName={file.name}
          hasErrors={hasErrors}
        />

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
          onLayerToggle={handleLayerToggle}
          onLayerVisibilityToggle={handleLayerVisibilityToggle}
          onTemplateSelect={handleTemplateSelect}
          onCoordinateSystemChange={handleCoordinateSystemChange}
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
      </DialogContent>
    </Dialog>
  );
}
