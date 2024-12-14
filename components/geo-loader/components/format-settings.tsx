// components/geo-loader/components/format-settings.tsx

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
    onOptionsChange({ ...options, ...updates });
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        {/* Coordinate System Settings - Common for all formats */}
        <div className="space-y-2">
          <Label>Coordinate System</Label>
          <Select
            value={options.coordinateSystem || analysis?.coordinateSystem || ''}
            onValueChange={(value) => updateOptions({ coordinateSystem: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select coordinate system" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={COORDINATE_SYSTEMS.WGS84}>WGS84 (EPSG:4326)</SelectItem>
              <SelectItem value={COORDINATE_SYSTEMS.SWISS_LV95}>Swiss LV95 (EPSG:2056)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* DXF-specific settings */}
        {fileType === 'dxf' && analysis?.layers && (
          <div className="space-y-2">
            <Label>Layers</Label>
            <div className="max-h-48 overflow-y-auto space-y-2">
              {analysis.layers.map((layer: string) => (
                <div key={layer} className="flex items-center space-x-2">
                  <Checkbox
                    id={`layer-${layer}`}
                    checked={options.selectedLayers?.includes(layer)}
                    onCheckedChange={(checked) => {
                      const newLayers = checked
                        ? [...(options.selectedLayers || []), layer]
                        : (options.selectedLayers || []).filter((l) => l !== layer);
                      updateOptions({ selectedLayers: newLayers });
                    }}
                  />
                  <label
                    htmlFor={`layer-${layer}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {layer}
                  </label>
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
                checked={options.importAttributes ?? false} // Safe access with optional chaining
                onCheckedChange={(checked) =>
                  updateOptions({ importAttributes: checked })
                }
              />
              <Label htmlFor="import-attributes">Import Attributes</Label>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
