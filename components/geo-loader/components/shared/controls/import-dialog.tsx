import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from 'components/ui/dialog';
import { Feature } from 'geojson';
import { ControlProps } from '../types';
import { ProgressBar } from './progress-bar';
import { ErrorDisplay } from './error-display';
import { StatusMessage } from './status-message';
import { ActionButton } from './action-button';
import { LayerControl } from './layer-control';
import { useCache } from '../hooks/use-cache';
import { useValidation } from '../hooks/use-validation';
import { useLayer } from '../hooks/use-layer';

// Progress phases with descriptions
const PROGRESS_PHASES = {
  PARSE: {
    START: 0,
    END: 0.3,
    description: "Reading and parsing raw file data"
  },
  ANALYZE: {
    START: 0.3,
    END: 0.4,
    description: "Analyzing file structure and detecting coordinate system"
  },
  CONVERT: {
    START: 0.4,
    END: 1.0,
    description: "Converting to GeoJSON and transforming coordinates"
  }
} as const;

interface ImportDialogProps extends ControlProps {
  isOpen: boolean;
  onClose: () => void;
  file?: File;
  onImportComplete: (features: Feature[]) => Promise<void>;
  supportedFormats?: string[];
  maxFileSize?: number;
  defaultCoordinateSystem?: string;
  showPreview?: boolean;
  showLayerControl?: boolean;
  showCoordinateSystem?: boolean;
}

export function ImportDialog({
  isOpen,
  onClose,
  file,
  onImportComplete,
  supportedFormats = ['.geojson', '.json', '.kml', '.gpx', '.dxf'],
  maxFileSize = 50 * 1024 * 1024, // 50MB
  defaultCoordinateSystem = 'EPSG:4326',
  showPreview = true,
  showLayerControl = true,
  showCoordinateSystem = true,
  className = '',
  disabled = false
}: ImportDialogProps) {
  const [currentPhase, setCurrentPhase] = useState<keyof typeof PROGRESS_PHASES | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [coordinateSystem, setCoordinateSystem] = useState(defaultCoordinateSystem);
  const [pendingCoordinateSystem, setPendingCoordinateSystem] = useState<string | null>(null);

  // Initialize hooks
  const cache = useCache<Feature[]>();
  const validation = useValidation();
  const layer = useLayer();

  // Track file analysis state
  const analysisRef = useRef<any>(null);

  // Handle progress updates
  const handleProgress = useCallback((value: number) => {
    setProgress(value);
    
    // Determine current phase based on progress
    let phase: keyof typeof PROGRESS_PHASES;
    if (value <= PROGRESS_PHASES.PARSE.END) {
      phase = 'PARSE';
    } else if (value <= PROGRESS_PHASES.ANALYZE.END) {
      phase = 'ANALYZE';
    } else {
      phase = 'CONVERT';
    }

    if (phase !== currentPhase) {
      setCurrentPhase(phase);
    }
  }, [currentPhase]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setCurrentPhase(null);
      setLoading(false);
      setError(null);
      setProgress(0);
      setPendingCoordinateSystem(null);
      cache.clear();
      layer.layers.forEach(l => layer.removeLayer(l.id));
    }
  }, [isOpen, cache, layer]);

  // Validate and process file when it changes
  useEffect(() => {
    if (!file || !isOpen) return;

    const processFile = async () => {
      try {
        setLoading(true);
        setError(null);

        // Validate file
        if (!supportedFormats.some(format => 
          file.name.toLowerCase().endsWith(format.toLowerCase())
        )) {
          throw new Error(`Unsupported file format. Supported formats: ${supportedFormats.join(', ')}`);
        }

        if (file.size > maxFileSize) {
          throw new Error(`File too large. Maximum size: ${maxFileSize / 1024 / 1024}MB`);
        }

        // TODO: Implement file processing logic
        // This should:
        // 1. Parse the file based on its format
        // 2. Convert to GeoJSON
        // 3. Transform coordinates if needed
        // 4. Validate features
        // 5. Update layer state

      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    processFile();
  }, [file, isOpen, supportedFormats, maxFileSize]);

  // Handle coordinate system changes
  const handleCoordinateSystemChange = useCallback(async (newSystem: string) => {
    try {
      setPendingCoordinateSystem(newSystem);
      // TODO: Implement coordinate system transformation
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Handle import completion
  const handleImport = useCallback(async () => {
    if (!file) return;

    try {
      setLoading(true);
      setError(null);

      // Get visible and selected features
      const features = layer.visibleFeatures;

      // Validate features
      const validationResult = await validation.validateFeatures(features);
      if (!validationResult.isValid) {
        throw new Error(validationResult.errors[0].message);
      }

      // Complete import
      await onImportComplete(features);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [file, layer.visibleFeatures, validation, onImportComplete, onClose]);

  if (!file) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl h-[90vh]">
        <DialogTitle>Import {file.name}</DialogTitle>
        <DialogDescription>
          Configure import settings and preview the data
        </DialogDescription>

        <div className="flex flex-col h-full gap-4 pt-4">
          {/* Progress and Error Display */}
          {loading && (
            <ProgressBar
              info={{
                progress: progress,
                status: currentPhase ? PROGRESS_PHASES[currentPhase].description : 'Processing...'
              }}
            />
          )}

          {error && (
            <ErrorDisplay
              error={{
                message: error,
                code: 'IMPORT_ERROR'
              }}
            />
          )}

          {/* Layer Control */}
          {showLayerControl && layer.layers.length > 0 && (
            <LayerControl
              layers={layer.layers}
              onVisibilityChange={(id, visible) => layer.setLayerVisibility(id, visible)}
              onSelectionChange={(id, selected) => layer.setLayerSelection(id, selected)}
            />
          )}

          {/* Coordinate System Selection */}
          {showCoordinateSystem && (
            <div className="flex items-center gap-2">
              <span className="text-sm">Coordinate System:</span>
              <select
                value={pendingCoordinateSystem || coordinateSystem}
                onChange={(e) => handleCoordinateSystemChange(e.target.value)}
                disabled={loading || disabled}
                className="text-sm border rounded px-2 py-1"
              >
                <option value="EPSG:4326">WGS 84 (EPSG:4326)</option>
                <option value="EPSG:3857">Web Mercator (EPSG:3857)</option>
                {/* Add more coordinate systems as needed */}
              </select>
            </div>
          )}

          {/* Preview Section */}
          {showPreview && (
            <div className="flex-1 min-h-0">
              {/* TODO: Implement preview component */}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2">
            <ActionButton
              onClick={onClose}
              disabled={loading || disabled}
              variant="secondary"
            >
              Cancel
            </ActionButton>
            <ActionButton
              onClick={handleImport}
              disabled={loading || disabled || !!error}
              loading={loading}
            >
              Import
            </ActionButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
