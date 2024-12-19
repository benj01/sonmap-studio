import React, { ChangeEvent } from 'react';
import { Card, CardContent } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Checkbox } from '../../../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Switch } from '../../../components/ui/switch';
import type { LoaderOptions } from '../../../types/geo';
import { COORDINATE_SYSTEMS, CoordinateSystem, isSwissSystem } from '../types/coordinates';
import { ErrorReporter } from '../utils/errors';
import { AnalyzeResult } from '../processors/base-processor';
import { proj4Instance } from './geo-import/coordinate-system-init';
import { CoordinateTransformer } from '../utils/coordinate-utils';

interface FormatSettingsProps {
  fileType: string;
  analysis: AnalyzeResult;
  options: LoaderOptions;
  onOptionsChange: (options: LoaderOptions) => void;
  errorReporter: ErrorReporter;
}

interface ValidationResult {
  isValid: boolean;
  value: number | null;
  message?: string;
}

export function FormatSettings({
  fileType,
  analysis,
  options,
  onOptionsChange,
  errorReporter,
}: FormatSettingsProps) {
  const updateOptions = (updates: Partial<LoaderOptions>) => {
    const newOptions = { ...options, ...updates };
    errorReporter.reportInfo('FORMAT_OPTIONS', 'Updating format options', {
      fileType,
      previous: options,
      updates,
      new: newOptions,
      analysisCoordinateSystem: analysis?.coordinateSystem
    });
    onOptionsChange(newOptions);
  };

  const validateCoordinateSystem = (system: CoordinateSystem): boolean => {
    try {
      // Check if the coordinate system is properly initialized in proj4
      if (!proj4Instance.defs(system)) {
        errorReporter.reportError('COORDINATE_SYSTEM', 'Coordinate system not initialized', {
          system,
          availableSystems: Object.keys(proj4Instance.defs)
        });
        return false;
      }

      // Test coordinate transformation
      try {
        const transformer = new CoordinateTransformer(
          system,
          COORDINATE_SYSTEMS.WGS84,
          errorReporter,
          proj4Instance
        );

        // Test a point transformation
        if (analysis?.bounds) {
          const { minX, maxX, minY, maxY } = analysis.bounds;
          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;
          const result = transformer.transform({ x: centerX, y: centerY });
          
          if (!result) {
            errorReporter.reportError('COORDINATE_SYSTEM', 'Failed to transform test point', {
              system,
              point: { x: centerX, y: centerY }
            });
            return false;
          }

          // Additional validation for Swiss coordinate systems
          if (isSwissSystem(system)) {
            const isLV95 = system === COORDINATE_SYSTEMS.SWISS_LV95;
            const validRange = isLV95 
              ? { minX: 2000000, maxX: 3000000, minY: 1000000, maxY: 2000000 }
              : { minX: 0, maxX: 1000000, minY: 0, maxY: 1000000 };

            if (minX < validRange.minX || maxX > validRange.maxX || 
                minY < validRange.minY || maxY > validRange.maxY) {
              errorReporter.reportWarning('COORDINATE_SYSTEM', 'Coordinates outside expected range for Swiss system', {
                system,
                bounds: { minX, maxX, minY, maxY },
                validRange
              });
              return false;
            }
          }
        }
      } catch (error) {
        errorReporter.reportError('COORDINATE_SYSTEM', 'Failed to create coordinate transformer', {
          system,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return false;
      }

      return true;
    } catch (error) {
      errorReporter.reportError('COORDINATE_SYSTEM', 'Failed to validate coordinate system', {
        system,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  };

  const handleSelectAll = (type: 'selection' | 'visibility') => {
    if (!analysis?.layers) {
      errorReporter.reportWarning('LAYER_ERROR', 'No layers available for selection', {
        fileType,
        analysis,
        type
      });
      return;
    }
    
    if (type === 'selection') {
      const allSelected = analysis.layers.length === (options.selectedLayers || []).length;
      const newSelectedLayers = allSelected ? [] : [...analysis.layers];
      errorReporter.reportInfo('LAYER_SELECTION', `${allSelected ? 'Deselecting' : 'Selecting'} all layers`, {
        fileType,
        layerCount: analysis.layers.length,
        wasAllSelected: allSelected,
        newSelectedLayers
      });
      updateOptions({
        selectedLayers: newSelectedLayers
      });
    } else {
      const allVisible = analysis.layers.length === (options.visibleLayers || []).length;
      const newVisibleLayers = allVisible ? [] : [...analysis.layers];
      errorReporter.reportInfo('LAYER_VISIBILITY', `${allVisible ? 'Hiding' : 'Showing'} all layers`, {
        fileType,
        layerCount: analysis.layers.length,
        wasAllVisible: allVisible,
        newVisibleLayers
      });
      updateOptions({
        visibleLayers: newVisibleLayers
      });
    }
  };

  const validateNumericInput = (
    value: string,
    field: string,
    min: number,
    max?: number
  ): ValidationResult => {
    const num = parseFloat(value);
    
    if (value === '') {
      return { isValid: false, value: null, message: `${field} is required` };
    }
    
    if (isNaN(num)) {
      errorReporter.reportWarning('INPUT_ERROR', `Invalid ${field.toLowerCase()}`, {
        field,
        value,
        type: 'numeric'
      });
      return { isValid: false, value: null, message: `${field} must be a number` };
    }
    
    if (num < min) {
      errorReporter.reportWarning('INPUT_ERROR', `${field} below minimum`, {
        field,
        value: num,
        min,
        type: 'range'
      });
      return { isValid: false, value: null, message: `${field} must be at least ${min}` };
    }
    
    if (max !== undefined && num > max) {
      errorReporter.reportWarning('INPUT_ERROR', `${field} above maximum`, {
        field,
        value: num,
        max,
        type: 'range'
      });
      return { isValid: false, value: null, message: `${field} must be at most ${max}` };
    }
    
    return { isValid: true, value: num };
  };

  const validateDelimiter = (value: string): ValidationResult => {
    if (value === '') {
      return { isValid: false, value: null, message: 'Delimiter is required' };
    }
    
    if (value.length > 1) {
      errorReporter.reportWarning('DELIMITER_ERROR', 'Invalid delimiter length', {
        value,
        length: value.length
      });
      return { isValid: false, value: null, message: 'Delimiter must be a single character' };
    }
    
    const validDelimiters = [',', ';', '\t', '|', ' '];
    if (!validDelimiters.includes(value)) {
      errorReporter.reportWarning('DELIMITER_ERROR', 'Unusual delimiter character', {
        value,
        validDelimiters
      });
    }
    
    return { isValid: true, value: 1 }; // Using 1 as a dummy numeric value
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        {/* Coordinate System Settings - Common for all formats */}
        <div className="space-y-2">
          <Label>Coordinate System</Label>
          <Select
            value={options.coordinateSystem || analysis?.coordinateSystem || COORDINATE_SYSTEMS.WGS84}
            onValueChange={(value: CoordinateSystem) => {
              if (validateCoordinateSystem(value)) {
                errorReporter.reportInfo('COORDINATE_SYSTEM', 'Changing coordinate system', {
                  fileType,
                  from: options.coordinateSystem || analysis?.coordinateSystem,
                  to: value,
                  bounds: analysis?.bounds
                });
                updateOptions({ coordinateSystem: value });
              }
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
              <Label>Layers ({analysis.layers.length})</Label>
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
                    checked={analysis.layers.length === (options.visibleLayers || []).length}
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
                      onCheckedChange={(checked: boolean | 'indeterminate') => {
                        if (typeof checked === 'boolean') {
                          const newLayers = checked
                            ? [...(options.selectedLayers || []), layer]
                            : (options.selectedLayers || []).filter((l) => l !== layer);
                          errorReporter.reportInfo('LAYER_SELECTION', `${checked ? 'Selected' : 'Deselected'} layer`, {
                            fileType,
                            layer,
                            totalSelected: newLayers.length,
                            totalLayers: analysis.layers.length
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
                    checked={options.visibleLayers?.includes(layer)}
                    onCheckedChange={(checked: boolean) => {
                      const newVisibleLayers = checked
                        ? [...(options.visibleLayers || []), layer]
                        : (options.visibleLayers || []).filter((l) => l !== layer);
                      errorReporter.reportInfo('LAYER_VISIBILITY', `${checked ? 'Showed' : 'Hid'} layer`, {
                        fileType,
                        layer,
                        totalVisible: newVisibleLayers.length,
                        totalLayers: analysis.layers.length
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
                value={options.delimiter || ''}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const result = validateDelimiter(e.target.value);
                  if (result.isValid) {
                    updateOptions({ delimiter: e.target.value });
                  }
                }}
                placeholder="Enter delimiter (e.g., ',' or ';')"
              />
              <p className="text-sm text-muted-foreground">
                Common delimiters: comma (,), semicolon (;), tab (\t), pipe (|), space ( )
              </p>
            </div>

            <div className="space-y-2">
              <Label>Skip Rows</Label>
              <Input
                type="number"
                min="0"
                value={options.skipRows || 0}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const result = validateNumericInput(e.target.value, 'Skip Rows', 0);
                  if (result.isValid && result.value !== null) {
                    updateOptions({ skipRows: result.value });
                  }
                }}
              />
              <p className="text-sm text-muted-foreground">
                Number of rows to skip at the beginning of the file (e.g., header rows)
              </p>
            </div>

            <div className="space-y-2">
              <Label>Skip Columns</Label>
              <Input
                type="number"
                min="0"
                value={options.skipColumns || 0}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const result = validateNumericInput(e.target.value, 'Skip Columns', 0);
                  if (result.isValid && result.value !== null) {
                    updateOptions({ skipColumns: result.value });
                  }
                }}
              />
              <p className="text-sm text-muted-foreground">
                Number of columns to skip at the beginning of each row
              </p>
            </div>

            {/* Point Cloud Optimization Settings */}
            <div className="space-y-2">
              <Label>Point Cloud Optimization</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={options.simplificationTolerance || 0}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const result = validateNumericInput(e.target.value, 'Simplification Tolerance', 0, 100);
                  if (result.isValid && result.value !== null) {
                    errorReporter.reportInfo('OPTIMIZATION', 'Updated simplification tolerance', {
                      fileType,
                      previousValue: options.simplificationTolerance,
                      newValue: result.value
                    });
                    updateOptions({ simplificationTolerance: result.value });
                  }
                }}
                placeholder="Simplification tolerance (0 = no simplification)"
              />
              <p className="text-sm text-muted-foreground">
                Higher values will reduce point density. 0 means no simplification.
                {options.simplificationTolerance && options.simplificationTolerance > 0 && (
                  ` Current setting will reduce point density by approximately ${options.simplificationTolerance}%.`
                )}
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
                onCheckedChange={(checked: boolean | 'indeterminate') => {
                  if (typeof checked === 'boolean') {
                    errorReporter.reportInfo('SHAPEFILE_SETTINGS', 'Toggled attribute import', {
                      fileType,
                      enabled: checked
                    });
                    updateOptions({ importAttributes: checked });
                  }
                }}
              />
              <Label htmlFor="import-attributes">Import Attributes</Label>
            </div>
            <p className="text-sm text-muted-foreground">
              Import attribute data from the DBF file. This may increase memory usage for large files.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
