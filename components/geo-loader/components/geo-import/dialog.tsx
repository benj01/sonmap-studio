import { useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { GeoImportDialogProps, ImportOptions, ImportState } from './types';
import { PreviewSection } from './preview-section';
import { SettingsSection } from './settings-section';
import { LogsSection } from './logs-section';
import { initErrorReporter } from './coordinate-system-init';
import { useImport } from './use-import';
import { convertToAnalysis } from './utils';
import { Analysis } from '../../types/map';

// Import processors to ensure they're registered
import '../../processors';

export function GeoImportDialog({
  isOpen,
  onClose,
  file,
  onImportComplete,
  errorReporter: parentErrorReporter
}: GeoImportDialogProps) {
  const {
    loading,
    analysis,
    dxfData,
    state,
    coordinateSystem,
    pendingCoordinateSystem,
    previewManagerRef,
    handleLayerToggle,
    handleLayerVisibilityToggle,
    handleTemplateSelect,
    handleCoordinateSystemChange,
    handleApplyCoordinateSystem,
    handleImport,
    localErrorReporter,
    setState,
  } = useImport(parentErrorReporter);

  // Forward initialization errors/warnings
  useEffect(() => {
    const errors = initErrorReporter.getErrors();
    errors.forEach(error => {
      parentErrorReporter.reportError(error.type, error.message, error.context);
    });

    const warnings = initErrorReporter.getWarnings();
    warnings.forEach(warning => {
      parentErrorReporter.reportWarning(warning.type, warning.message, warning.context);
    });
  }, [parentErrorReporter]);

  // Handle file analysis
  useEffect(() => {
    if (!isOpen || !file) return;
  }, [isOpen, file, analysis, localErrorReporter]);

  if (!file) return null;

  const options: ImportOptions = {
    selectedLayers: state.selectedLayers,
    visibleLayers: state.visibleLayers,
    selectedTemplates: state.selectedTemplates,
    coordinateSystem
  };

  const previewAvailable = analysis && previewManagerRef.current?.hasVisibleFeatures();
  const coordinateSystemChanged = pendingCoordinateSystem !== coordinateSystem;

  // Convert AnalyzeResult to Analysis for preview
  const analysisForPreview: Analysis | undefined = analysis ? {
    warnings: analysis.warnings?.map(w => ({
      type: w.type,
      message: w.message,
      entity: w.context?.entity || undefined
    })) || []
  } : undefined;

  return (
    <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
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
            dxfData={dxfData}
            analysis={analysis || undefined}
            options={options}
            selectedLayers={state.selectedLayers}
            visibleLayers={state.visibleLayers}
            selectedTemplates={state.selectedTemplates}
            onLayerToggle={handleLayerToggle}
            onLayerVisibilityToggle={handleLayerVisibilityToggle}
            onTemplateSelect={handleTemplateSelect}
            onCoordinateSystemChange={handleCoordinateSystemChange}
            pendingCoordinateSystem={pendingCoordinateSystem}
            onApplyCoordinateSystem={() => handleApplyCoordinateSystem(file)}
            errorReporter={localErrorReporter}
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
                analysis={analysisForPreview}
                errorReporter={localErrorReporter}
              />
            )}

            {/* Logs */}
            <LogsSection
              logs={state.logs}
              loading={loading}
              hasErrors={state.hasErrors}
              onClearAndClose={() => {
                setState((prev: ImportState) => ({
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
          {coordinateSystemChanged && (
            <Button
              onClick={() => handleApplyCoordinateSystem(file)}
              disabled={loading || !pendingCoordinateSystem}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Apply Coordinate System
            </Button>
          )}
          <Button
            onClick={() => handleImport(file, onImportComplete, onClose)}
            disabled={loading || state.hasErrors || coordinateSystemChanged}
          >
            {loading ? 'Importing...' : 'Import'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
