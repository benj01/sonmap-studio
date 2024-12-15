import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent, CardFooter } from 'components/ui/card';
import { Button } from 'components/ui/button';
import { Alert, AlertDescription, AlertTitle } from 'components/ui/alert';
import type { LoaderResult } from '../../types/geo';
import { FormatSettings } from './components/format-settings';
import { PreviewMap } from './components/preview-map';
import { useGeoLoader } from './hooks/use-geo-loader';

interface GeoLoaderProps {
  file: File;
  onLoad: (result: LoaderResult) => void;
  onCancel: () => void;
  onLogsUpdate?: (logs: string[]) => void;
}

export default function GeoLoader({ file, onLoad, onCancel, onLogsUpdate }: GeoLoaderProps) {
  const {
    loading,
    error: loaderError,
    analysis,
    options,
    logs,
    setOptions,
    analyzeFile,
    loadFile,
  } = useGeoLoader();

  const [error, setError] = useState<{
    title?: string;
    message: string;
    details?: string;
  } | null>(null);

  // Update logs whenever they change
  useEffect(() => {
    onLogsUpdate?.(logs);
  }, [logs, onLogsUpdate]);

  useEffect(() => {
    analyzeFile(file);
  }, [file, analyzeFile]);

  useEffect(() => {
    if (loaderError) {
      handleError(new Error(loaderError));
    }
  }, [loaderError]);

  const handleError = (err: unknown) => {
    if (err instanceof Error) {
      const message = err.message;
      
      // Parse DXF specific errors
      if (message.includes('DXF')) {
        if (message.includes('parsing')) {
          setError({
            title: 'DXF Parsing Error',
            message: 'The DXF file could not be parsed correctly.',
            details: message
          });
        } else if (message.includes('analyze')) {
          setError({
            title: 'DXF Analysis Error',
            message: 'Failed to analyze the DXF file structure.',
            details: message
          });
        } else if (message.includes('coordinate')) {
          setError({
            title: 'Invalid Coordinates',
            message: 'The DXF file contains invalid coordinate values.',
            details: message
          });
        } else if (message.includes('bounds')) {
          setError({
            title: 'Invalid Bounds',
            message: 'Could not calculate valid bounds from the DXF file.',
            details: message
          });
        } else {
          setError({
            title: 'DXF Error',
            message: 'An error occurred while processing the DXF file.',
            details: message
          });
        }
      } else {
        setError({
          message: message
        });
      }
    } else {
      setError({
        message: 'An unexpected error occurred'
      });
    }
  };

  const handleImport = async () => {
    const result = await loadFile(file);
    if (result) {
      onLoad(result);
    }
  };

  return (
    <div className="relative w-full max-w-4xl">
      <Card className="flex flex-col">
        <CardHeader>
          <h3 className="text-lg font-semibold">Import {file.name}</h3>
        </CardHeader>
        
        <CardContent className="flex-1 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            {/* Settings Panel */}
            <div className="space-y-4">
              <h4 className="font-medium">Settings</h4>
              <FormatSettings
                fileType={file.name.split('.').pop() || ''}
                analysis={analysis}
                options={options}
                onOptionsChange={setOptions}
              />
            </div>

            {/* Preview Map Panel */}
            <div className="space-y-4">
              <h4 className="font-medium">Preview</h4>
              <div className="h-96 relative">
                {analysis?.preview && (
                  <PreviewMap
                    preview={analysis.preview}
                    bounds={analysis.bounds}
                    coordinateSystem={analysis.coordinateSystem}
                    visibleLayers={options.visibleLayers}
                  />
                )}
              </div>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
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

        {/* Ensure footer is above map overlays */}
        <div className="relative z-50">
          <CardFooter className="flex justify-end space-x-2 border-t pt-4">
            <Button variant="outline" onClick={onCancel} className="relative z-50">
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={loading} className="relative z-50">
              {loading ? 'Importing...' : 'Import'}
            </Button>
          </CardFooter>
        </div>
      </Card>
    </div>
  );
}
