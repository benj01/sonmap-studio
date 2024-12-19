import React from 'react';
import { Label } from 'components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'components/ui/select';
import { COORDINATE_SYSTEMS } from '../types/coordinates';
import { cn } from 'utils/cn';
import { Info } from 'lucide-react';
import { ErrorReporter } from '../utils/errors';

interface CoordinateSystemSelectProps {
  value: string;
  defaultValue?: string;
  onChange: (value: string) => void;
  highlightValue?: string;
  errorReporter: ErrorReporter;
}

export function CoordinateSystemSelect({
  value,
  defaultValue,
  onChange,
  highlightValue,
  errorReporter
}: CoordinateSystemSelectProps) {
  // Validate the current value
  const validateCoordinateSystem = (system: string) => {
    if (!Object.values(COORDINATE_SYSTEMS).includes(system as any)) {
      errorReporter.error('Invalid coordinate system selected', undefined, {
        system,
        availableSystems: Object.values(COORDINATE_SYSTEMS)
      });
      return false;
    }
    return true;
  };

  // Handle coordinate system change
  const handleChange = (newValue: string) => {
    if (!validateCoordinateSystem(newValue)) {
      return;
    }

    errorReporter.info('Changing coordinate system', {
      from: value || defaultValue,
      to: newValue
    });

    // Warn if changing from detected system
    if (highlightValue && highlightValue !== newValue) {
      errorReporter.warn('Selected coordinate system differs from detected system', {
        detected: highlightValue,
        selected: newValue
      });
    }

    onChange(newValue);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Coordinate System</Label>
        {highlightValue && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" />
            Detected system
          </div>
        )}
      </div>
      <Select
        value={value || defaultValue || ''}
        onValueChange={handleChange}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select coordinate system" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem 
            value={COORDINATE_SYSTEMS.NONE}
            className={cn(
              "flex items-center gap-2",
              highlightValue === COORDINATE_SYSTEMS.NONE && "bg-accent text-accent-foreground"
            )}
          >
            <span className="flex-grow">None (Local Coordinates)</span>
            {highlightValue === COORDINATE_SYSTEMS.NONE && (
              <span className="text-xs bg-primary/10 px-1.5 py-0.5 rounded">Detected</span>
            )}
          </SelectItem>
          <SelectItem 
            value={COORDINATE_SYSTEMS.WGS84}
            className={cn(
              "flex items-center gap-2",
              highlightValue === COORDINATE_SYSTEMS.WGS84 && "bg-accent text-accent-foreground"
            )}
          >
            <span className="flex-grow">WGS84 (EPSG:4326)</span>
            {highlightValue === COORDINATE_SYSTEMS.WGS84 && (
              <span className="text-xs bg-primary/10 px-1.5 py-0.5 rounded">Detected</span>
            )}
          </SelectItem>
          <SelectItem 
            value={COORDINATE_SYSTEMS.SWISS_LV95}
            className={cn(
              "flex items-center gap-2",
              highlightValue === COORDINATE_SYSTEMS.SWISS_LV95 && "bg-accent text-accent-foreground"
            )}
          >
            <span className="flex-grow">Swiss LV95 (EPSG:2056) - New</span>
            {highlightValue === COORDINATE_SYSTEMS.SWISS_LV95 && (
              <span className="text-xs bg-primary/10 px-1.5 py-0.5 rounded">Detected</span>
            )}
          </SelectItem>
          <SelectItem 
            value={COORDINATE_SYSTEMS.SWISS_LV03}
            className={cn(
              "flex items-center gap-2",
              highlightValue === COORDINATE_SYSTEMS.SWISS_LV03 && "bg-accent text-accent-foreground"
            )}
          >
            <span className="flex-grow">Swiss LV03 (EPSG:21781) - Old</span>
            {highlightValue === COORDINATE_SYSTEMS.SWISS_LV03 && (
              <span className="text-xs bg-primary/10 px-1.5 py-0.5 rounded">Detected</span>
            )}
          </SelectItem>
        </SelectContent>
      </Select>

      {/* Help text for different coordinate systems */}
      {value === COORDINATE_SYSTEMS.NONE && (
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Local coordinates will be imported without transformation.</p>
          <p>Select a coordinate system if you know the source projection.</p>
        </div>
      )}
      {value === COORDINATE_SYSTEMS.WGS84 && (
        <div className="text-sm text-muted-foreground space-y-1">
          <p>WGS84: Global coordinate system used by GPS.</p>
          <p>Coordinates are in degrees (longitude: -180 to 180, latitude: -90 to 90).</p>
        </div>
      )}
      {value === COORDINATE_SYSTEMS.SWISS_LV95 && (
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Swiss LV95: Modern Swiss coordinate system (since 1995).</p>
          <p>7-digit coordinates (E: 2,600,000m, N: 1,200,000m origin).</p>
        </div>
      )}
      {value === COORDINATE_SYSTEMS.SWISS_LV03 && (
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Swiss LV03: Legacy Swiss coordinate system (before 1995).</p>
          <p>6-digit coordinates (E: 600,000m, N: 200,000m origin).</p>
        </div>
      )}

      {/* Show when coordinate system was detected */}
      {highlightValue && highlightValue === value && (
        <div className="text-sm text-primary">
          This coordinate system was automatically detected based on the data.
        </div>
      )}
      {highlightValue && highlightValue !== value && (
        <div className="text-sm text-warning">
          You've selected a different system than what was detected. Make sure this is intended.
        </div>
      )}
    </div>
  );
}
