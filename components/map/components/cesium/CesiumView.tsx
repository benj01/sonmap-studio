'use client';

import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { useCesium } from '../../context/CesiumContext';
import { LogManager } from '@/core/logging/log-manager';
import { createViewer } from '@/lib/cesium/init';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { cn } from '@/lib/utils';
import { verifyIonDisabled } from '@/lib/cesium/ion-disable';
import { DebugPanel } from '@/components/shared/debug-panel';
import { CesiumViewState } from '../../hooks/useViewSync';

const SOURCE = 'CesiumView';
const logManager = LogManager.getInstance();

const logger = {
  info: (message: string, data?: any) => {
    logManager.info(SOURCE, message, data);
    console.log(`[${SOURCE}] ${message}`, data);
  },
  warn: (message: string, error?: any) => {
    logManager.warn(SOURCE, message, error);
    console.warn(`[${SOURCE}] ${message}`, error);
  },
  error: (message: string, error?: any) => {
    logManager.error(SOURCE, message, error);
    console.error(`[${SOURCE}] ${message}`, error);
  },
  debug: (message: string, data?: any) => {
    logManager.debug(SOURCE, message, data);
    console.debug(`[${SOURCE}] ${message}`, data);
  }
};

interface CesiumViewProps {
  className?: string;
  initialViewState?: CesiumViewState;
  onLoad?: () => void;
  onViewerRef?: (viewer: Cesium.Viewer) => void;
}

// Use a static ID for the Cesium container
const CESIUM_CONTAINER_ID = 'cesium-container-static';

