import { useState, useCallback, useRef, useEffect } from 'react';
import { AnalyzeResult } from '../../../core/processors/base/types';
import { ProcessorOptions } from '../../../core/processors/base/types';
import { CoordinateSystem } from '../../../types/coordinates';
import { PreviewManager, createPreviewManager } from '../../../preview/preview-manager';
import { GeoLoaderError } from '../../../core/errors/types';
import { coordinateSystemManager } from '../../../core/coordinate-system-manager';

interface Warning {
  type: string;
  message: string;
}

interface FileAnalysisProps {
  file: File | null;
  onWarning: (message: string) => void;
  onError: (message: string) => void;
  onProgress: (progress: number) => void;
  getProcessor: (file: File, options?: Partial<ProcessorOptions>) => Promise<any>;
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
  onProgress,
  getProcessor
}: FileAnalysisProps) {
  const [state, setState] = useState<FileAnalysisState>(initialState);
  const currentFileRef = useRef<File | null>(null);

  const analyzeFile = useCallback(async (file: File) => {
    // Prevent concurrent analysis
    if (state.loading) {
      return null;
    }

    setState(prev => ({ ...prev, loading: true }));

    try {
      console.log('[DEBUG] Starting file analysis:', file.name);

      // Ensure coordinate system manager is initialized
      if (!coordinateSystemManager.isInitialized()) {
        try {
          await coordinateSystemManager.initialize();
        } catch (error) {
          throw new GeoLoaderError(
            'Failed to initialize coordinate systems',
            'COORDINATE_SYSTEM_INIT_ERROR',
            { originalError: error instanceof Error ? error.message : String(error) }
          );
        }
      }

      const processor = await getProcessor(file);

      if (!processor) {
        throw new GeoLoaderError(
          `No processor available for file: ${file.name}`,
          'PROCESSOR_NOT_FOUND'
        );
      }

      console.log('[DEBUG] Analyzing file with processor:', processor.constructor.name);
      const result = await processor.analyze(file);
      console.log('[DEBUG] Analysis result:', result);

      // Initialize layers
      const layers = result.layers || [];
      console.log('[DEBUG] Detected layers:', layers);

      // Initialize preview manager with streaming support
      console.log('[DEBUG] Creating preview manager...');
      const previewManager = createPreviewManager({
        maxFeatures: 5000,
        visibleLayers: layers,
        analysis: {
          warnings: convertWarningsToAnalysis(processor.getWarnings())
        },
        coordinateSystem: result.coordinateSystem,
        enableCaching: true,
        smartSampling: true
      });

      // Set preview features in preview manager
      if (result.preview && result.preview.features.length > 0) {
        console.log('[DEBUG] Setting preview features in preview manager...');
        previewManager.setFeatures(result.preview);
      }

      console.log('[DEBUG] Analysis complete, updating state...');
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
    } catch (error: unknown) {
      if (error instanceof GeoLoaderError) {
        onError(`Analysis error: ${error.message}`);
      } else {
        onError(`Failed to analyze file: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      setState(initialState);
      return null;
    }
  }, [state.loading, getProcessor, onError]);

  // Handle layer selection
  const handleLayerToggle = useCallback((layer: string, enabled: boolean) => {
    console.log('[DEBUG] Toggle layer:', layer, enabled);
    setState(prev => ({
      ...prev,
      selectedLayers: enabled 
        ? [...prev.selectedLayers, layer]
        : prev.selectedLayers.filter(l => l !== layer)
    }));
  }, []);

  const handleLayerVisibilityToggle = useCallback((layer: string, visible: boolean) => {
    console.debug('[DEBUG] Toggle layer visibility:', layer, visible);
    setState(prev => {
      const newVisibleLayers = visible
        ? [...prev.visibleLayers, layer]
        : prev.visibleLayers.filter(l => l !== layer);
      
      // Update existing preview manager options instead of creating new instance
      if (prev.previewManager) {
        prev.previewManager.setOptions({
          visibleLayers: newVisibleLayers,
          // Keep other options unchanged
          maxFeatures: prev.previewManager.getOptions().maxFeatures,
          analysis: prev.previewManager.getOptions().analysis,
          coordinateSystem: prev.previewManager.getOptions().coordinateSystem,
          enableCaching: prev.previewManager.getOptions().enableCaching,
          smartSampling: prev.previewManager.getOptions().smartSampling
        });
      }

      return {
        ...prev,
        visibleLayers: newVisibleLayers
      };
    });
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
    if (!file) {
      currentFileRef.current = null;
      setState(initialState);
      return;
    }

    // Check if this is the same file we already analyzed
    const isSameFile = currentFileRef.current && 
      currentFileRef.current.name === file.name &&
      currentFileRef.current.size === file.size &&
      currentFileRef.current.lastModified === file.lastModified;

    if (isSameFile) {
      return;
    }

    // New file to analyze
    currentFileRef.current = file;
    setState(initialState);
    analyzeFile(file).catch(error => {
      console.error('File analysis error:', error);
      onError(`Failed to analyze file: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, [file, analyzeFile, onError]);

  return {
    ...state,
    handleLayerToggle,
    handleLayerVisibilityToggle,
    handleTemplateSelect,
    analyzeFile
  };
}
