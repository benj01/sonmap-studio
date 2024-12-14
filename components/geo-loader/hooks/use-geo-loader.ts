// components/geo-loader/hooks/use-geo-loader.ts

import { useState, useCallback } from 'react';
import { loaderRegistry } from '../loaders';
import type { LoaderOptions, LoaderResult } from '../../../types/geo';

interface UseGeoLoaderResult {
  loading: boolean;
  error: string | null;
  analysis: any | null;
  options: LoaderOptions;
  logs: string[];
  setOptions: (options: LoaderOptions) => void;
  analyzeFile: (file: File) => Promise<void>;
  loadFile: (file: File) => Promise<LoaderResult | null>;
  validateFile: (file: File) => Promise<boolean>;
  supportedExtensions: string[];
}

export function useGeoLoader(): UseGeoLoaderResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  // Initialize options with sensible defaults, including `importAttributes`
  const [options, setOptions] = useState<LoaderOptions>({
    coordinateSystem: 'EPSG:4326', // Default to WGS84
    importAttributes: false, // Default for shapefiles
  });

  const [supportedExtensions, setSupportedExtensions] = useState<string[]>([]);

  const addLog = useCallback((message: string) => {
    setLogs(prev => [...prev, `[${new Date().toISOString()}] ${message}`]);
  }, []);

  // Get supported extensions on mount
  useState(() => {
    loaderRegistry.getSupportedExtensions().then(setSupportedExtensions);
  });

  const validateFile = useCallback(async (file: File): Promise<boolean> => {
    setError(null);
    const validation = await loaderRegistry.validateFile(file);
    
    if (!validation.valid) {
      const errorMsg = validation.error || 'Invalid file';
      setError(errorMsg);
      addLog(`Validation failed: ${errorMsg}`);
      return false;
    }
    
    addLog(`File validation successful: ${file.name}`);
    return true;
  }, [addLog]);

  const analyzeFile = useCallback(async (file: File) => {
    if (!await validateFile(file)) return;

    setLoading(true);
    setError(null);
    try {
      addLog(`Starting analysis of file: ${file.name}`);
      const loader = await loaderRegistry.getLoaderForFile(file);
      if (!loader) {
        throw new Error('No suitable loader found for this file type');
      }

      const analysisResult = await loader.analyze(file);
      setAnalysis(analysisResult);
      addLog(`Analysis complete. Found ${analysisResult?.layers?.length || 0} layers`);

      // Set recommended options based on file type and analysis
      const recommendedOptions = await loaderRegistry.getRecommendedOptions(file);

      // Merge recommended options with existing options
      setOptions((prevOptions) => ({
        ...prevOptions,
        ...recommendedOptions,
      }));
      addLog('Updated import options with recommended settings');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to analyze file';
      setError(errorMsg);
      addLog(`Analysis error: ${errorMsg}`);
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, [validateFile, addLog]);

  const loadFile = useCallback(async (file: File): Promise<LoaderResult | null> => {
    if (!await validateFile(file)) return null;

    setLoading(true);
    setError(null);
    try {
      addLog(`Starting import of file: ${file.name}`);
      const loader = await loaderRegistry.getLoaderForFile(file);
      if (!loader) {
        throw new Error('No suitable loader found for this file type');
      }

      // Load the file with the current options
      const result = await loader.load(file, options);
      addLog(`Import complete. Processed ${result.features.length} features`);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load file';
      setError(errorMsg);
      addLog(`Import error: ${errorMsg}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [options, validateFile, addLog]);

  return {
    loading,
    error,
    analysis,
    options,
    logs,
    setOptions,
    analyzeFile,
    loadFile,
    validateFile,
    supportedExtensions,
  };
}
