import React from 'react';
import { Label } from 'components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'components/ui/select';
import { COORDINATE_SYSTEMS } from '../utils/coordinate-systems';

interface CoordinateSystemSelectProps {
  value: string;
  defaultValue?: string;
  onChange: (value: string) => void;
}

export function CoordinateSystemSelect({
  value,
  defaultValue,
  onChange
}: CoordinateSystemSelectProps) {
  return (
    <div className="space-y-2">
      <Label>Coordinate System</Label>
      <Select
        value={value || defaultValue || ''}
        onValueChange={(value) => {
          console.debug('Changing coordinate system:', {
            from: value || defaultValue,
            to: value
          });
          onChange(value);
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
      {(value === COORDINATE_SYSTEMS.SWISS_LV95 || 
        value === COORDINATE_SYSTEMS.SWISS_LV03) && (
        <p className="text-sm text-muted-foreground">
          {value === COORDINATE_SYSTEMS.SWISS_LV95 ? 
            'Swiss LV95: 7-digit coordinates (E: 2,600,000m, N: 1,200,000m origin)' :
            'Swiss LV03: 6-digit coordinates (E: 600,000m, N: 200,000m origin)'}
        </p>
      )}
    </div>
  );
}
