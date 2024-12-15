import { useState, useCallback, useRef, useEffect } from 'react';
import dxfLoader from '../loaders/dxf';
import shapefileLoader from '../loaders/shapefile';
import csvXyzLoader from '../loaders/csv-zyz';
import { optimizePoints } from '../utils/optimization';
import type { GeoFileType, LoaderOptions, LoaderResult, GeoFeatureCollection } from '../../../types/geo';

const loaderMap = {
  dxf: dxfLoader,
  shp: shapefileLoader,
  'csv-zyz': csvXyzLoader,
  xyz: csvXyzLoader,
  txt: csvXyzLoader,
} as const;

type AnalysisState = {
  layers?: string[];
  coordinateSystem?: string;
  bounds?: LoaderResult['bounds'];
  preview?: GeoFeatureCollection;
  statistics?: LoaderResult['statistics'];
} | null;

export function useGeoLoader() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisState>(null);
  const [options, setOptions] = useState<LoaderOptions>({});
  const [logs, setLogs] = useState<string[]>([]);
  const fileRef = useRef<File | null>(null);

  const log = (message: string) => {
    setLogs((prevLogs) => [...prevLogs, message]);
  };

  const analyzeFile = useCallback(async (file: File) => {
    fileRef.current = file;
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setLogs([]);

    const fileType = file.name.split('.').pop()?.toLowerCase() as keyof typeof loaderMap;
    const loader = loaderMap[fileType];

    if (!loader) {
      setError(`Unsupported file type: ${fileType}`);
      setLoading(false);
      return;
    }

    try {
      log(`Analyzing ${file.name}...`);
      const analysisResult = await loader.analyze(file);
      setAnalysis(analysisResult);
      log(`Analysis complete.`);
    } catch (err: any) {
        setError(err.message || 'Failed to analyze file');
        console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

    // Re-analyze file when options change, specifically selectedLayers
    useEffect(() => {
        if (fileRef.current && options.selectedLayers) {
            analyzeFile(fileRef.current);
        }
    }, [options, analyzeFile]);

  const loadFile = useCallback(async (file: File, loadOptions?: LoaderOptions): Promise<LoaderResult | null> => {
    setLoading(true);
    setError(null);
    setLogs([]);

    const fileType = file.name.split('.').pop()?.toLowerCase() as keyof typeof loaderMap;
    const loader = loaderMap[fileType];

    if (!loader) {
      setError(`Unsupported file type: ${fileType}`);
      setLoading(false);
      return null;
    }

    try {
      log(`Loading ${file.name}...`);
      const result = await loader.load(file, { ...options, ...loadOptions });

      if (['xyz', 'csv', 'txt'].includes(fileType) && options.simplificationTolerance && options.simplificationTolerance > 0) {
        log(`Optimizing point cloud with tolerance ${options.simplificationTolerance}...`);
        result.features = optimizePoints(result.features, options.simplificationTolerance);
        log(`Point cloud optimization complete.`);
      }

      log(`File loaded successfully.`);
      return result;
    } catch (err: any) {
      setError(err.message || 'Failed to load file');
      console.error(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [options, log]);

  return {
    loading,
    error,
    analysis,
    options,
    logs,
    setOptions,
    analyzeFile,
    loadFile,
  };
}
