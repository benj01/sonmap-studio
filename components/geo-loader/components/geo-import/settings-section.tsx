import { Alert, AlertDescription } from 'components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { COORDINATE_SYSTEMS } from '../../types/coordinates';
import { DxfStructureView } from '../dxf-structure-view';
import { CoordinateSystemSelect } from '../coordinate-system-select';
import { SettingsSectionProps } from './types';

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
}: SettingsSectionProps) {
  const isDxfFile = file.name.toLowerCase().endsWith('.dxf');
  const showCoordinateWarning = analysis?.coordinateSystem === COORDINATE_SYSTEMS.WGS84 && 
    analysis?.bounds && (
      Math.abs(analysis.bounds.maxX) > 180 || 
      Math.abs(analysis.bounds.minX) > 180 || 
      Math.abs(analysis.bounds.maxY) > 90 || 
      Math.abs(analysis.bounds.minY) > 90
    );

  return (
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
          onChange={onCoordinateSystemChange}
        />
      </div>

      {/* DXF Structure View */}
      {isDxfFile && dxfData && (
        <div className="border rounded-lg p-4">
          <h4 className="text-sm font-medium mb-2">Structure</h4>
          <DxfStructureView
            dxfData={dxfData}
            selectedLayers={selectedLayers}
            onLayerToggle={onLayerToggle}
            visibleLayers={visibleLayers}
            onLayerVisibilityToggle={onLayerVisibilityToggle}
            selectedTemplates={selectedTemplates}
            onTemplateSelect={onTemplateSelect}
          />
        </div>
      )}
    </div>
  );
}
