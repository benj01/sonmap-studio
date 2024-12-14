import React, { useState, useCallback, useEffect } from 'react';
import Map, { Source, Layer, ViewStateChangeEvent } from 'react-map-gl';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { GeoFileType, LoaderOptions, LoaderResult } from '../../types/geo';
import { loaderRegistry } from './loaders';
import { FormatSettings } from './components/format-settings';

interface GeoLoaderProps {
  file: File;
  onLoad: (result: LoaderResult) => void;
  onCancel: () => void;
}

export default function GeoLoader({ file, onLoad, onCancel }: GeoLoaderProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<{
    layers?: string[];
    coordinateSystem?: string;
    bounds?: LoaderResult['bounds'];
    preview?: any;
  } | null>(null);

  const [options, setOptions] = useState<LoaderOptions>({
    selectedLayers: [],
    coordinateSystem: undefined,
    targetSystem: 'EPSG:4326', // Default to WGS84
  });

  const [viewState, setViewState] = useState({
    longitude: 0,
    latitude: 0,
    zoom: 1,
  });

  useEffect(() => {
    analyzeFile();
  }, [file]);

  const analyzeFile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { valid, loader, error: validationError } = await loaderRegistry.validateFile(file);

      if (!valid || !loader) {
        throw new Error(validationError || 'Unsupported file type');
      }

      const recommendedOptions = await loaderRegistry.getRecommendedOptions(file);
      setOptions((prev) => ({ ...prev, ...recommendedOptions }));

      const analysisResult = await loader.analyze(file);
      setAnalysis(analysisResult);

      if (analysisResult.bounds) {
        const { minX, minY, maxX, maxY } = analysisResult.bounds;
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze file');
    } finally {
      setLoading(false);
    }
  }, [file]);

  const handleImport = async () => {
    setLoading(true);
    setError(null);
    try {
      const { loader } = await loaderRegistry.validateFile(file);
      if (!loader) {
        throw new Error('No suitable loader found for this file');
      }

      const result = await loader.load(file, options);
      onLoad(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import file');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <h3 className="text-lg font-semibold">Import {file.name}</h3>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="settings">
          <TabsList>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>

          <TabsContent value="settings">
            <FormatSettings
              fileType={file.name.split('.').pop() || ''}
              analysis={analysis}
              options={options}
              onOptionsChange={setOptions}
            />
          </TabsContent>

          <TabsContent value="preview">
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
          </TabsContent>
        </Tabs>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
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
