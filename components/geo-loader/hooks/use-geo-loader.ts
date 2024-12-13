// components/geo-loader/hooks/use-geo-loader.ts

import { useState, useCallback } from 'react';
import { loaderRegistry } from '../loaders';
import type { LoaderOptions, LoaderResult } from '../../../types/geo';

interface UseGeoLoaderResult {
  loading: boolean;
  error: string | null;
  analysis: any | null;
  options: LoaderOptions;
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
  const [options, setOptions] = useState<LoaderOptions>({});
  const [supportedExtensions, setSupportedExtensions] = useState<string[]>([]);

  // Get supported extensions on mount
  useState(() => {
    loaderRegistry.getSupportedExtensions().then(setSupportedExtensions);
  });

  const validateFile = useCallback(async (file: File): Promise<boolean> => {
    setError(null);
    const validation = await loaderRegistry.validateFile(file);
    
    if (!validation.valid) {
      setError(validation.error || 'Invalid file');
      return false;
    }
    
    return true;
  }, []);

  const analyzeFile = useCallback(async (file: File) => {
    if (!await validateFile(file)) return;

    setLoading(true);
    setError(null);
    try {
      const loader = await loaderRegistry.getLoaderForFile(file);
      if (!loader) {
        throw new Error('No suitable loader found for this file type');
      }

      const analysisResult = await loader.analyze(file);
      setAnalysis(analysisResult);

      // Set recommended options based on file type and analysis
      const recommendedOptions = await loaderRegistry.getRecommendedOptions(file);
      setOptions(recommendedOptions);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze file');
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, [validateFile]);

  const loadFile = useCallback(async (file: File): Promise<LoaderResult | null> => {
    if (!await validateFile(file)) return null;

    setLoading(true);
    setError(null);
    try {
      const loader = await loaderRegistry.getLoaderForFile(file);
      if (!loader) {
        throw new Error('No suitable loader found for this file type');
      }

      return await loader.load(file, options);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file');
      return null;
    } finally {
      setLoading(false);
    }
  }, [options, validateFile]);

  return {
    loading,
    error,
    analysis,
    options,
    setOptions,
    analyzeFile,
    loadFile,
    validateFile,
    supportedExtensions,
  };
}