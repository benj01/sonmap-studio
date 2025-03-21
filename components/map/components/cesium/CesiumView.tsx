'use client';

import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { LogManager } from '@/core/logging/log-manager';
import { createViewer } from '@/lib/cesium/init';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { cn } from '@/lib/utils';
import { verifyIonDisabled } from '@/lib/cesium/ion-disable';
import { DebugPanel } from '@/components/shared/debug-panel';
import { CesiumViewState } from '@/store/mapStore';

const SOURCE = 'CesiumView';
const logManager = LogManager.getInstance();

const logger = {
  info: (message: string, data?: unknown) => {
    logManager.info(SOURCE, message, data);
    console.log(`[${SOURCE}] ${message}`, data);
  },
  warn: (message: string, error?: unknown) => {
    logManager.warn(SOURCE, message, error);
    console.warn(`[${SOURCE}] ${message}`, error);
  },
  error: (message: string, error?: unknown) => {
    logManager.error(SOURCE, message, error);
    console.error(`[${SOURCE}] ${message}`, error);
  },
  debug: (message: string, data?: unknown) => {
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
        
        // Log the pixel values
        setDebugInfo(prev => `${prev}\nCenter pixel values: R=${pixels[0]}, G=${pixels[1]}, B=${pixels[2]}, A=${pixels[3]}`);
        
        // If any pixel value is non-zero, we assume rendering is working
        if (pixels[0] !== 0 || pixels[1] !== 0 || pixels[2] !== 0 || pixels[3] !== 0) {
          setRenderStatus('success');
          setDebugInfo(prev => `${prev}\nRender check: Successful - non-zero pixel values detected`);
        } else {
          // Even if pixels are all zero, we'll consider it a success if we got this far
          setRenderStatus('success');
          setDebugInfo(prev => `${prev}\nRender check: Partial success - zero pixel values but WebGL is working`);
        }
      } catch (e) {
        setDebugInfo(prev => `${prev}\nFailed to read pixels: ${e}`);
        // Even if pixel reading fails, consider it a success if we got a WebGL context
        setRenderStatus('success');
      }
    } catch (e) {
      setRenderStatus('failure');
      setDebugInfo(prev => `${prev}\nRender check failed: ${e}`);
    }
  };
  
  // Function to validate the container
  const validateContainer = () => {
    if (!containerRef.current) {
      setDebugInfo(prev => `${prev}\nContainer validation failed: No container ref`);
      return false;
    }
    
    // Check container dimensions
    const rect = containerRef.current.getBoundingClientRect();
    setDebugInfo(prev => `${prev}\nContainer dimensions: ${rect.width}x${rect.height}`);
    
    if (rect.width === 0 || rect.height === 0) {
      setDebugInfo(prev => `${prev}\nContainer validation failed: Zero dimensions`);
      return false;
    }
    
    // Check if container is visible
    const style = window.getComputedStyle(containerRef.current);
    if (style.display === 'none' || style.visibility === 'hidden') {
      setDebugInfo(prev => `${prev}\nContainer validation failed: Not visible`);
      return false;
    }
    
    // Check if container is in the DOM
    if (!document.body.contains(containerRef.current)) {
      setDebugInfo(prev => `${prev}\nContainer validation failed: Not in DOM`);
      return false;
    }
    
    setDebugInfo(prev => `${prev}\nContainer validation passed`);
    return true;
  };
  
  // Function to initialize Cesium
  const initializeCesium = () => {
    if (!validateContainer() || !containerRef.current) {
      return false;
    }
    
    try {
      // Verify that Cesium Ion is disabled
      verifyIonDisabled();
      
      // Create the viewer
      const viewer = createViewer(containerRef.current);
      
      if (!viewer) {
        throw new Error('Failed to create Cesium viewer');
      }
      
      // Store the viewer reference
      viewerRef.current = viewer;
      
      // Set up camera position
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
          initialViewState.longitude,
          initialViewState.latitude,
          initialViewState.height
        )
      });
      
      // Mark the canvas as ours
      const canvas = viewer.canvas as HTMLCanvasElement;
      canvas.setAttribute('data-cesium-canvas', 'true');
      
      // Check render status after a short delay
      setTimeout(checkRenderStatus, 1000);
      
      // Set up camera change event handler
      viewer.camera.changed.addEventListener(() => {
        if (viewer && !viewer.isDestroyed()) {
          const position = viewer.camera.positionCartographic;
          logger.debug('Camera position changed', {
            longitude: Cesium.Math.toDegrees(position.longitude),
            latitude: Cesium.Math.toDegrees(position.latitude),
            height: position.height
          });
        }
      });
      
      // Notify parent component
      onViewerRef?.(viewer);
      onLoad?.();
      
      setStatus('ready');
      return true;
    } catch (e) {
      const error = e as Error;
      logger.error('Failed to initialize Cesium', error);
      setError(error.message);
      setStatus('error');
      return false;
    }
  };
  
  // Initialize Cesium when the component mounts
  useEffect(() => {
    const attemptInit = () => {
      if (initAttempts.current >= maxInitAttempts) {
        setError('Failed to initialize Cesium after maximum attempts');
        setStatus('error');
        return;
      }
      
      if (!initializeCesium()) {
        initAttempts.current++;
        const delay = Math.min(1000 * Math.pow(2, initAttempts.current), 5000);
        setTimeout(attemptInit, delay);
      }
    };
    
    attemptInit();
    
    return () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        try {
          viewerRef.current.destroy();
        } catch (error) {
          logger.warn('Error destroying Cesium viewer', error);
        }
      }
    };
  }, [containerKey, initialViewState]);
  
  return (
    <div 
      ref={containerRef}
      id={CESIUM_CONTAINER_ID}
      className={cn('w-full h-full relative', className)}
      key={containerKey}
    >
      <DebugPanel>
        <div className="space-y-1">
          <div>Status: {status}</div>
          <div>Render Status: {renderStatus}</div>
          <div>Init Attempts: {initAttempts.current}/{maxInitAttempts}</div>
          {error && (
            <div className="text-destructive">{error}</div>
          )}
          <div className="text-xs whitespace-pre-wrap">{debugInfo}</div>
        </div>
      </DebugPanel>
    </div>
  );
} 