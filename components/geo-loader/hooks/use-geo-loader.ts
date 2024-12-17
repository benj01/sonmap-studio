import { useState, useCallback, useEffect, useRef } from 'react';
import { LoaderResult, AnalyzeResult } from '../../../types/geo';
import dxfLoader from '../loaders/dxf';
import shapefileLoader from '../loaders/shapefile';
import csvLoader from '../loaders/csv-xyz';
import { DxfData } from '../utils/dxf/types';

interface LoaderOptions {
  coordinateSystem?: string;
  selectedLayers?: string[];
  visibleLayers?: string[];
}

export function useGeoLoader() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [options, setOptions] = useState<LoaderOptions>({
    selectedLayers: [],
    visibleLayers: []
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [dxfData, setDxfData] = useState<DxfData | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  
  // Use a ref to track if initial analysis is complete
  const initialAnalysisComplete = useRef(false);
  const lastAnalyzedCoordinateSystem = useRef<string | undefined>(undefined);

  const addLog = useCallback((message: string) => {
    setLogs(prev => [...prev, message]);
  }, []);

  const getLoader = useCallback((file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'dxf':
        return dxfLoader;
      case 'shp':
        return shapefileLoader;
      case 'csv':
      case 'xyz':
        return csvLoader;
      default:
        throw new Error(`Unsupported file type: ${extension}`);
    }
  }, []);

  const analyzeFile = useCallback(async (file: File) => {
    // Skip analysis if we've already analyzed this file with the same coordinate system
    if (initialAnalysisComplete.current && 
        file === currentFile && 
        options.coordinateSystem === lastAnalyzedCoordinateSystem.current) {
      return analysis;
    }

    setLoading(true);
    setError(null);
    
    // Only clear logs on initial analysis
    if (!initialAnalysisComplete.current) {
      setLogs([]);
    }
    
    try {
      const loader = getLoader(file);
      addLog(`Analyzing ${file.name}...`);
      const result = await loader.analyze(file);

      // Update the result with the current coordinate system if set
      if (options.coordinateSystem) {
        result.coordinateSystem = options.coordinateSystem;
      }
      
      setAnalysis(result);
      setCurrentFile(file);
      lastAnalyzedCoordinateSystem.current = options.coordinateSystem;
      
      // If it's a DXF file and has DXF data, update the state
      if (file.name.toLowerCase().endsWith('.dxf') && result.dxfData) {
        setDxfData(result.dxfData);
      }
      
      // Only update layer selections on initial analysis
      if (!initialAnalysisComplete.current) {
        setOptions(prev => ({
          ...prev,
          selectedLayers: result.layers || [],
          visibleLayers: result.layers || []
        }));
      }

      addLog('Analysis complete');
      initialAnalysisComplete.current = true;
      return result;
    } catch (err) {
      const error = err as Error;
      setError(error.message);
      addLog(`Error: ${error.message}`);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [addLog, getLoader, options.coordinateSystem, currentFile, analysis]);

  const loadFile = useCallback(async (file: File): Promise<LoaderResult> => {
    setLoading(true);
    setError(null);
    try {
      const loader = getLoader(file);
      addLog(`Loading ${file.name}...`);
      const result = await loader.load(file, {
        coordinateSystem: options.coordinateSystem,
        selectedLayers: options.selectedLayers
      });
      addLog('Load complete');
      return result;
    } catch (err) {
      const error = err as Error;
      setError(error.message);
      addLog(`Error: ${error.message}`);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [addLog, getLoader, options.coordinateSystem, options.selectedLayers]);

  // Update analysis when coordinate system changes
  useEffect(() => {
    if (currentFile && options.coordinateSystem && initialAnalysisComplete.current) {
      if (options.coordinateSystem !== lastAnalyzedCoordinateSystem.current) {
        analyzeFile(currentFile).catch(console.error);
      }
    }
  }, [currentFile, options.coordinateSystem, analyzeFile]);

  // Reset initial analysis flag when file changes
  useEffect(() => {
    if (currentFile) {
      initialAnalysisComplete.current = false;
      lastAnalyzedCoordinateSystem.current = undefined;
    }
  }, [currentFile]);

  return {
    loading,
    error,
    analysis,
    options,
    logs,
    dxfData,
    setOptions,
    analyzeFile,
    loadFile
  };
}
