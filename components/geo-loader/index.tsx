import React, { useState, useCallback } from 'react';
import Map, { Source, Layer } from 'react-map-gl';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { GeoFileType, LoaderOptions, LoaderResult } from '../types/geo';

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

  // Map view state
  const [viewState, setViewState] = useState({
    longitude: 0,
    latitude: 0,
    zoom: 1
  });

  // Handle file analysis
  const analyzeFile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loader = await getLoaderForFile(file);
      const analysisResult = await loader.analyze(file);
      setAnalysis(analysisResult);
      
      // If bounds are available, adjust map view
      if (analysisResult.bounds) {
        // Convert bounds to center point and zoom level
        // Implementation needed
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze file');
    } finally {
      setLoading(false);
    }
  }, [file]);

  // Handle import with current options
  const handleImport = async () => {
    setLoading(true);
    setError(null);
    try {
      const loader = await getLoaderForFile(file);
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
            {/* Coordinate System Settings */}
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">
                  Source Coordinate System
                </label>
                <Input
                  value={options.coordinateSystem || ''}
                  onChange={(e) => setOptions({
                    ...options,
                    coordinateSystem: e.target.value
                  })}
                  placeholder={analysis?.coordinateSystem || 'EPSG:4326'}
                />
              </div>

              {/* Layer Selection (for DXF/SHP) */}
              {analysis?.layers && (
                <div>
                  <label className="text-sm font-medium">Layers</label>
                  <div className="space-y-2">
                    {analysis.layers.map(layer => (
                      <div key={layer} className="flex items-center space-x-2">
                        <Checkbox
                          checked={options.selectedLayers?.includes(layer)}
                          onCheckedChange={(checked) => {
                            const newLayers = checked
                              ? [...(options.selectedLayers || []), layer]
                              : options.selectedLayers?.filter(l => l !== layer);
                            setOptions({ ...options, selectedLayers: newLayers });
                          }}
                        />
                        <label>{layer}</label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CSV/TXT specific options */}
              {(file.name.endsWith('.csv') || file.name.endsWith('.txt')) && (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Delimiter</label>
                    <Input
                      value={options.delimiter || ''}
                      onChange={(e) => setOptions({
                        ...options,
                        delimiter: e.target.value
                      })}
                      placeholder=","
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Skip Rows</label>
                    <Input
                      type="number"
                      value={options.skipRows || 0}
                      onChange={(e) => setOptions({
                        ...options,
                        skipRows: parseInt(e.target.value)
                      })}
                    />
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="preview">
            <div className="h-96 relative">
              <Map
                {...viewState}
                onMove={evt => setViewState(evt.viewState)}
                mapStyle="mapbox://styles/mapbox/light-v11"
              >
                {analysis?.preview && (
                  <Source
                    type="geojson"
                    data={analysis.preview}
                  >
                    <Layer
                      id="preview-layer"
                      type="circle"
                      paint={{
                        'circle-radius': 3,
                        'circle-color': '#007cbf'
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