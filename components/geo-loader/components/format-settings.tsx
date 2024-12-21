import React, { useMemo } from 'react';
import { Card, CardContent } from 'components/ui/card';
import { Input } from 'components/ui/input';
import { Label } from 'components/ui/label';
import { Checkbox } from 'components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'components/ui/select';
import { Switch } from 'components/ui/switch';
import { Alert, AlertDescription } from 'components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { ProcessorOptions } from '../core/processors/base/types';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../types/coordinates';
import { ErrorReporter } from '../core/errors/types';
import { FormatOptions, TextFileOptions, DxfOptions } from '../types/format-options';

interface AnalyzeResult {
  layers: string[];
  coordinateSystem?: CoordinateSystem;
  bounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  preview: {
    type: 'FeatureCollection';
    features: Array<{
      type: 'Feature';
      geometry: any;
      properties?: Record<string, any>;
    }>;
  };
  dxfData?: any;
}

interface FormatSettingsProps {
  fileType: string;
  analysis: AnalyzeResult;
  options: FormatOptions;
  onOptionsChange: (options: FormatOptions) => void;
  /** Optional error reporter instance */
  errorReporter?: ErrorReporter;
}

interface ValidationResult {
  isValid: boolean;
  errors: Array<{
    field: string;
    message: string;
  }>;
}

