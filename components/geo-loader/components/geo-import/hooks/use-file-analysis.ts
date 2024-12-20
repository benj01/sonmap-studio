import { useState, useCallback, useRef, useEffect } from 'react';
import { AnalyzeResult, ProcessorOptions, createProcessor } from '../../../processors';
import { CoordinateSystem } from '../../../types/coordinates';
import { PreviewManager, createPreviewManager } from '../../../preview/preview-manager';
import { CoordinateSystemError, TransformationError } from '../../../utils/coordinate-systems';
import { Warning } from '../../../types/map';

interface FileAnalysisProps {
  file: File | null;
  onWarning: (message: string) => void;
  onError: (message: string) => void;
  onProgress: (progress: number) => void;
}

interface FileAnalysisState {
  loading: boolean;
  analysis: AnalyzeResult | null;
  dxfData: any | null;
  selectedLayers: string[];
  visibleLayers: string[];
  selectedTemplates: string[];
  previewManager: PreviewManager | null;
}

const initialState: FileAnalysisState = {
  loading: false,
  analysis: null,
  dxfData: null,
  selectedLayers: [],
  visibleLayers: [],
  selectedTemplates: [],
  previewManager: null
};

function convertWarningsToAnalysis(warnings: string[] = []): Warning[] {
  return warnings.map(message => ({
    type: 'warning',
    message
  }));
}

export function useFileAnalysis({
  file,
  onWarning,
  onError,
  onProgress
}: FileAnalysisProps) {
  const [state, setState] = useState<FileAnalysisState>(initialState);

  // Track current file to re-analyze only when changed
  const currentFileRef = useRef<File | null>(null);

  const resetState = useCallback(() => {
    setState(initialState);
  }, []);

  const analyzeFile = useCallback(async (file: File) => {
    setState(prev => ({ ...prev, loading: true }));

    try {
      const processor = await createProcessor(file, {
        onWarning,
        onError,
        onProgress,
      } as ProcessorOptions);

      if (!processor) {
        throw new Error(`No processor available for file: ${file.name}`);
      }

      const result = await processor.analyze(file);

      // Initialize layers
      const layers = result.layers || [];

      // Initialize preview manager
      const previewManager = createPreviewManager({
        maxFeatures: 5000,
        visibleLayers: layers,
        analysis: {
          ...result,
          warnings: convertWarningsToAnalysis(result.warnings)
        },
        coordinateSystem: result.coordinateSystem
      });

      if (result.preview) {
        previewManager.setFeatures(result.preview);
      }

      setState({
        loading: false,
        analysis: result,
        dxfData: result.dxfData,
        selectedLayers: layers,
        visibleLayers: layers,
        selectedTemplates: [],
        previewManager
      });

      return result;
    } catch (error) {
      if (error instanceof CoordinateSystemError) {
        onError(`Coordinate system error: ${error.message}`);
      } else if (error instanceof TransformationError) {
        onError(`Transformation error: ${error.message}`);
      } else {
        onError(`Analysis error: ${error instanceof Error ? error.message : String(error)}`);
      }
      setState(prev => ({ ...prev, loading: false }));
      return null;
    }
  }, [onWarning, onError, onProgress]);

  // Handle layer selection
  const handleLayerToggle = useCallback((layer: string, enabled: boolean) => {
    setState(prev => ({
      ...prev,
      selectedLayers: enabled 
        ? [...prev.selectedLayers, layer]
        : prev.selectedLayers.filter(l => l !== layer)
    }));
  }, []);

  const handleLayerVisibilityToggle = useCallback((layer: string, visible: boolean) => {
    setState(prev => ({
      ...prev,
      visibleLayers: visible
        ? [...prev.visibleLayers, layer]
        : prev.visibleLayers.filter(l => l !== layer)
    }));
  }, []);

  const handleTemplateSelect = useCallback((template: string, enabled: boolean) => {
    setState(prev => ({
      ...prev,
      selectedTemplates: enabled
        ? [...prev.selectedTemplates, template]
        : prev.selectedTemplates.filter(t => t !== template)
    }));
  }, []);

  // Effect to handle file changes
  useEffect(() => {
    if (file) {
      if (
        currentFileRef.current &&
        currentFileRef.current.name === file.name &&
        currentFileRef.current.size === file.size &&
        currentFileRef.current.lastModified === file.lastModified &&
        state.analysis
      ) {
        // Same file, already analyzed
        return;
      }

      currentFileRef.current = file;
      resetState();
      analyzeFile(file);
    } else {
      currentFileRef.current = null;
      resetState();
    }
  }, [file, state.analysis, resetState, analyzeFile]);

  return {
    ...state,
    handleLayerToggle,
    handleLayerVisibilityToggle,
    handleTemplateSelect,
    analyzeFile
  };
}
