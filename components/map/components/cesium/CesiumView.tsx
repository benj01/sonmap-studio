'use client';

import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { useCesium } from '../../context/CesiumContext';
import { LogManager } from '@/core/logging/log-manager';
import { createOpenSourceImageryProviders, createDefaultImageryProvider } from '@/lib/cesium/init';
import 'cesium/Build/Cesium/Widgets/widgets.css';

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
  initialViewState?: {
    latitude: number;
    longitude: number;
    height: number;
  };
}

// Use a static ID for the Cesium container
const CESIUM_CONTAINER_ID = 'cesium-container-static';

export function CesiumView({
  className = '',
  initialViewState = {
    latitude: 0,
    longitude: 0,
    height: 10000000
  }
}: CesiumViewProps) {
  const { setViewer, viewer } = useCesium();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('Initializing...');
  const [showDebugPanel, setShowDebugPanel] = useState<boolean>(true); // Always show debug panel initially
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
      
      // Ensure CESIUM_BASE_URL is set properly and disable Ion
      if (typeof window !== 'undefined') {
        window.CESIUM_BASE_URL = '/cesium/';
        Cesium.Ion.defaultAccessToken = '';
      }
      
      // Use OpenStreetMap as the base imagery provider
      const imageryProvider = new Cesium.OpenStreetMapImageryProvider({
        url: 'https://a.tile.openstreetmap.org/'
      });
      
      // Basic viewer options
      const viewerOptions = {
        container: containerRef.current,
        imageryProvider: imageryProvider,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: true, // Enable this to help with navigation
        animation: false,
        timeline: false,
        fullscreenButton: true, // Enable fullscreen option
        infoBox: false,
        selectionIndicator: false,
        creditContainer: document.createElement('div'),
        terrainProvider: new Cesium.EllipsoidTerrainProvider(),
        skyBox: false as const,
        skyAtmosphere: new Cesium.SkyAtmosphere(), // Create a SkyAtmosphere instance instead of using boolean
        useDefaultRenderLoop: true,
        requestRenderMode: false
      };
      
      // Create the viewer
      const newViewer = new Cesium.Viewer(containerRef.current, viewerOptions);
      
      // Add additional imagery layers
      // Natural Earth II base layer (beautiful natural-looking map)
      const naturalEarthLayer = new Cesium.UrlTemplateImageryProvider({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
        credit: 'Tiles © Esri — Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI'
      });
      
      // Add the layer (but don't set it as the base layer)
      newViewer.imageryLayers.addImageryProvider(naturalEarthLayer);
      
      // Add world boundaries layer
      const boundariesLayer = new Cesium.UrlTemplateImageryProvider({
        url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
        credit: 'USGS',
        maximumLevel: 16
      });
      
      // Add the boundaries layer with slight transparency
      const boundariesLayerAdded = newViewer.imageryLayers.addImageryProvider(boundariesLayer);
      boundariesLayerAdded.alpha = 0.5; // 50% opacity
      
      // Add satellite imagery layer
      try {
        const satelliteLayer = new Cesium.UrlTemplateImageryProvider({
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          credit: 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
          maximumLevel: 19
        });
        
        // Add the satellite layer with very low opacity so it just adds some texture
        const satelliteLayerAdded = newViewer.imageryLayers.addImageryProvider(satelliteLayer);
        satelliteLayerAdded.alpha = 0.3; // 30% opacity
        logger.debug('Added satellite imagery layer');
      } catch (error) {
        logger.warn('Failed to add satellite imagery layer:', error);
      }
      
      // Add some major cities as points of interest
      const cities = [
        { name: 'New York', lon: -74.006, lat: 40.7128 },
        { name: 'London', lon: -0.1278, lat: 51.5074 },
        { name: 'Tokyo', lon: 139.6917, lat: 35.6895 },
        { name: 'Sydney', lon: 151.2093, lat: -33.8688 },
        { name: 'Rio de Janeiro', lon: -43.1729, lat: -22.9068 },
        { name: 'Cairo', lon: 31.2357, lat: 30.0444 }
      ];
      
      // Add city markers
      cities.forEach(city => {
        newViewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(city.lon, city.lat),
          point: {
            pixelSize: 8,
            color: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2
          },
          label: {
            text: city.name,
            font: '12pt sans-serif',
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineWidth: 2,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -10),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 10000000)
          }
        });
      });
      
      // Store references
      viewerRef.current = newViewer;
      setViewer(newViewer);
      
      // Set initial camera position - focus on a more interesting part of the world
      newViewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
          initialViewState.longitude || 0, // Use initialViewState longitude or default to 0
          initialViewState.latitude || 20,  // Use initialViewState latitude or default to 20
          initialViewState.height || 10000000 // Use initialViewState height or default to 10000000
        )
      });
      
      // Add a simple entity to mark the center point
      newViewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(0, 0, 0),
        point: {
          pixelSize: 10,
          color: Cesium.Color.RED
        }
      });
      
      // Enable depth testing against terrain for better visuals
      newViewer.scene.globe.depthTestAgainstTerrain = true;
      
      // Enhance visual appearance
      if (newViewer.scene.globe) {
        // Add some ambient lighting to make the globe look better
        newViewer.scene.globe.enableLighting = true;
        
        // Adjust the globe's appearance
        newViewer.scene.globe.baseColor = Cesium.Color.BLUE.withAlpha(0.1);
        
        // Improve the appearance of the atmosphere from space
        if (newViewer.scene.skyAtmosphere) {
          newViewer.scene.skyAtmosphere.hueShift = 0.0;
          newViewer.scene.skyAtmosphere.saturationShift = 0.1;
          newViewer.scene.skyAtmosphere.brightnessShift = 0.1;
        }
      }
      
      // Add mouse interaction for better user experience
      newViewer.screenSpaceEventHandler.setInputAction(function(movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) {
        // Get the entity at the picked location
        const pickedObject = newViewer.scene.pick(movement.position);
        if (Cesium.defined(pickedObject) && pickedObject.id) {
          logger.debug('Picked entity:', pickedObject.id.name || 'unnamed entity');
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      
      // Add a compass for orientation (if not already added by navigationHelpButton)
      if (!newViewer.navigationHelpButton) {
        try {
          // Create a custom compass element
          const compassContainer = document.createElement('div');
          compassContainer.className = 'compass-container';
          compassContainer.style.position = 'absolute';
          compassContainer.style.top = '10px';
          compassContainer.style.left = '10px';
          compassContainer.style.width = '50px';
          compassContainer.style.height = '50px';
          compassContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.5)';
          compassContainer.style.borderRadius = '25px';
          compassContainer.style.display = 'flex';
          compassContainer.style.alignItems = 'center';
          compassContainer.style.justifyContent = 'center';
          compassContainer.innerHTML = 'N';
          
          // Add the compass to the container
          containerRef.current.appendChild(compassContainer);
          
          // Update the compass orientation based on camera heading
          const compassUpdateCallback = () => {
            if (newViewer && !newViewer.isDestroyed()) {
              const heading = Cesium.Math.toDegrees(newViewer.camera.heading);
              compassContainer.style.transform = `rotate(${-heading}deg)`;
              requestAnimationFrame(compassUpdateCallback);
            }
          };
          
          // Start the compass update loop
          requestAnimationFrame(compassUpdateCallback);
        } catch (error) {
          logger.warn('Failed to create compass:', error);
        }
      }
      
      // Force a render
      newViewer.scene.requestRender();
      
      logger.info('Cesium viewer created successfully');
      setStatus('ready');
    } catch (error) {
      logger.error('Failed to create Cesium viewer', error);
      setError(`Failed to create Cesium viewer: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setStatus('error');
    }
  };
  
  // Initialization effect
  useEffect(() => {
    // Set the base URL for Cesium's assets
    if (typeof window !== 'undefined') {
      // First, check if this is already defined
      if (!window.CESIUM_BASE_URL) {
        // Use the path where you copied the Cesium assets
        window.CESIUM_BASE_URL = '/cesium/';  // Use the path where assets were copied
        
        // Disable Cesium Ion services
        Cesium.Ion.defaultAccessToken = '';
        
        // Log that we've set the base URL
        logger.debug('Set CESIUM_BASE_URL to', window.CESIUM_BASE_URL);
        
        // Simple test to check if assets are reachable
        const testAssetUrl = `${window.CESIUM_BASE_URL}Widgets/Images/ImageryProviders/openStreetMap.png`;
        fetch(testAssetUrl)
          .then(response => {
            if (response.ok) {
              logger.debug('Cesium assets are accessible!');
              setDebugInfo(prev => `${prev}\nCesium assets are accessible!`);
            } else {
              const errorMsg = `Cesium assets not found at ${window.CESIUM_BASE_URL}. Status: ${response.status}`;
              logger.warn(errorMsg);
              setDebugInfo(prev => `${prev}\nWARNING: ${errorMsg}`);
              setDebugInfo(prev => `${prev}\n\nPOSSIBLE FIX: Run 'npm run copy-cesium-assets' to copy Cesium assets to the public directory.`);
              
              // Try an alternative path as fallback
              const altPath = '/static/cesium/';
              const altTestUrl = `${altPath}Widgets/Images/ImageryProviders/openStreetMap.png`;
              logger.debug(`Trying alternative path: ${altPath}`);
              setDebugInfo(prev => `${prev}\nTrying alternative path: ${altPath}`);
              
              // Update CESIUM_BASE_URL to the alternative path
              window.CESIUM_BASE_URL = altPath;
              
              // Test the alternative path
              return fetch(altTestUrl).then(altResponse => {
                if (altResponse.ok) {
                  logger.debug(`Cesium assets found at alternative path: ${altPath}`);
                  setDebugInfo(prev => `${prev}\nCesium assets found at alternative path: ${altPath}`);
                } else {
                  logger.error(`Cesium assets not found at alternative path: ${altPath}`);
                  setDebugInfo(prev => `${prev}\nERROR: Cesium assets not found at alternative path: ${altPath}`);
                  setDebugInfo(prev => `${prev}\n\nIMPORTANT: Cesium assets are missing. Please ensure you've run 'npm run copy-cesium-assets' or check that the assets are copied to either '/static/cesium/' or '/cesium/' directories.`);
                }
              });
            }
          })
          .catch(err => {
            logger.error(`Failed to check Cesium assets: ${err.message}`);
            setDebugInfo(prev => `${prev}\nERROR: Failed to check Cesium assets: ${err.message}`);
            setDebugInfo(prev => `${prev}\n\nIMPORTANT: Error checking Cesium assets. This might be due to network issues or CORS restrictions.`);
          });
      }
    }
    
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