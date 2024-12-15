import React, { useState, useCallback, useEffect } from 'react';
import Map, { Source, Layer, ViewStateChangeEvent } from 'react-map-gl';
import { Card, CardHeader, CardContent } from 'components/ui/card';
import { Button } from 'components/ui/button';
import { Alert, AlertDescription, AlertTitle } from 'components/ui/alert';
import type { GeoFileType, LoaderOptions, LoaderResult } from '../../types/geo';
import { loaderRegistry } from './loaders';
import { FormatSettings } from './components/format-settings';
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

  const [viewState, setViewState] = useState({
    longitude: 0,
    latitude: 0,
    zoom: 1,
  });

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

  useEffect(() => {
    if (analysis?.bounds) {
      const { minX, minY, maxX, maxY } = analysis.bounds;
      
      // Validate bounds values
      if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
        console.warn('Invalid bounds values detected, using default view');
        return;
      }

      const centerLng = (minX + maxX) / 2;
      const centerLat = (minY + maxY) / 2;

      const latZoom = Math.log2(360 / (maxY - minY)) - 1;
      const lngZoom = Math.log2(360 / (maxX - minX)) - 1;
      const zoom = Math.min(latZoom, lngZoom, 20);

      setViewState({
        latitude: centerLat,
        longitude: centerLng,
        zoom: zoom,
      });
    }
  }, [analysis]);

  const handleImport = async () => {
    const result = await loadFile(file);
    if (result) {
      onLoad(result);
    }
  };

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <h3 className="text-lg font-semibold">Import {file.name}</h3>
      </CardHeader>
      <CardContent>
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
              <Map
                {...viewState}
                onMove={(evt: ViewStateChangeEvent) => setViewState(evt.viewState)}
                mapStyle="mapbox://styles/mapbox/light-v11"
                mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
              >
                {analysis?.preview && (
                  <Source type="geojson" data={analysis.preview}>
                    <Layer
                      id="preview-layer"
                      type="circle"
                      paint={{
                        'circle-radius': 3,
                        'circle-color': '#007cbf',
                      }}
                    />
                  </Source>
                )}
              </Map>
            </div>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mt-4">
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

        <div className="flex justify-end space-x-2 mt-4">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={loading}>
            {loading ? 'Importing...' : 'Import'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
