import { useState, useCallback, useRef } from 'react';
import dxfLoader from '../loaders/dxf';
import shapefileLoader from '../loaders/shapefile';
import csvXyzLoader from '../loaders/csv-xyz';
import { optimizePoints } from '../utils/optimization';
import { COORDINATE_SYSTEMS } from '../utils/coordinate-systems';
import type { LoaderOptions, LoaderResult, GeoFeatureCollection, AnalyzeResult } from '../../../types/geo';

interface ShapeFile extends File {
  relatedFiles: {
    [key: string]: File
  }
}

const loaderMap = {
  dxf: dxfLoader,
  shp: shapefileLoader,
  'csv-zyz': csvXyzLoader,
  xyz: csvXyzLoader,
  txt: csvXyzLoader,
} as const;

type AnalysisState = (AnalyzeResult & {
  statistics?: LoaderResult['statistics'];
}) | null;

export function useGeoLoader() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisState>(null);
  const [options, setOptions] = useState<LoaderOptions>({
    selectedLayers: [],
    visibleLayers: []
  });
  const [logs, setLogs] = useState<string[]>([]);
  const fileRef = useRef<File | ShapeFile | null>(null);

  const log = useCallback((message: string, type: 'info' | 'warning' | 'error' = 'info') => {
    const prefix = type === 'error' ? '❌ Error: ' : 
                  type === 'warning' ? '⚠️ Warning: ' : 
                  '📝 ';
    setLogs((prevLogs) => [...prevLogs, `${prefix}${message}`]);
  }, []);

  const verifyShapefileComponents = useCallback((file: ShapeFile) => {
    const missingComponents: string[] = [];
    
    if (!file.relatedFiles['.dbf']) {
      missingComponents.push('.dbf');
    }
    if (!file.relatedFiles['.shx']) {
      missingComponents.push('.shx');
    }

    if (missingComponents.length > 0) {
      throw new Error(`Missing required shapefile components: ${missingComponents.join(', ')}`);
    }

    log('Verified shapefile components are present');
  }, [log]);

  const analyzeFile = useCallback(async (file: File | ShapeFile) => {
    fileRef.current = file;
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setLogs([]);

    const fileType = file.name.split('.').pop()?.toLowerCase() as keyof typeof loaderMap;
    const loader = loaderMap[fileType];

    if (!loader) {
      const error = `Unsupported file type: ${fileType}`;
      setError(error);
      log(error, 'error');
      setLoading(false);
      return;
    }

    try {
      log(`Analyzing ${file.name}...`);

      // For shapefiles, verify components are present
      if (fileType === 'shp') {
        verifyShapefileComponents(file as ShapeFile);
      }

      const analysisResult = await loader.analyze(file);
      
      // Log coordinate system information
      if (analysisResult.coordinateSystem) {
        if (analysisResult.coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
          log(`Detected coordinate system: ${analysisResult.coordinateSystem}`);
          log(`Coordinates will be transformed to ${COORDINATE_SYSTEMS.WGS84}`);
        } else {
          log(`Using coordinate system: ${COORDINATE_SYSTEMS.WGS84}`);
        }
      }

      // Initialize both selected and visible layers
      setOptions(prev => ({
        ...prev,
        selectedLayers: analysisResult.layers,
        visibleLayers: analysisResult.layers,
        coordinateSystem: analysisResult.coordinateSystem
      }));
      
      setAnalysis(analysisResult);
      log(`Analysis complete - Found ${analysisResult.layers.length} layers`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to analyze file';
      setError(errorMessage);
      log(errorMessage, 'error');
      console.error('Analysis error:', err);
    } finally {
      setLoading(false);
    }
  }, [log, verifyShapefileComponents]);

  const loadFile = useCallback(async (file: File | ShapeFile, loadOptions?: LoaderOptions): Promise<LoaderResult | null> => {
    setLoading(true);
    setError(null);
    setLogs([]);

    const fileType = file.name.split('.').pop()?.toLowerCase() as keyof typeof loaderMap;
    const loader = loaderMap[fileType];

    if (!loader) {
      const error = `Unsupported file type: ${fileType}`;
      setError(error);
      log(error, 'error');
      setLoading(false);
      return null;
    }

    try {
      log(`Loading ${file.name}...`);

      // For shapefiles, verify components are present
      if (fileType === 'shp') {
        verifyShapefileComponents(file as ShapeFile);
      }

      const mergedOptions = { ...options, ...loadOptions };
      
      // Log coordinate system information
      if (mergedOptions.coordinateSystem) {
        log(`Using specified coordinate system: ${mergedOptions.coordinateSystem}`);
      }

      const result = await loader.load(file, mergedOptions);

      // Log transformation results
      const transformErrors = result.features.filter(f => f.properties?._transformError);
      if (transformErrors.length > 0) {
        log(`${transformErrors.length} features had transformation errors`, 'warning');
      }

      // Handle point cloud optimization
      if (['xyz', 'csv', 'txt'].includes(fileType) && 
          mergedOptions.simplificationTolerance && 
          mergedOptions.simplificationTolerance > 0) {
        log(`Optimizing point cloud with tolerance ${mergedOptions.simplificationTolerance}...`);
        result.features = optimizePoints(result.features, mergedOptions.simplificationTolerance);
        log(`Point cloud optimization complete - ${result.features.length} points remaining`);
      }

      // Log final statistics
      log(`File loaded successfully:`);
      log(`- ${result.features.length} total features`);
      if (result.statistics?.featureTypes) {
        Object.entries(result.statistics.featureTypes).forEach(([type, count]) => {
          log(`- ${count} ${type} features`);
        });
      }

      return result;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load file';
      setError(errorMessage);
      log(errorMessage, 'error');
      console.error('Load error:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [options, log, verifyShapefileComponents]);

  const toggleLayerVisibility = useCallback((layer: string) => {
    setOptions(prev => ({
      ...prev,
      visibleLayers: prev.visibleLayers?.includes(layer)
        ? prev.visibleLayers.filter(l => l !== layer)
        : [...(prev.visibleLayers || []), layer]
    }));
  }, []);

  const toggleLayerSelection = useCallback((layer: string) => {
    setOptions(prev => ({
      ...prev,
      selectedLayers: prev.selectedLayers?.includes(layer)
        ? prev.selectedLayers.filter(l => l !== layer)
        : [...(prev.selectedLayers || []), layer]
    }));
  }, []);

  return {
    loading,
    error,
    analysis,
    options,
    logs,
    setOptions,
    analyzeFile,
    loadFile,
    toggleLayerVisibility,
    toggleLayerSelection
  };
}