export function FormatSettings({
  fileType,
  analysis,
  options,
  onOptionsChange,
  errorReporter
}: FormatSettingsProps) {
  // Get typed options based on file type
  const typedOptions = useMemo(() => {
    if (['csv', 'xyz', 'txt'].includes(fileType)) {
      return options as TextFileOptions;
    }
    if (fileType === 'dxf') {
      return options as DxfOptions;
    }
    return options as ProcessorOptions;
  }, [fileType, options]);

  // Validate options based on file type
  const validation = useMemo((): ValidationResult => {
    const errors: Array<{ field: string; message: string }> = [];

    // Validate coordinate system
    if (!typedOptions.coordinateSystem) {
      errors.push({
        field: 'coordinateSystem',
        message: 'Coordinate system is required'
      });
    }

    // Validate CSV/XYZ/TXT specific options
    if (['csv', 'xyz', 'txt'].includes(fileType)) {
      const textOptions = typedOptions as TextFileOptions;
      if (!textOptions.delimiter) {
        errors.push({
          field: 'delimiter',
          message: 'Delimiter is required for text files'
        });
      }
      if (textOptions.skipRows && textOptions.skipRows < 0) {
        errors.push({
          field: 'skipRows',
          message: 'Skip rows must be non-negative'
        });
      }
      if (textOptions.skipColumns && textOptions.skipColumns < 0) {
        errors.push({
          field: 'skipColumns',
          message: 'Skip columns must be non-negative'
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }, [fileType, typedOptions]);

  // Report validation errors
  React.useEffect(() => {
    if (errorReporter) {
      errorReporter.clear();
      validation.errors.forEach(error => {
        errorReporter.addError(error.message, 'VALIDATION_ERROR', {
          field: error.field
        });
      });
    }
  }, [validation, errorReporter]);

  const updateOptions = (updates: Partial<FormatOptions>) => {
    const newOptions = { ...options, ...updates };
    console.debug('Updating format options:', {
      previous: options,
      updates,
      new: newOptions
    });
    onOptionsChange(newOptions);
  };

  const handleSelectAll = (type: 'selection' | 'visibility') => {
    if (!analysis?.layers) {
      console.warn('No layers available for selection');
      return;
    }
    
    if (type === 'selection') {
      const allSelected = analysis.layers.length === (options.selectedLayers || []).length;
      const newSelectedLayers = allSelected ? [] : [...analysis.layers];
      console.debug('Toggling all layer selection:', {
        wasAllSelected: allSelected,
        newSelectedLayers
      });
      updateOptions({
        selectedLayers: newSelectedLayers
      });
    } else if (fileType === 'dxf') {
      const dxfOptions = typedOptions as DxfOptions;
      const allVisible = analysis.layers.length === (dxfOptions.visibleLayers || []).length;
      const newVisibleLayers = allVisible ? [] : [...analysis.layers];
      console.debug('Toggling all layer visibility:', {
        wasAllVisible: allVisible,
        newVisibleLayers
      });
      updateOptions({
        visibleLayers: newVisibleLayers
      });
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        {/* Validation Errors */}
        {validation.errors.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <ul className="list-disc pl-4">
                {validation.errors.map((error, index) => (
                  <li key={index} className="text-sm">
                    {error.message}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Coordinate System Settings - Common for all formats */}
        <div className="space-y-2">
          <Label>Coordinate System</Label>
          <Select
            value={options.coordinateSystem || analysis?.coordinateSystem || COORDINATE_SYSTEMS.WGS84}
            onValueChange={(value: CoordinateSystem) => {
              console.debug('Changing coordinate system:', {
                from: options.coordinateSystem || analysis?.coordinateSystem,
                to: value
              });
              updateOptions({ coordinateSystem: value });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select coordinate system" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={COORDINATE_SYSTEMS.WGS84}>WGS84 (EPSG:4326)</SelectItem>
              <SelectItem value={COORDINATE_SYSTEMS.SWISS_LV95}>Swiss LV95 (EPSG:2056) - New</SelectItem>
              <SelectItem value={COORDINATE_SYSTEMS.SWISS_LV03}>Swiss LV03 (EPSG:21781) - Old</SelectItem>
            </SelectContent>
          </Select>
          {(options.coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV95 || 
            options.coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV03) && (
            <p className="text-sm text-muted-foreground">
              {options.coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV95 ? 
                'Swiss LV95: 7-digit coordinates (E: 2,600,000m, N: 1,200,000m origin)' :
                'Swiss LV03: 6-digit coordinates (E: 600,000m, N: 200,000m origin)'}
            </p>
          )}
        </div>

        {/* DXF-specific settings */}
        {fileType === 'dxf' && analysis?.layers && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <Label>Layers</Label>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="select-all"
                    checked={analysis.layers.length === (options.selectedLayers || []).length}
                    onCheckedChange={() => handleSelectAll('selection')}
                  />
                  <label
                    htmlFor="select-all"
                    className="text-xs text-gray-500"
                  >
                    Select All
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="show-all"
                    checked={analysis.layers.length === ((typedOptions as DxfOptions).visibleLayers || []).length}
                    onCheckedChange={() => handleSelectAll('visibility')}
                  />
                  <label
                    htmlFor="show-all"
                    className="text-xs text-gray-500"
                  >
                    Show All
                  </label>
                </div>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-2">
              {analysis.layers.map((layer: string) => (
                <div key={layer} className="flex items-center justify-between space-x-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id={`layer-${layer}`}
                      checked={options.selectedLayers?.includes(layer)}
                      onCheckedChange={(checked) => {
                        if (typeof checked === 'boolean') {
                          const newLayers = checked
                            ? [...(options.selectedLayers || []), layer]
                            : (options.selectedLayers || []).filter((l) => l !== layer);
                          console.debug('Toggling layer selection:', {
                            layer,
                            checked,
                            newLayers
                          });
                          updateOptions({ selectedLayers: newLayers });
                        }
                      }}
                    />
                    <label
                      htmlFor={`layer-${layer}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {layer}
                    </label>
                  </div>
                  <Switch
                    id={`visibility-${layer}`}
                    checked={(typedOptions as DxfOptions).visibleLayers?.includes(layer)}
                    onCheckedChange={(checked) => {
                      const dxfOptions = typedOptions as DxfOptions;
                      const newVisibleLayers = checked
                        ? [...(dxfOptions.visibleLayers || []), layer]
                        : (dxfOptions.visibleLayers || []).filter((l) => l !== layer);
                      console.debug('Toggling layer visibility:', {
                        layer,
                        checked,
                        newVisibleLayers
                      });
                      updateOptions({ visibleLayers: newVisibleLayers });
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CSV/XYZ/TXT-specific settings */}
        {['csv', 'xyz', 'txt'].includes(fileType) && (
          <>
            <div className="space-y-2">
              <Label>Delimiter</Label>
              <Input
                value={(typedOptions as TextFileOptions).delimiter || ''}
                onChange={(e) => updateOptions({ delimiter: e.target.value })}
                placeholder="Enter delimiter (e.g., ',' or ';')"
                className={validation.errors.some(e => e.field === 'delimiter') ? 'border-destructive' : ''}
              />
            </div>

            <div className="space-y-2">
              <Label>Skip Rows</Label>
              <Input
                type="number"
                min="0"
                value={(typedOptions as TextFileOptions).skipRows || 0}
                onChange={(e) => updateOptions({ skipRows: parseInt(e.target.value) })}
                className={validation.errors.some(e => e.field === 'skipRows') ? 'border-destructive' : ''}
              />
            </div>

            <div className="space-y-2">
              <Label>Skip Columns</Label>
              <Input
                type="number"
                min="0"
                value={(typedOptions as TextFileOptions).skipColumns || 0}
                onChange={(e) => updateOptions({ skipColumns: parseInt(e.target.value) })}
                className={validation.errors.some(e => e.field === 'skipColumns') ? 'border-destructive' : ''}
              />
            </div>

            <div className="space-y-2">
              <Label>Point Cloud Optimization</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={(typedOptions as TextFileOptions).simplificationTolerance || 0}
                onChange={(e) => updateOptions({
                  simplificationTolerance: parseFloat(e.target.value),
                })}
                placeholder="Simplification tolerance (0 = no simplification)"
              />
              <p className="text-sm text-muted-foreground">
                Higher values will reduce point density. 0 means no simplification.
              </p>
            </div>
          </>
        )}

        {/* Shapefile-specific settings */}
        {fileType === 'shp' && (
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="import-attributes"
                checked={options.importAttributes ?? false}
                onCheckedChange={(checked) => {
                  if (typeof checked === 'boolean') {
                    updateOptions({ importAttributes: checked });
                  }
                }}
              />
              <Label htmlFor="import-attributes">Import Attributes</Label>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
