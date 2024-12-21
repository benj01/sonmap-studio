import React, { useEffect, useState } from 'react';
import { Label } from 'components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'components/ui/select';
import { 
  COORDINATE_SYSTEMS, 
  CoordinateSystem, 
  isSwissSystem, 
  isWGS84System,
  isValidPoint,
  isWGS84Range
} from '../types/coordinates';
import { ICoordinateTransformer } from '../core/processors/base/interfaces';
import { cn } from 'utils/cn';
import { Info, AlertTriangle } from 'lucide-react';

interface CoordinateSystemSelectProps {
  value: CoordinateSystem;
  defaultValue?: CoordinateSystem;
  onChange: (value: CoordinateSystem) => void;
  highlightValue?: CoordinateSystem;
  transformer?: ICoordinateTransformer;
  /** Sample point to validate coordinate system (optional) */
  samplePoint?: { x: number; y: number };
  /** Called when validation status changes */
  onValidationChange?: (isValid: boolean) => void;
}

export function CoordinateSystemSelect({
  value,
  defaultValue,
  onChange,
  highlightValue,
  transformer,
  samplePoint,
  onValidationChange
}: CoordinateSystemSelectProps) {
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  // Validate coordinate system when it changes
  useEffect(() => {
    async function validateSystem() {
      if (!transformer || !samplePoint) return;

      setIsValidating(true);
      setValidationError(null);

      try {
        // Basic point validation
        if (!isValidPoint(samplePoint)) {
          throw new Error('Invalid coordinate point format');
        }

        // Range validation for WGS84
        if (isWGS84System(value) && !isWGS84Range(samplePoint)) {
          throw new Error('Coordinates out of WGS84 range');
        }

        // Transformation validation
        if (transformer) {
          await transformer.transformPoint(samplePoint);
        }

        onValidationChange?.(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Validation failed';
        setValidationError(message);
        onValidationChange?.(false);
      } finally {
        setIsValidating(false);
      }
    }

    validateSystem();
  }, [value, transformer, samplePoint, onValidationChange]);

  const currentValue = value || defaultValue || COORDINATE_SYSTEMS.NONE;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Coordinate System</Label>
        {highlightValue && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" />
            Detected system: {highlightValue}
          </div>
        )}
      </div>
      <Select
        value={currentValue}
        onValueChange={(newValue: CoordinateSystem) => {
          setValidationError(null);
          onChange(newValue);
        }}
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
      {currentValue === COORDINATE_SYSTEMS.NONE && (
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Local coordinates will be imported without transformation.</p>
          <p>Select a coordinate system if you know the source projection.</p>
        </div>
      )}
      {currentValue === COORDINATE_SYSTEMS.WGS84 && (
        <div className="text-sm text-muted-foreground space-y-1">
          <p>WGS84: Global coordinate system used by GPS.</p>
          <p>Coordinates are in degrees (longitude: -180 to 180, latitude: -90 to 90).</p>
        </div>
      )}
      {currentValue === COORDINATE_SYSTEMS.SWISS_LV95 && (
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Swiss LV95: Modern Swiss coordinate system (since 1995).</p>
          <p>7-digit coordinates (E: 2,600,000m, N: 1,200,000m origin).</p>
        </div>
      )}
      {currentValue === COORDINATE_SYSTEMS.SWISS_LV03 && (
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Swiss LV03: Legacy Swiss coordinate system (before 1995).</p>
          <p>6-digit coordinates (E: 600,000m, N: 200,000m origin).</p>
        </div>
      )}

      {/* Validation and detection messages */}
      {isValidating && (
        <div className="text-sm text-muted-foreground">
          Validating coordinate system...
        </div>
      )}
      {validationError && (
        <div className="text-sm text-destructive flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          {validationError}
        </div>
      )}
      {highlightValue && highlightValue === currentValue && (
        <div className="text-sm text-primary flex items-center gap-1">
          <Info className="h-3 w-3" />
          This coordinate system was automatically detected based on the data.
        </div>
      )}
      {highlightValue && highlightValue !== currentValue && (
        <div className="text-sm text-warning flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          You've selected a different system than what was detected. Make sure this is intended.
        </div>
      )}
    </div>
  );
}
