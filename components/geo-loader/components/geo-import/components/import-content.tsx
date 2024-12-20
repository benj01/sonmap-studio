import { useState, useEffect } from 'react';
import { AnalyzeResult } from '../../../processors';
import { PreviewManager } from '../../../preview/preview-manager';
import { ImportOptions } from '../types';
import { PreviewSection } from '../preview-section';
import { SettingsSection } from '../settings-section';
import { LogsSection } from '../logs-section';
import { CoordinateSystem } from '../../../types/coordinates';
import { Warning } from '../../../types/map';

interface LogEntry {
  message: string;
  type: 'info' | 'warning' | 'error';
  timestamp: Date;
}

interface ImportContentProps {
  file: File;
  dxfData: any | null;
  analysis: AnalyzeResult | null;
  options: ImportOptions;
  selectedLayers: string[];
  visibleLayers: string[];
  selectedTemplates: string[];
  previewManager: PreviewManager | null;
  logs: LogEntry[];
  loading: boolean;
  hasErrors: boolean;
  pendingCoordinateSystem?: CoordinateSystem;
  onLayerToggle: (layer: string, enabled: boolean) => void;
  onLayerVisibilityToggle: (layer: string, visible: boolean) => void;
  onTemplateSelect: (template: string, enabled: boolean) => void;
  onCoordinateSystemChange: (value: string) => void;
  onApplyCoordinateSystem: () => void;
  onClearAndClose: () => void;
}

function convertWarningsToAnalysis(warnings: string[] = []): Warning[] {
  return warnings.map(message => ({
    type: 'warning',
    message
  }));
}

export function ImportContent({
  file,
  dxfData,
  analysis,
  options,
  selectedLayers,
  visibleLayers,
  selectedTemplates,
  previewManager,
  logs,
  loading,
  hasErrors,
  pendingCoordinateSystem,
  onLayerToggle,
  onLayerVisibilityToggle,
  onTemplateSelect,
  onCoordinateSystemChange,
  onApplyCoordinateSystem,
  onClearAndClose
}: ImportContentProps) {
  const [previewAvailable, setPreviewAvailable] = useState(false);

  useEffect(() => {
    async function checkPreview() {
      if (analysis && previewManager) {
        const hasFeatures = await previewManager.hasVisibleFeatures();
        setPreviewAvailable(hasFeatures);
      } else {
        setPreviewAvailable(false);
      }
    }
    checkPreview();
  }, [analysis, previewManager]);

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Left side: Settings */}
      <SettingsSection
        file={file}
        dxfData={dxfData}
        analysis={analysis || undefined}
        options={options}
        selectedLayers={selectedLayers}
        visibleLayers={visibleLayers}
        selectedTemplates={selectedTemplates}
        onLayerToggle={onLayerToggle}
        onLayerVisibilityToggle={onLayerVisibilityToggle}
        onTemplateSelect={onTemplateSelect}
        onCoordinateSystemChange={onCoordinateSystemChange}
        pendingCoordinateSystem={pendingCoordinateSystem}
        onApplyCoordinateSystem={onApplyCoordinateSystem}
      />

      {/* Right side: Preview and Logs */}
      <div className="space-y-4">
        {/* Preview Map */}
        {previewAvailable && analysis?.bounds && previewManager && (
          <PreviewSection
            previewManager={previewManager}
            bounds={analysis.bounds}
            coordinateSystem={options.coordinateSystem || analysis.coordinateSystem}
            visibleLayers={visibleLayers}
            analysis={{
              warnings: logs
                .filter(log => log.type === 'warning')
                .map(log => ({
                  type: 'warning',
                  message: log.message
                }))
            }}
          />
        )}

        {/* Logs */}
        <LogsSection
          logs={logs}
          loading={loading}
          hasErrors={hasErrors}
          onClearAndClose={onClearAndClose}
        />
      </div>
    </div>
  );
}
