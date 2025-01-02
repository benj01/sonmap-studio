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
  visibleLayers: [],
  selectedTemplates: [],
  previewManager: null
});

// Initialize state with all layers visible by default
const initialState = createInitialState();

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
  const stateRef = useRef(state);

  // Keep stateRef in sync with state
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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
        visibleLayers: initialVisibleLayers,
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
      
      // Update state with all layers initially visible
      const newState = {
        loading: false,
        analysis: result,
        dxfData: result.dxfData,
        selectedLayers: layers,
        visibleLayers: initialVisibleLayers,
        selectedTemplates: [],
        previewManager
      };

      console.log('[DEBUG] Setting new state:', newState);
      setState(newState);
      stateRef.current = newState;

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
      
      const resetState = initialState;
      setState(resetState);
      stateRef.current = resetState;
      return null;
    } finally {
      loadingRef.current = false;
    }
  }, [getProcessor, onError]);

  // Reset state and cleanup resources
  const resetState = useCallback(() => {
    console.debug('[DEBUG] Resetting file analysis state');
    // Cleanup preview manager
    if (stateRef.current.previewManager) {
      console.debug('[DEBUG] Cleaning up preview manager');
      stateRef.current.previewManager.dispose();
    }
    // Reset state
    const newState = createInitialState();
    setState(newState);
    stateRef.current = newState;
    currentFileRef.current = null;
    loadingRef.current = false;
  }, []);

  // Effect to handle file changes
  useEffect(() => {
    const handleFileChange = async () => {
      if (!file) {
        console.debug('[DEBUG] No file, resetting state');
        resetState();
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

      // Reset state before analyzing new file
      resetState();

      // New file to analyze
      console.debug('[DEBUG] New file detected, starting analysis');
      currentFileRef.current = file;
      await analyzeFile(file);
    };

    handleFileChange().catch(error => {
      console.error('[ERROR] File analysis failed:', error);
      onError(error instanceof Error ? error.message : String(error));
    });
  }, [file, analyzeFile, resetState, onError]);

  // Handle layer toggle with debug logging
  const handleLayerToggle = useCallback((layer: string, enabled: boolean) => {
    console.debug('[DEBUG] useFileAnalysis handleLayerToggle:', {
      layer,
      enabled,
      currentSelectedLayers: stateRef.current.selectedLayers
    });

    setState(prev => {
      // Skip if state wouldn't change
      if (enabled === prev.selectedLayers.includes(layer)) {
        console.debug('[DEBUG] useFileAnalysis skipping selection update - no change');
        return prev;
      }

      const newSelectedLayers = enabled
        ? [...prev.selectedLayers, layer]
        : prev.selectedLayers.filter(l => l !== layer);

      console.debug('[DEBUG] useFileAnalysis layer selection updated:', {
        layer,
        enabled,
        before: prev.selectedLayers,
        after: newSelectedLayers
      });

      const newState = {
        ...prev,
        selectedLayers: newSelectedLayers
      };

      stateRef.current = newState;
      return newState;
    });
  }, []);

  // Handle layer visibility toggle with debug logging
  const handleLayerVisibilityToggle = useCallback((layer: string, visible: boolean) => {
    console.debug('[DEBUG] useFileAnalysis handleLayerVisibilityToggle:', {
      layer,
      visible,
      currentState: stateRef.current
    });

    setState(prev => {
      // Skip if state wouldn't change
      if (visible === prev.visibleLayers.includes(layer)) {
        console.debug('[DEBUG] useFileAnalysis skipping visibility update - no change');
        return prev;
      }

      const newVisibleLayers = visible
        ? [...prev.visibleLayers, layer]
        : prev.visibleLayers.filter(l => l !== layer);

      // Immediately update preview manager
      if (prev.previewManager) {
        console.debug('[DEBUG] useFileAnalysis updating preview manager visibility:', {
          layer,
          visible,
          newVisibleLayers
        });
        prev.previewManager.setOptions({
          visibleLayers: newVisibleLayers
        });
      }

      console.debug('[DEBUG] useFileAnalysis layer visibility updated:', {
        layer,
        visible,
        before: prev.visibleLayers,
        after: newVisibleLayers
      });

      const newState = {
        ...prev,
        visibleLayers: newVisibleLayers
      };

      stateRef.current = newState;
      return newState;
    });
  }, []);

  // Handle template selection with debug logging
  const handleTemplateSelect = useCallback((template: string, enabled: boolean) => {
    console.debug('[DEBUG] useFileAnalysis handleTemplateSelect:', {
      template,
      enabled,
      currentSelectedTemplates: stateRef.current.selectedTemplates
    });

    setState(prev => {
      const newSelectedTemplates = enabled
        ? [...prev.selectedTemplates, template]
        : prev.selectedTemplates.filter(t => t !== template);

      console.debug('[DEBUG] useFileAnalysis template selection updated:', {
        template,
        enabled,
        before: prev.selectedTemplates,
        after: newSelectedTemplates
      });

      const newState = {
        ...prev,
        selectedTemplates: newSelectedTemplates
      };

      stateRef.current = newState;
      return newState;
    });
  }, []);

  return {
    ...stateRef.current,
    handleLayerToggle,
    handleLayerVisibilityToggle,
    handleTemplateSelect,
    analyzeFile
  };
}

function convertWarningsToAnalysis(warnings: string[] = []): Warning[] {
  return warnings.map(message => ({
    type: 'warning',
    message
  }));
}
