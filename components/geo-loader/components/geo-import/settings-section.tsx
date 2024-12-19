import { Alert, AlertDescription } from 'components/ui/alert';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from 'components/ui/button';
import { COORDINATE_SYSTEMS } from '../../types/coordinates';
import { DxfStructureView } from '../dxf-structure-view';
import { CoordinateSystemSelect } from '../coordinate-system-select';
import { SettingsSectionProps } from './types';
import { useState } from 'react';

export function SettingsSection({
  file,
  dxfData,
  analysis,
  options,
  selectedLayers,
  visibleLayers,
  selectedTemplates,
  onLayerToggle,
  onLayerVisibilityToggle,
  onTemplateSelect,
  onCoordinateSystemChange,
  pendingCoordinateSystem,
  onApplyCoordinateSystem,
  errorReporter,
}: SettingsSectionProps) {
  const [isApplying, setIsApplying] = useState(false);
  const isDxfFile = file.name.toLowerCase().endsWith('.dxf');
  
  // Check for invalid WGS84 coordinates
  const hasInvalidWGS84Coordinates = analysis?.coordinateSystem === COORDINATE_SYSTEMS.WGS84 && 
    analysis?.bounds && (
      Math.abs(analysis.bounds.maxX) > 180 || 
      Math.abs(analysis.bounds.minX) > 180 || 
      Math.abs(analysis.bounds.maxY) > 90 || 
      Math.abs(analysis.bounds.minY) > 90
    );

  // Report coordinate system warning if detected
  if (hasInvalidWGS84Coordinates) {
    errorReporter.warn('Coordinates appear to be outside the valid WGS84 range', {
      bounds: analysis.bounds,
      currentSystem: analysis.coordinateSystem
    });
  }

  const coordinateSystemChanged = pendingCoordinateSystem !== options.coordinateSystem;
  const detectedSystem = analysis?.coordinateSystem;

  const handleApplyCoordinateSystem = async () => {
    if (!onApplyCoordinateSystem) {
      errorReporter.error('Cannot apply coordinate system: onApplyCoordinateSystem callback is not defined');
      return;
    }

    setIsApplying(true);
    try {
      await onApplyCoordinateSystem();
      errorReporter.info(`Successfully applied coordinate system: ${pendingCoordinateSystem}`, {
        from: options.coordinateSystem,
        to: pendingCoordinateSystem
      });
    } catch (error: unknown) {
      errorReporter.error('Failed to apply coordinate system', error instanceof Error ? error : new Error(String(error)), {
        from: options.coordinateSystem,
        to: pendingCoordinateSystem
      });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Coordinate System Section */}
      <div className="border rounded-lg p-4">
        {/* Warning for invalid coordinates */}
        {hasInvalidWGS84Coordinates && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              The coordinates appear to be outside the valid WGS84 range. Please select the correct coordinate system below.
            </AlertDescription>
          </Alert>
        )}

        {/* Coordinate System Selection */}
        <CoordinateSystemSelect
          value={pendingCoordinateSystem || options.coordinateSystem || ''}
          defaultValue={analysis?.coordinateSystem}
          onChange={onCoordinateSystemChange}
          highlightValue={detectedSystem}
          errorReporter={errorReporter}
        />

        {/* Apply Changes Button */}
        {coordinateSystemChanged && onApplyCoordinateSystem && (
          <div className="mt-4 flex justify-end">
            <Button
              onClick={handleApplyCoordinateSystem}
              className="gap-2"
              disabled={isApplying}
            >
              <RefreshCw className={`h-4 w-4 ${isApplying ? 'animate-spin' : ''}`} />
              {isApplying ? 'Applying...' : 'Apply Coordinate System'}
            </Button>
          </div>
        )}
      </div>

      {/* DXF Structure View */}
      {isDxfFile && dxfData && (
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-medium">File Structure</h4>
            <div className="text-xs text-muted-foreground">
              {selectedLayers.length} layers selected
            </div>
          </div>
          <DxfStructureView
            dxfData={dxfData}
            selectedLayers={selectedLayers}
            onLayerToggle={onLayerToggle}
            visibleLayers={visibleLayers}
            onLayerVisibilityToggle={onLayerVisibilityToggle}
            selectedTemplates={selectedTemplates}
            onTemplateSelect={onTemplateSelect}
            errorReporter={errorReporter}
          />
        </div>
      )}
    </div>
  );
}
