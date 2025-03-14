'use client';

import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { useCesium } from '../../context/CesiumContext';
import { LogManager } from '@/core/logging/log-manager';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  
  // Initialization effect
  useEffect(() => {
    logger.debug('CesiumView mounted, container ref:', containerRef.current);
    setDebugInfo(prev => `${prev}\nContainer ref: ${containerRef.current ? 'available' : 'not available'}`);
    
    // Only initialize if we have a container and no viewer yet
    if (containerRef.current && !viewerRef.current) {
      // Simple timeout to ensure DOM is ready
      const initTimeout = setTimeout(() => {
        try {
          // Make sure container is still available
          if (!containerRef.current) {
            logger.warn('Container ref is no longer available');
            setDebugInfo(prev => `${prev}\nContainer ref is no longer available`);
            return;
          }
          
          logger.info('Creating Cesium viewer');
          setDebugInfo(prev => `${prev}\nCreating Cesium viewer...`);
          
          // Create a very basic Cesium viewer with minimal configuration
          const newViewer = new Cesium.Viewer(containerRef.current, {
            // Disable all UI components
            baseLayerPicker: false,
            geocoder: false,
            homeButton: false,
            sceneModePicker: false,
            navigationHelpButton: false,
            animation: false,
            timeline: false,
            fullscreenButton: false,
            infoBox: false,
            selectionIndicator: false,
            
            // Create an empty scene without sky features
            skyBox: undefined,
            skyAtmosphere: undefined,
            shadows: false,
            
            // Disable the credit container to avoid loading credit images
            creditContainer: document.createElement('div'),
            
            // Avoid automatic rendering
            useDefaultRenderLoop: false,
            requestRenderMode: true,
            maximumRenderTimeChange: Infinity,
            
            // Explicitly set to not use Cesium Ion
            imageryProvider: new Cesium.GridImageryProvider({
              cells: 4,
              color: Cesium.Color.fromCssColorString('#aaaaaa')
            }),
            terrainProvider: new Cesium.EllipsoidTerrainProvider()
          } as Cesium.Viewer.ConstructorOptions);
          
          // Disable features that might try to load external assets
          if (newViewer.scene) {
            // Disable fog
            newViewer.scene.fog.enabled = false;
            
            // Disable globe atmosphere and depth testing
            if (newViewer.scene.globe) {
              newViewer.scene.globe.showGroundAtmosphere = false;
              newViewer.scene.globe.depthTestAgainstTerrain = false;
            }
            
            // Conditionally disable sky features only if they exist
            if (newViewer.scene.skyBox) {
              newViewer.scene.skyBox.show = false;
            }
            if (newViewer.scene.sun) {
              newViewer.scene.sun.show = false;
            }
            if (newViewer.scene.moon) {
              newViewer.scene.moon.show = false;
            }
            if (newViewer.scene.skyAtmosphere) {
              newViewer.scene.skyAtmosphere.show = false;
            }
          }
          
          // Add a simple entity to verify the viewer is working
          newViewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(0, 0, 0),
            point: {
              pixelSize: 10,
              color: Cesium.Color.RED
            },
            label: {
              text: 'Center Point',
              font: '14pt sans-serif',
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              outlineWidth: 2,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -9)
            }
          });
          
          // Set initial camera position
          newViewer.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(
              initialViewState.longitude,
              initialViewState.latitude,
              initialViewState.height
            )
          });
          
          // Force a render
          newViewer.scene.requestRender();
          
          // Store references
          viewerRef.current = newViewer;
          setViewer(newViewer);
          
          // Start a simple render loop
          const renderLoop = () => {
            if (newViewer && !newViewer.isDestroyed()) {
              newViewer.scene.requestRender();
              requestAnimationFrame(renderLoop);
            }
          };
          requestAnimationFrame(renderLoop);
          
          logger.info('Cesium viewer created successfully!');
          setDebugInfo(prev => `${prev}\nCesium viewer created successfully!`);
          setStatus('ready');
        } catch (error: any) {
          logger.error('Failed to create Cesium viewer', error);
          setError(`Failed to create Cesium viewer: ${error.message || 'Unknown error'}`);
          setDebugInfo(prev => `${prev}\nError creating viewer: ${error.message || 'Unknown error'}`);
          setStatus('error');
        }
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
      // No cleanup needed here - the context handles viewer cleanup
      logger.debug('CesiumView unmounting, but not destroying viewer');
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
      ref={containerRef}
      id={CESIUM_CONTAINER_ID}
      className={`w-full h-full ${className}`}
      style={{ 
        position: 'relative',
        minHeight: '400px',
        minWidth: '400px'
      }}
    >
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
    </div>
  );
} 