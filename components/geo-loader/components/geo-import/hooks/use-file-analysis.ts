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

const createInitialState = (): FileAnalysisState => ({
  loading: false,
  analysis: null,
  dxfData: null,
  selectedLayers: [],
  visibleLayers: [], // Always start with empty array
  selectedTemplates: [],
  previewManager: null
});

// Initialize state with all layers visible by default
const initialState = createInitialState();

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
  const loadingRef = useRef(false);

  const analyzeFile = useCallback(async (file: File) => {
    if (loadingRef.current) {
      console.debug('[DEBUG] Skipping analysis - already loading');
      return null;
    }

    console.debug('[DEBUG] Starting analysis');
    loadingRef.current = true;
    setState(prev => ({ ...prev, loading: true }));

    try {
      console.log('[DEBUG] Starting file analysis:', file.name);

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

      // All layers should be visible initially
      const initialVisibleLayers = [...layers];

      // Initialize preview manager with streaming support and matching visibility state
      console.log('[DEBUG] Creating preview manager...');
      const previewManager = createPreviewManager({
        maxFeatures: 5000,
        visibleLayers: initialVisibleLayers, // All layers visible initially
        analysis: {
          warnings: processor.getWarnings()
        },
        coordinateSystem: result.coordinateSystem,
        enableCaching: true,
        smartSampling: true
      });

      console.log('[DEBUG] Preview manager created with all layers visible');

      // Set preview features in preview manager
      if (result.preview && result.preview.features.length > 0) {
        console.log('[DEBUG] Setting preview features in preview manager...');
        await previewManager.setFeatures(result.preview);
      }

      console.log('[DEBUG] Analysis complete, updating state...');
      // Update state with all layers initially visible to match PreviewManager
      setState({
        loading: false,
        analysis: result,
        dxfData: result.dxfData,
        selectedLayers: layers,
        visibleLayers: initialVisibleLayers, // Ensure this matches PreviewManager's state
        selectedTemplates: [],
        previewManager
      });

      console.log('[DEBUG] State initialized with:', {
        layers,
        selectedLayers: layers,
        visibleLayers: initialVisibleLayers,
        message: 'All layers initially visible'
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
  }, [getProcessor, onError]);

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

  // Handle layer visibility with immediate updates
  const handleLayerVisibilityToggle = useCallback((layer: string, visible: boolean) => {
    console.debug('[DEBUG] Toggle layer visibility:', {
      layer,
      visible,
      action: visible ? 'showing' : 'hiding'
    });

    setState(prev => {
      // Skip if state wouldn't change
      if (visible === prev.visibleLayers.includes(layer)) {
        return prev;
      }

      const newVisibleLayers = visible
        ? [...prev.visibleLayers, layer]
        : prev.visibleLayers.filter(l => l !== layer);

      // Immediately update preview manager
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
      
      // Always start fresh with new file
      setState({
        ...initialState,
        loading: true
      });
      
      try {
        await analyzeFile(file);
      } catch (error) {
        console.error('File analysis error:', error);
        onError(`Failed to analyze file: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    handleFileChange();
  }, [file, analyzeFile, onError]);

  return {
    ...state,
    handleLayerToggle,
    handleLayerVisibilityToggle,
    handleTemplateSelect,
    analyzeFile
  };
}
