import { useState, useCallback, useEffect, useRef } from 'react';
import { LoaderResult, AnalyzeResult, LoaderOptions } from '../../../types/geo';
import dxfLoader from '../loaders/dxf';
import shapefileLoader from '../loaders/shapefile';
import csvLoader from '../loaders/csv-xyz';
import { DxfData } from '../utils/dxf/types';
import { CoordinateSystem, COORDINATE_SYSTEMS } from '../types/coordinates';
import { suggestCoordinateSystem, Point } from '../utils/coordinate-utils';

export function useGeoLoader() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [options, setOptions] = useState<LoaderOptions>({
    selectedLayers: [],
    visibleLayers: [],
    selectedTemplates: [],
    coordinateSystem: undefined
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [dxfData, setDxfData] = useState<DxfData | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  
  const addLog = useCallback((message: string) => {
    setLogs(prev => [...prev, message]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
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
    // Compare file properties instead of File object reference
    if (currentFile && 
        currentFile.name === file.name && 
        currentFile.size === file.size && 
        currentFile.lastModified === file.lastModified && 
        analysis) {
      return analysis;
    }

    setLoading(true);
    setError(null);
    
    try {
      const loader = getLoader(file);
      const result = await loader.analyze(file, { onLog: addLog });
      
      setAnalysis(result);
      setCurrentFile(file);
      
      // If it's a DXF file and has DXF data, update the state
      if (file.name.toLowerCase().endsWith('.dxf') && result.dxfData) {
        setDxfData(result.dxfData);
      }
      
      // Set initial layer selections
      const layers = result.layers || [];
      setOptions(prev => ({
        ...prev,
        selectedLayers: layers,
        visibleLayers: layers
      }));

      return result;
    } catch (err) {
      const error = err as Error;
      setError(error.message);
      addLog(`Error: ${error.message}`);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [addLog, getLoader, currentFile, analysis]);

  const loadFile = useCallback(async (file: File): Promise<LoaderResult> => {
    setLoading(true);
    setError(null);

    try {
      const loader = getLoader(file);
      
      // Use current options for coordinate system, layer selection, and templates
      const result = await loader.load(file, {
        ...options,
        selectedLayers: options.selectedLayers || [],
        visibleLayers: options.visibleLayers || [],
        selectedTemplates: options.selectedTemplates || [],
        onLog: addLog
      });
      
      return result;
    } catch (err) {
      const error = err as Error;
      setError(error.message);
      addLog(`Error: ${error.message}`);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [addLog, getLoader, options]);

  return {
    loading,
    error,
    analysis,
    options,
    logs,
    dxfData,
    setOptions,
    analyzeFile,
    loadFile,
    clearLogs
  };
}
