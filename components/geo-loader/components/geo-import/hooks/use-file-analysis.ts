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

      const result = await processor.analyze(file);

      // Initialize layers
      const layers = result.layers || [];

      // Initialize preview manager with streaming support
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

      // Generate preview using streaming if available
      if (result.preview) {
        if (Symbol.asyncIterator in result.preview) {
          // Stream features
          await previewManager.generatePreview(
            result.preview[Symbol.asyncIterator](),
            file.name
          );
        } else {
          // Fallback for non-streaming preview
          previewManager.setFeatures(result.preview);
        }
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
    setState(prev => ({
      ...prev,
      selectedLayers: enabled 
        ? [...prev.selectedLayers, layer]
        : prev.selectedLayers.filter(l => l !== layer)
    }));
  }, []);

  const handleLayerVisibilityToggle = useCallback((layer: string, visible: boolean) => {
    setState(prev => {
      const newVisibleLayers = visible
        ? [...prev.visibleLayers, layer]
        : prev.visibleLayers.filter(l => l !== layer);
      
      // Update preview manager visibility using setOptions
      if (prev.previewManager) {
        prev.previewManager.setOptions({ visibleLayers: newVisibleLayers });
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
