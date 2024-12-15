// components/geo-loader/components/format-settings.tsx

import React from 'react';
import { Card, CardContent } from 'components/ui/card';
import { Input } from 'components/ui/input';
import { Label } from 'components/ui/label';
import { Checkbox } from 'components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'components/ui/select';
import { Switch } from 'components/ui/switch';
import type { LoaderOptions } from '../../../types/geo';
import { COORDINATE_SYSTEMS } from '../utils/coordinate-systems';

interface FormatSettingsProps {
  fileType: string;
  analysis: any;
  options: LoaderOptions;
  onOptionsChange: (options: LoaderOptions) => void;
}

export function FormatSettings({
  fileType,
  analysis,
  options,
  onOptionsChange,
}: FormatSettingsProps) {
  const updateOptions = (updates: Partial<LoaderOptions>) => {
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
    } else {
      const allVisible = analysis.layers.length === (options.visibleLayers || []).length;
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
        {/* Coordinate System Settings - Common for all formats */}
        <div className="space-y-2">
          <Label>Coordinate System</Label>
          <Select
            value={options.coordinateSystem || analysis?.coordinateSystem || ''}
            onValueChange={(value) => {
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
                    checked={options.visibleLayers?.includes(layer)}
                    onCheckedChange={(checked) => {
                      const newVisibleLayers = checked
                        ? [...(options.visibleLayers || []), layer]
                        : (options.visibleLayers || []).filter((l) => l !== layer);
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
                value={options.delimiter || ''}
                onChange={(e) => updateOptions({ delimiter: e.target.value })}
                placeholder="Enter delimiter (e.g., ',' or ';')"
              />
            </div>

            <div className="space-y-2">
              <Label>Skip Rows</Label>
              <Input
                type="number"
                min="0"
                value={options.skipRows || 0}
                onChange={(e) => updateOptions({ skipRows: parseInt(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label>Skip Columns</Label>
              <Input
                type="number"
                min="0"
                value={options.skipColumns || 0}
                onChange={(e) => updateOptions({ skipColumns: parseInt(e.target.value) })}
              />
            </div>
          </>
        )}

        {/* Point Cloud Optimization Settings */}
        {['xyz', 'csv', 'txt'].includes(fileType) && (
          <div className="space-y-2">
            <Label>Point Cloud Optimization</Label>
            <Input
              type="number"
              min="0"
              max="100"
              value={options.simplificationTolerance || 0}
              onChange={(e) => updateOptions({
                simplificationTolerance: parseFloat(e.target.value),
              })}
              placeholder="Simplification tolerance (0 = no simplification)"
            />
            <p className="text-sm text-gray-500">
              Higher values will reduce point density. 0 means no simplification.
            </p>
          </div>
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