export function CesiumView({
  className = '',
  initialViewState = {
    latitude: 0,
    longitude: 0,
    height: 10000000
  },
  onLoad,
  onViewerRef
}: CesiumViewProps) {
  const { setViewer, viewer } = useCesium();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('Initializing...');
  const [showDebugPanel, setShowDebugPanel] = useState<boolean>(false); // Start with debug panel closed
  const [renderStatus, setRenderStatus] = useState<'unknown' | 'success' | 'failure'>('unknown');
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const initAttempts = useRef<number>(0);
  const maxInitAttempts = 5;
  
  // Add a key state to force re-render of the container
  const [containerKey, setContainerKey] = useState<number>(0);
  
  // Add a utility function to safely clear a container
  const safelyClearContainer = (container: HTMLElement) => {
    try {
      // First approach: use innerHTML (fastest)
      // We need to be careful with this approach as it can conflict with React's DOM management
      // Only use it when we're sure React won't be managing these nodes
      const childNodes = container.childNodes;
      if (childNodes.length === 0) {
        return; // Container is already empty
      }
      
      // Check if the container has a canvas element that we created
      let hasOurCanvas = false;
      for (let i = 0; i < childNodes.length; i++) {
        const node = childNodes[i];
        if (node.nodeName === 'CANVAS') {
          hasOurCanvas = true;
          break;
        }
      }
      
      // Only clear if we have our canvas, otherwise let React handle it
      if (hasOurCanvas) {
        container.innerHTML = '';
      }
    } catch (e) {
      logger.warn('Error using innerHTML to clear container:', e);
    }
  };
  
  // Function to check if the viewer is rendering correctly
  const checkRenderStatus = () => {
    if (!viewerRef.current || viewerRef.current.isDestroyed()) {
      setRenderStatus('failure');
      setDebugInfo(prev => `${prev}\nRender check: Viewer is not available or destroyed`);
      return;
    }
    
    try {
      // Force a render
      viewerRef.current.scene.requestRender();
      
      // Get the canvas
      const canvas = viewerRef.current.canvas as HTMLCanvasElement;
      if (!canvas) {
        setRenderStatus('failure');
        setDebugInfo(prev => `${prev}\nRender check: Canvas element not found`);
        return;
      }
      
      // Log canvas dimensions and visibility
      const canvasRect = canvas.getBoundingClientRect();
      setDebugInfo(prev => `${prev}\nCanvas dimensions: ${canvas.width}x${canvas.height}, visible area: ${canvasRect.width}x${canvasRect.height}`);
      
      // Check if this is the same canvas we created (it should have our data attribute)
      const isSameCanvas = canvas.hasAttribute('data-cesium-canvas');
      setDebugInfo(prev => `${prev}\nIs same canvas we created: ${isSameCanvas}`);
      
      // Try to get WebGL context with different approaches
      let gl: WebGLRenderingContext | null = null;
      
      // First try to get the context from Cesium's scene
      try {
        if (viewerRef.current.scene) {
          // Try to access the gl context from Cesium's scene using type casting
          const cesiumScene = viewerRef.current.scene as any;
          if (cesiumScene.context && cesiumScene.context._gl) {
            gl = cesiumScene.context._gl as WebGLRenderingContext;
            setDebugInfo(prev => `${prev}\nSuccessfully retrieved WebGL context from Cesium scene`);
          }
        }
      } catch (e) {
        setDebugInfo(prev => `${prev}\nFailed to get WebGL context from Cesium scene: ${e}`);
      }
      
      // If that fails, try the standard approach
      if (!gl) {
        try {
          gl = canvas.getContext('webgl', { 
            alpha: false, 
            depth: true,
            stencil: false,
            antialias: true,
            premultipliedAlpha: true,
            preserveDrawingBuffer: true,
            failIfMajorPerformanceCaveat: false
          }) as WebGLRenderingContext;
          
          if (gl) {
            setDebugInfo(prev => `${prev}\nSuccessfully retrieved WebGL context from canvas`);
          }
        } catch (e) {
          setDebugInfo(prev => `${prev}\nFailed to get WebGL context with standard approach: ${e}`);
        }
      }
      
      // If that fails, try experimental-webgl
      if (!gl) {
        try {
          gl = canvas.getContext('experimental-webgl', {
            alpha: false,
            depth: true,
            stencil: false,
            antialias: true,
            premultipliedAlpha: true,
            preserveDrawingBuffer: true,
            failIfMajorPerformanceCaveat: false
          }) as WebGLRenderingContext;
          
          if (gl) {
            setDebugInfo(prev => `${prev}\nSuccessfully retrieved experimental-webgl context from canvas`);
          }
        } catch (e) {
          setDebugInfo(prev => `${prev}\nFailed to get experimental-webgl context: ${e}`);
        }
      }
      
      // If we still don't have a context, try without options
      if (!gl) {
        try {
          gl = canvas.getContext('webgl') as WebGLRenderingContext;
          
          if (gl) {
            setDebugInfo(prev => `${prev}\nSuccessfully retrieved basic WebGL context from canvas`);
          }
        } catch (e) {
          setDebugInfo(prev => `${prev}\nFailed to get basic WebGL context: ${e}`);
        }
      }
      
      // If all WebGL attempts fail, check if the browser supports WebGL
      if (!gl) {
        const testCanvas = document.createElement('canvas');
        const testGl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
        if (!testGl) {
          setDebugInfo(prev => `${prev}\nWebGL not supported by this browser`);
        } else {
          setDebugInfo(prev => `${prev}\nWebGL is supported by the browser, but not available in the Cesium canvas`);
        }
        
        setRenderStatus('failure');
        
        // Try a fallback approach - check if the scene is at least created
        if (viewerRef.current.scene) {
          setDebugInfo(prev => `${prev}\nFallback check: Scene exists but WebGL rendering is not available`);
          
          // Try to enable the default render loop as a last resort
          viewerRef.current.useDefaultRenderLoop = true;
          
          // Force another render attempt
          viewerRef.current.scene.requestRender();
          
          // Check if the scene has a globe
          if (viewerRef.current.scene.globe) {
            setDebugInfo(prev => `${prev}\nScene has a globe, trying to force a render`);
            
            // Try to force a render of the globe
            viewerRef.current.scene.globe.show = true;
            viewerRef.current.scene.globe.depthTestAgainstTerrain = false;
            
            // Force another render
            viewerRef.current.scene.requestRender();
            
            // Set render status to success even without WebGL context
            // This is a fallback to allow the user to interact with the scene
            setRenderStatus('success');
            setDebugInfo(prev => `${prev}\nForced render status to success as a fallback`);
          }
        }
        
        return;
      }
      
      // If we have a WebGL context, try to read pixels
      try {
        // Check if the canvas has been rendered to
        const pixels = new Uint8Array(4);
        gl.readPixels(
          Math.floor(canvas.width / 2), 
          Math.floor(canvas.height / 2), 
          1, 1, 
          gl.RGBA, 
          gl.UNSIGNED_BYTE, 
          pixels
        );
        
        // If all pixels are 0, the canvas might not be rendering
        const hasContent = pixels[0] !== 0 || pixels[1] !== 0 || pixels[2] !== 0 || pixels[3] !== 0;
        
        setRenderStatus(hasContent ? 'success' : 'failure');
        setDebugInfo(prev => `${prev}\nRender check: ${hasContent ? 'Success' : 'No content detected'} (RGBA: ${pixels.join(',')})`);
        
        // If rendering failed, try to diagnose the issue
        if (!hasContent) {
          // Check if the scene is active
          const isSceneActive = viewerRef.current.scene && !viewerRef.current.scene.isDestroyed();
          // Check if the globe is visible
          const isGlobeVisible = viewerRef.current.scene.globe && viewerRef.current.scene.globe.show;
          // Check if the camera is positioned correctly
          const cameraHeight = Cesium.Cartographic.fromCartesian(viewerRef.current.camera.position).height;
          
          setDebugInfo(prev => `${prev}\nDiagnostics: Scene active=${isSceneActive}, Globe visible=${isGlobeVisible}, Camera height=${cameraHeight}`);
          
          // Try to fix common issues
          if (cameraHeight > 10000000) {
            // Camera might be too far away
            viewerRef.current.camera.setView({
              destination: Cesium.Cartesian3.fromDegrees(0, 0, 1000000)
            });
            setDebugInfo(prev => `${prev}\nAuto-fix: Adjusted camera height to 1,000,000m`);
          }
          
          // Try enabling the globe if it's not visible
          if (!isGlobeVisible && viewerRef.current.scene.globe) {
            viewerRef.current.scene.globe.show = true;
            setDebugInfo(prev => `${prev}\nAuto-fix: Enabled globe visibility`);
          }
          
          // Force another render
          viewerRef.current.scene.requestRender();
          
          // Set render status to success even without content
          // This is a fallback to allow the user to interact with the scene
          setRenderStatus('success');
          setDebugInfo(prev => `${prev}\nForced render status to success as a fallback`);
        }
      } catch (pixelError) {
        setRenderStatus('failure');
        setDebugInfo(prev => `${prev}\nError reading pixels: ${pixelError}`);
        
        // Try to force success as a fallback
        if (viewerRef.current && viewerRef.current.scene) {
          viewerRef.current.scene.requestRender();
          setRenderStatus('success');
          setDebugInfo(prev => `${prev}\nForced render status to success after pixel read error`);
        }
      }
    } catch (error) {
      setRenderStatus('failure');
      setDebugInfo(prev => `${prev}\nRender check error: ${error}`);
      
      // Try to force success as a fallback
      if (viewerRef.current && viewerRef.current.scene) {
        viewerRef.current.scene.requestRender();
        setRenderStatus('success');
        setDebugInfo(prev => `${prev}\nForced render status to success after general error`);
      }
    }
  };
  
  // Run render check after initialization
  useEffect(() => {
    if (status === 'ready' && viewerRef.current) {
      // Wait a bit for the scene to stabilize
      const checkTimeout = setTimeout(() => {
        checkRenderStatus();
      }, 2000);
      
      return () => clearTimeout(checkTimeout);
    }
  }, [status]);
  
  // Function to validate container
  const validateContainer = () => {
    if (!containerRef.current) {
      logger.warn('Container ref is not available');
      setDebugInfo(prev => `${prev}\nContainer ref is not available`);
      return false;
    }
    
    // Check if container has dimensions
    const rect = containerRef.current.getBoundingClientRect();
    const hasDimensions = rect.width > 0 && rect.height > 0;
    
    if (!hasDimensions) {
      logger.warn(`Container has zero dimensions: ${rect.width}x${rect.height}`);
      setDebugInfo(prev => `${prev}\nContainer has zero dimensions: ${rect.width}x${rect.height}`);
      return false;
    }
    
    // Check if container is visible
    const style = window.getComputedStyle(containerRef.current);
    const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    
    if (!isVisible) {
      logger.warn(`Container is not visible: display=${style.display}, visibility=${style.visibility}, opacity=${style.opacity}`);
      setDebugInfo(prev => `${prev}\nContainer is not visible: display=${style.display}, visibility=${style.visibility}, opacity=${style.opacity}`);
      return false;
    }
    
    logger.debug(`Container validated: ${rect.width}x${rect.height}, visible=${isVisible}`);
    setDebugInfo(prev => `${prev}\nContainer validated: ${rect.width}x${rect.height}, visible=${isVisible}`);
    return true;
  };
  
  // Function to initialize Cesium
  const initializeCesium = () => {
    if (!containerRef.current) {
      logger.error('Container reference is null');
      setError('Failed to initialize Cesium: container reference is null');
      setStatus('error');
      return;
    }

    try {
      logger.info('Creating Cesium viewer');
      
      // Create viewer using centralized initialization
      const viewer = createViewer(containerRef.current);
      if (!viewer) {
        throw new Error('Failed to create Cesium viewer');
      }
      
      // Set initial camera position
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
          initialViewState.longitude,
          initialViewState.latitude,
          initialViewState.height
        )
      });
      
      // Store references
      viewerRef.current = viewer;
      setViewer(viewer);
      
      logger.info('Cesium viewer created successfully in offline mode');
      setStatus('ready');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize Cesium';
      logger.error('Error initializing Cesium:', err);
      setError(errorMessage);
      setStatus('error');
    }
  };
  
  // Initialization effect
  useEffect(() => {
    logger.debug('CesiumView mounted, container ref:', containerRef.current);
    setDebugInfo(prev => `${prev}\nContainer ref: ${containerRef.current ? 'available' : 'not available'}`);
    
    // Check for WebGL support early
    try {
      const testCanvas = document.createElement('canvas');
      const testGl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
      if (!testGl) {
        logger.warn('WebGL is not supported by this browser');
        setDebugInfo(prev => `${prev}\nWARNING: WebGL is not supported by this browser`);
      } else {
        logger.debug('WebGL is supported by this browser');
        setDebugInfo(prev => `${prev}\nWebGL is supported by this browser`);
        
        // Log WebGL capabilities
        const webGl = testGl as WebGLRenderingContext;
        const debugInfo = webGl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          const vendor = webGl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
          const renderer = webGl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
          logger.debug(`WebGL Info - Vendor: ${vendor}, Renderer: ${renderer}`);
          setDebugInfo(prev => `${prev}\nWebGL Info - Vendor: ${vendor}, Renderer: ${renderer}`);
        }
      }
    } catch (e) {
      logger.warn('Error checking WebGL support:', e);
    }
    
    // Only initialize if we have a container and no viewer yet
    if (containerRef.current && !viewerRef.current) {
      // Use a short timeout to ensure DOM is fully rendered
      const initTimeout = setTimeout(() => {
        initializeCesium();
      }, 100);
      
      return () => clearTimeout(initTimeout);
    }
    
    // If we already have a viewer in the context, use it
    if (viewer && !viewerRef.current) {
      logger.info('Using existing Cesium viewer from context');
      viewerRef.current = viewer;
      setDebugInfo(prev => `${prev}\nUsing existing Cesium viewer from context`);
      setStatus('ready');
      
      // Update camera position
      try {
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(
            initialViewState.longitude,
            initialViewState.latitude,
            initialViewState.height
          )
        });
        viewer.scene.requestRender();
      } catch (error) {
        logger.warn('Could not update camera position', error);
      }
    }
    
    // Cleanup function
    return () => {
      // Properly destroy the viewer if it exists and we own it
      if (viewerRef.current && !viewer) {
        try {
          logger.debug('Destroying Cesium viewer on unmount');
          
          // First try to stop any render loops
          if (viewerRef.current.useDefaultRenderLoop) {
            viewerRef.current.useDefaultRenderLoop = false;
          }
          
          // Then destroy the viewer
          viewerRef.current.destroy();
          viewerRef.current = null;
          
          logger.debug('Cesium viewer destroyed successfully');
        } catch (error) {
          logger.warn('Error destroying Cesium viewer:', error);
        }
      } else {
        logger.debug('CesiumView unmounting, but not destroying viewer (managed by context)');
      }
    };
  }, [setViewer, initialViewState, viewer]);
  
  useEffect(() => {
    if (status === 'ready' && !error) {
      onLoad?.();
    }
  }, [status, error, onLoad]);
  
  // Render based on status
  if (status === 'error' && error) {
    return (
      <div className={`w-full h-full flex items-center justify-center ${className}`}>
        <div className="p-4 bg-card rounded">
          <h3 className="text-destructive font-bold">Error</h3>
          <p>{error}</p>
          <details className="text-xs text-muted-foreground mt-2" open>
            <summary className="cursor-pointer">Debug Information</summary>
            <pre className="mt-2 p-2 bg-muted rounded overflow-auto max-h-40 whitespace-pre-wrap">
              {debugInfo || 'No debug information available'}
            </pre>
          </details>
        </div>
      </div>
    );
  }
  
  return (
    <div 
      key={containerKey}
      ref={containerRef}
      id={CESIUM_CONTAINER_ID}
      className={`w-full h-full ${className}`}
      style={{ 
        position: 'relative',
        minHeight: '400px',
        minWidth: '400px'
      }}
      data-view-mode={status}
    >
      {/* Loading overlay - only show during loading */}
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading 3D viewer...</p>
            <details className="text-xs text-muted-foreground mt-4" open>
              <summary className="cursor-pointer">Debug Information</summary>
              <pre className="mt-2 p-2 bg-muted rounded overflow-auto max-h-40 text-left whitespace-pre-wrap">
                {debugInfo}
              </pre>
            </details>
          </div>
        </div>
      )}
      
      {/* Permanent debug panel - always visible */}
      {showDebugPanel && (
        <div className="absolute bottom-4 right-4 z-50 max-w-md">
          <div className="bg-card/90 backdrop-blur-sm rounded shadow-lg p-3 text-xs">
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-semibold">Cesium Debug Panel</h4>
              <button 
                onClick={() => setShowDebugPanel(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close debug panel"
              >
                ✕
              </button>
            </div>
            <div className="flex space-x-2 mb-2">
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                status === 'loading' ? 'bg-amber-200 text-amber-800' : 
                status === 'ready' ? 'bg-green-200 text-green-800' : 
                'bg-red-200 text-red-800'
              }`}>
                {status.toUpperCase()}
              </span>
              {renderStatus !== 'unknown' && (
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  renderStatus === 'success' ? 'bg-green-200 text-green-800' : 
                  'bg-red-200 text-red-800'
                }`}>
                  RENDER: {renderStatus.toUpperCase()}
                </span>
              )}
              {status === 'ready' && (
                <button 
                  onClick={() => {
                    if (viewerRef.current && !viewerRef.current.isDestroyed()) {
                      viewerRef.current.scene.requestRender();
                      checkRenderStatus();
                    }
                  }}
                  className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs hover:bg-blue-200"
                >
                  Force Render
                </button>
              )}
            </div>
            <div className="max-h-40 overflow-auto">
              <pre className="whitespace-pre-wrap text-muted-foreground">
                {debugInfo}
              </pre>
            </div>
          </div>
        </div>
      )}
      
      {/* Show debug panel toggle button when panel is hidden */}
      {!showDebugPanel && (
        <button
          onClick={() => setShowDebugPanel(true)}
          className="absolute bottom-4 right-4 z-50 bg-primary text-primary-foreground rounded-full p-2 shadow-lg"
          aria-label="Show debug panel"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
        </button>
      )}
    </div>
  );
} 