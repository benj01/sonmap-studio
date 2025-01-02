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
  visibleLayers: [], // Empty array means no layers visible
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

  // Use ref to track loading state to avoid dependency on state
  const loadingRef = useRef(false);

  const analyzeFile = useCallback(async (file: File) => {
    // Prevent concurrent analysis
    if (loadingRef.current) {
      console.debug('[DEBUG] Skipping analysis - already loading');
      return null;
    }

    console.debug('[DEBUG] Starting analysis');
    loadingRef.current = true;
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

      // Create a new array for visible layers to avoid reference issues
      const initialVisibleLayers = [...layers];

      // Initialize preview manager with streaming support
      console.log('[DEBUG] Creating preview manager...');
      const previewManager = createPreviewManager({
        maxFeatures: 5000,
        visibleLayers: initialVisibleLayers, // Explicitly set all layers as visible
        analysis: {
          warnings: processor.getWarnings() // Use raw warnings array directly
        },
        coordinateSystem: result.coordinateSystem,
        enableCaching: true,
        smartSampling: true
      });

      console.log('[DEBUG] Preview manager created with all layers visible');

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
        visibleLayers: initialVisibleLayers, // Use the same array we passed to preview manager
        selectedTemplates: [],
        previewManager
      });

      console.log('[DEBUG] State initialized with:', {
        layers,
        selectedLayers: layers,
        visibleLayers: initialVisibleLayers,
        message: 'All layers initially visible by explicit inclusion'
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
    } finally {
      loadingRef.current = false;
    }
  }, [getProcessor, onError]); // Remove state.loading from dependencies

  // Handle layer selection
  const handleLayerToggle = useCallback((layer: string, enabled: boolean) => {
    console.log('[DEBUG] Toggle layer selection:', {
      layer,
      enabled,
      action: enabled ? 'selecting' : 'deselecting'
    });

    setState(prev => ({
      ...prev,
      selectedLayers: enabled 
        ? [...prev.selectedLayers, layer]
        : prev.selectedLayers.filter(l => l !== layer)
    }));
  }, []);

  // Handle layer visibility - a layer is only visible if it's in the visibleLayers array
  const handleLayerVisibilityToggle = useCallback((layer: string, visible: boolean) => {
    console.debug('[DEBUG] Toggle layer visibility:', {
      layer,
      visible,
      action: visible ? 'showing' : 'hiding'
    });

    setState(prev => {
      let newVisibleLayers: string[];

      if (visible) {
        // Add layer to visible layers if not already included
        newVisibleLayers = prev.visibleLayers.includes(layer) 
          ? prev.visibleLayers 
          : [...prev.visibleLayers, layer];
      } else {
        // Remove layer from visible layers
        newVisibleLayers = prev.visibleLayers.filter(l => l !== layer);
      }

      console.debug('[DEBUG] Layer visibility update:', {
        layer,
        visible,
        previousState: prev.visibleLayers,
        newState: newVisibleLayers
      });

      // Update preview manager with just the new visibility state
      if (prev.previewManager) {
        prev.previewManager.setOptions({
          visibleLayers: newVisibleLayers
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
    const handleFileChange = async () => {
      if (!file) {
        console.debug('[DEBUG] No file, resetting state');
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
        console.debug('[DEBUG] Same file, skipping analysis');
        return;
      }

      // New file to analyze
      console.debug('[DEBUG] New file detected, starting analysis');
      currentFileRef.current = file;
      setState(initialState);
      try {
        await analyzeFile(file);
      } catch (error) {
        console.error('File analysis error:', error);
        onError(`Failed to analyze file: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    handleFileChange();
  }, [file]); // Only depend on file changes, not analyzeFile which depends on state

  return {
    ...state,
    handleLayerToggle,
    handleLayerVisibilityToggle,
    handleTemplateSelect,
    analyzeFile
  };
}
