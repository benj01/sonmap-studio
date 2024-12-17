import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent, CardFooter } from 'components/ui/card';
import { Button } from 'components/ui/button';
import { Alert, AlertDescription, AlertTitle } from 'components/ui/alert';
import { AlertCircle } from 'lucide-react';
import type { LoaderResult } from '../../types/geo';
import { useGeoLoader } from './hooks/use-geo-loader';
import { COORDINATE_SYSTEMS } from './utils/coordinate-systems';
import { DxfData } from './utils/dxf/types';

interface ShapeFile extends File {
  relatedFiles: {
    [key: string]: File
  }
}

interface GeoLoaderProps {
  file: File | ShapeFile;
  onLoad: (result: LoaderResult) => void;
  onCancel: () => void;
  onLogsUpdate?: (logs: string[]) => void;
  onDxfDataUpdate?: (data: DxfData | null) => void;
  onAnalysisUpdate?: (analysis: any) => void;
  onPreviewUpdate?: (preview: any) => void;
  selectedLayers?: string[];
}

interface ErrorState {
  title?: string;
  message: string;
  details?: string;
  severity: 'error' | 'warning';
}

export default function GeoLoader({ 
  file, 
  onLoad, 
  onCancel, 
  onLogsUpdate,
  onDxfDataUpdate,
  onAnalysisUpdate,
  onPreviewUpdate,
  selectedLayers 
}: GeoLoaderProps) {
  const {
    loading,
    error: loaderError,
    analysis,
    options,
    logs,
    dxfData,
    setOptions,
    analyzeFile,
    loadFile,
  } = useGeoLoader();

  const [error, setError] = useState<ErrorState | null>(null);

  // Update logs whenever they change
  useEffect(() => {
    onLogsUpdate?.(logs);
  }, [logs, onLogsUpdate]);

  // Update DXF data whenever it changes
  useEffect(() => {
    onDxfDataUpdate?.(dxfData);
  }, [dxfData, onDxfDataUpdate]);

  // Update analysis whenever it changes
  useEffect(() => {
    onAnalysisUpdate?.(analysis);
    if (analysis?.preview) {
      onPreviewUpdate?.(analysis.preview);
    }
  }, [analysis, onAnalysisUpdate, onPreviewUpdate]);

  // Update options when selectedLayers prop changes
  useEffect(() => {
    if (selectedLayers) {
      setOptions(prev => ({
        ...prev,
        selectedLayers,
        visibleLayers: selectedLayers
      }));
    }
  }, [selectedLayers, setOptions]);

  useEffect(() => {
    const isShapefile = file.name.toLowerCase().endsWith('.shp');
    const hasRelatedFiles = isShapefile && 'relatedFiles' in file;

    if (isShapefile && !hasRelatedFiles) {
      setError({
        title: 'Missing Components',
        message: 'Shapefile is missing required component files (.dbf, .shx)',
        severity: 'error'
      });
      return;
    }

    analyzeFile(file).catch(err => handleError(err));
  }, [file, analyzeFile]);

  useEffect(() => {
    if (loaderError) {
      handleError(new Error(loaderError));
    }
  }, [loaderError]);

  const handleError = (err: unknown) => {
    if (err instanceof Error) {
      const message = err.message.toLowerCase();
      let errorState: ErrorState;

      // Handle coordinate system errors
      if (message.includes('coordinate system') || message.includes('projection')) {
        errorState = {
          title: 'Coordinate System Error',
          message: 'Failed to detect or transform coordinate system.',
          details: err.message,
          severity: 'error'
        };
      }
      // Handle transformation errors
      else if (message.includes('transform')) {
        errorState = {
          title: 'Transformation Error',
          message: 'Failed to transform coordinates.',
          details: err.message,
          severity: 'error'
        };
      }
      // Handle shapefile errors
      else if (message.includes('.dbf') || message.includes('.shx') || message.includes('.shp')) {
        errorState = {
          title: 'Shapefile Error',
          message: 'Failed to load shapefile component files.',
          details: err.message,
          severity: 'error'
        };
      }
      // Handle DXF errors
      else if (message.includes('dxf')) {
        if (message.includes('parsing')) {
          errorState = {
            title: 'DXF Parsing Error',
            message: 'The DXF file could not be parsed correctly.',
            details: err.message,
            severity: 'error'
          };
        } else if (message.includes('analyze')) {
          errorState = {
            title: 'DXF Analysis Error',
            message: 'Failed to analyze the DXF file structure.',
            details: err.message,
            severity: 'error'
          };
        } else if (message.includes('coordinate')) {
          errorState = {
            title: 'Invalid Coordinates',
            message: 'The DXF file contains invalid coordinate values.',
            details: err.message,
            severity: 'error'
          };
        } else if (message.includes('bounds')) {
          errorState = {
            title: 'Invalid Bounds',
            message: 'Could not calculate valid bounds from the DXF file.',
            details: err.message,
            severity: 'error'
          };
        } else {
          errorState = {
            title: 'DXF Error',
            message: 'An error occurred while processing the DXF file.',
            details: err.message,
            severity: 'error'
          };
        }
      }
      // Handle general errors
      else {
        errorState = {
          message: err.message,
          severity: 'error'
        };
      }

      setError(errorState);
      onLogsUpdate?.([`Error: ${errorState.title || ''} - ${errorState.message}`]);
    } else {
      setError({
        message: 'An unexpected error occurred',
        severity: 'error'
      });
      onLogsUpdate?.(['Error: An unexpected error occurred']);
    }
  };

  const handleImport = async () => {
    try {
      const result = await loadFile(file);
      if (result) {
        // Log coordinate system information
        if (result.coordinateSystem) {
          if (result.coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
            onLogsUpdate?.([`Transformed coordinates from ${result.coordinateSystem} to ${COORDINATE_SYSTEMS.WGS84}`]);
          }
        }

        // Check for any transformation warnings
        const transformErrors = result.features.filter(f => f.properties?._transformError);
        if (transformErrors.length > 0) {
          setError({
            title: 'Transformation Warning',
            message: `${transformErrors.length} features had transformation errors`,
            details: 'Some features may not display correctly.',
            severity: 'warning'
          });
          onLogsUpdate?.([`Warning: ${transformErrors.length} features had transformation errors`]);
        }

        onLoad(result);
      }
    } catch (err) {
      handleError(err);
    }
  };

  // Map our severity levels to Alert variants
  const getAlertVariant = (severity: ErrorState['severity']) => {
    return severity === 'error' ? 'destructive' : 'default';
  };

  return (
    <div className="relative w-full max-w-4xl">
      <Card className="flex flex-col">
        <CardHeader>
          <h3 className="text-lg font-semibold">Import {file.name}</h3>
        </CardHeader>
        
        <CardContent className="flex-1 space-y-6">
          {error && (
            <Alert variant={getAlertVariant(error.severity)}>
              <AlertCircle className="h-4 w-4" />
              {error.title && <AlertTitle>{error.title}</AlertTitle>}
              <AlertDescription>
                {error.message}
                {error.details && (
                  <div className="mt-2 text-sm opacity-80">
                    {error.details}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>

        <CardFooter className="flex justify-end space-x-2 border-t pt-4">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button 
            onClick={handleImport} 
            disabled={loading || (error?.severity === 'error')}
          >
            {loading ? 'Importing...' : 'Import'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
