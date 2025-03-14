# CesiumJS Integration Technical Specification - Part 2: Component Architecture

## Introduction

This document provides detailed technical specifications for the component architecture required to integrate CesiumJS into the existing web application. This is part 2 of the technical specification, focusing on React components and state management.

## Component Structure

### Directory Organization

```
components/
  map/
    components/
      CesiumView.tsx         # 3D viewer component
      MapView.tsx            # Existing 2D viewer component
      ViewToggle.tsx         # Toggle between 2D and 3D views
      CesiumToolbar.tsx      # 3D-specific controls
      CesiumLayerPanel.tsx   # 3D layer management
    hooks/
      useCesiumContext.ts    # Cesium context hook
      useCesiumLayers.ts     # Hook for managing 3D layers
      useCesiumCamera.ts     # Hook for camera controls
    context/
      CesiumContext.tsx      # Context provider for Cesium
    utils/
      cesium-converters.ts   # Utilities for converting between formats
      cesium-entities.ts     # Utilities for creating Cesium entities
```

## Context Provider

### CesiumContext.tsx

```typescript
// components/map/context/CesiumContext.tsx

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Viewer, Scene, Globe, Camera } from 'cesium';
import { initCesium } from '@/lib/cesium/init';

// Define the context shape
interface CesiumContextType {
  viewer: Viewer | null;
  isInitialized: boolean;
  setViewer: (viewer: Viewer | null) => void;
}

// Create the context with default values
const CesiumContext = createContext<CesiumContextType>({
  viewer: null,
  isInitialized: false,
  setViewer: () => {},
});

interface CesiumProviderProps {
  children: ReactNode;
}

export function CesiumProvider({ children }: CesiumProviderProps) {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize Cesium when the provider mounts
  useEffect(() => {
    initCesium();
    setIsInitialized(true);
    
    return () => {
      // Clean up Cesium resources when the provider unmounts
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy();
      }
    };
  }, []);

  const contextValue = {
    viewer,
    isInitialized,
    setViewer,
  };

  return (
    <CesiumContext.Provider value={contextValue}>
      {children}
    </CesiumContext.Provider>
  );
}

// Custom hook for using the Cesium context
export function useCesiumContext() {
  const context = useContext(CesiumContext);
  if (context === undefined) {
    throw new Error('useCesiumContext must be used within a CesiumProvider');
  }
  return context;
}
```

## Core Components

### CesiumView.tsx

```typescript
// components/map/components/CesiumView.tsx

'use client';

import { useEffect, useRef } from 'react';
import { Viewer, Scene, Globe, Camera } from 'cesium';
import { useCesiumContext } from '../context/CesiumContext';
import { createTerrainProvider } from '@/lib/cesium/terrain';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'CesiumView';
const logManager = LogManager.getInstance();

const logger = {
  info: (message: string, data?: any) => {
    logManager.info(SOURCE, message, data);
  },
  warn: (message: string, error?: any) => {
    logManager.warn(SOURCE, message, error);
  },
  error: (message: string, error?: any) => {
    logManager.error(SOURCE, message, error);
  },
  debug: (message: string, data?: any) => {
    logManager.debug(SOURCE, message, data);
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

export function CesiumView({
  className = '',
  initialViewState = {
    latitude: 0,
    longitude: 0,
    height: 10000000
  }
}: CesiumViewProps) {
  const cesiumContainer = useRef<HTMLDivElement>(null);
  const { viewer, setViewer, isInitialized } = useCesiumContext();

  // Initialize Cesium viewer
  useEffect(() => {
    // Skip if we already have a viewer in context
    if (viewer) {
      logger.debug('Cesium viewer already exists in context, skipping initialization');
      return;
    }

    // Skip if Cesium is not initialized
    if (!isInitialized) {
      logger.debug('Cesium is not initialized yet');
      return;
    }

    // Skip if no container
    if (!cesiumContainer.current) {
      logger.debug('No Cesium container available');
      return;
    }

    let cesiumViewer: Viewer | null = null;

    try {
      logger.info('Initializing Cesium viewer', {
        container: !!cesiumContainer.current,
        initialViewState
      });

      // Create the Cesium viewer
      cesiumViewer = new Viewer(cesiumContainer.current, {
        terrainProvider: undefined, // Will be set after initialization
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        animation: false,
        timeline: false,
        fullscreenButton: false,
        vrButton: false,
        infoBox: false,
        selectionIndicator: false,
        shadows: true,
        shouldAnimate: true
      });

      // Set the initial camera position
      cesiumViewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
          initialViewState.longitude,
          initialViewState.latitude,
          initialViewState.height
        )
      });

      // Set up terrain
      createTerrainProvider().then(terrainProvider => {
        if (cesiumViewer && !cesiumViewer.isDestroyed()) {
          cesiumViewer.terrainProvider = terrainProvider;
          logger.info('Terrain provider initialized');
        }
      }).catch(error => {
        logger.error('Failed to initialize terrain provider', error);
      });

      // Store the viewer in context
      setViewer(cesiumViewer);
      logger.info('Cesium viewer initialization complete');

      return () => {
        if (cesiumViewer && !cesiumViewer.isDestroyed()) {
          try {
            logger.info('Cleaning up Cesium viewer');
            cesiumViewer.destroy();
            setViewer(null);
          } catch (error) {
            logger.error('Error during Cesium viewer cleanup', error);
          }
        }
      };
    } catch (error) {
      logger.error('Failed to initialize Cesium viewer', error);
      if (cesiumViewer && !cesiumViewer.isDestroyed()) {
        cesiumViewer.destroy();
      }
      setViewer(null);
    }
  }, [isInitialized, setViewer, viewer, initialViewState]);

  return (
    <div 
      ref={cesiumContainer} 
      className={`w-full h-full ${className}`}
    />
  );
}
```

### ViewToggle.tsx

```typescript
// components/map/components/ViewToggle.tsx

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Cube, Map } from 'lucide-react';
import { useMapContext } from '../hooks/useMapContext';
import { useCesiumContext } from '../context/CesiumContext';

interface ViewToggleProps {
  onToggle?: (is3D: boolean) => void;
}

export function ViewToggle({ onToggle }: ViewToggleProps) {
  const [is3D, setIs3D] = useState(false);
  const { map } = useMapContext();
  const { viewer } = useCesiumContext();

  const toggle = () => {
    const newValue = !is3D;
    setIs3D(newValue);
    
    if (onToggle) {
      onToggle(newValue);
    }
    
    // Additional logic for transitioning between views
    if (newValue) {
      // Switching to 3D
      if (map) {
        // Get current center and zoom from 2D map
        const center = map.getCenter();
        const zoom = map.getZoom();
        
        // Use these values to position the 3D camera
        if (viewer) {
          const height = 500000 / Math.pow(2, zoom - 1);
          viewer.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(
              center.lng,
              center.lat,
              height
            )
          });
        }
      }
    } else {
      // Switching to 2D
      if (viewer && map) {
        // Get current position from 3D camera
        const ellipsoid = viewer.scene.globe.ellipsoid;
        const cartesian = viewer.camera.positionWC;
        const cartographic = ellipsoid.cartesianToCartographic(cartesian);
        const lon = Cesium.Math.toDegrees(cartographic.longitude);
        const lat = Cesium.Math.toDegrees(cartographic.latitude);
        
        // Calculate appropriate zoom level based on height
        const height = cartographic.height;
        const zoom = Math.log2(500000 / height) + 1;
        
        // Set 2D map position
        map.setView([lat, lon], Math.max(0, Math.min(22, zoom)));
      }
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      className="fixed bottom-4 right-4 z-10"
      title={is3D ? "Switch to 2D Map" : "Switch to 3D View"}
    >
      {is3D ? <Map size={16} /> : <Cube size={16} />}
      <span className="ml-2">{is3D ? "2D" : "3D"}</span>
    </Button>
  );
}
```

## Layer Management

### useCesiumLayers.ts

```typescript
// components/map/hooks/useCesiumLayers.ts

import { useState, useEffect } from 'react';
import { useCesiumContext } from '../context/CesiumContext';
import { create3DTileset } from '@/lib/cesium/tiles';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'useCesiumLayers';
const logManager = LogManager.getInstance();

const logger = {
  info: (message: string, data?: any) => {
    logManager.info(SOURCE, message, data);
  },
  error: (message: string, error?: any) => {
    logManager.error(SOURCE, message, error);
  }
};

export interface CesiumLayer {
  id: string;
  name: string;
  type: '3dtiles' | 'terrain' | 'pointcloud' | 'entity';
  visible: boolean;
  assetId?: number;
  url?: string;
  data?: any;
  tileset?: Cesium.Cesium3DTileset;
  entities?: Cesium.Entity[];
}

export function useCesiumLayers() {
  const [layers, setLayers] = useState<CesiumLayer[]>([]);
  const { viewer } = useCesiumContext();

  // Add a new layer
  const addLayer = async (layer: Omit<CesiumLayer, 'tileset' | 'entities'>) => {
    if (!viewer) {
      logger.error('Cannot add layer: Cesium viewer not initialized');
      return;
    }

    try {
      let newLayer: CesiumLayer = { ...layer, visible: true };

      // Handle different layer types
      switch (layer.type) {
        case '3dtiles':
          if (layer.assetId) {
            const tileset = await create3DTileset(layer.assetId);
            viewer.scene.primitives.add(tileset);
            newLayer.tileset = tileset;
          } else if (layer.url) {
            const tileset = new Cesium.Cesium3DTileset({ url: layer.url });
            viewer.scene.primitives.add(tileset);
            newLayer.tileset = tileset;
          }
          break;
          
        case 'pointcloud':
          // Similar to 3dtiles but with point cloud specific settings
          if (layer.assetId) {
            const tileset = await create3DTileset(layer.assetId);
            // Apply point cloud specific styling
            tileset.style = new Cesium.Cesium3DTileStyle({
              pointSize: 2
            });
            viewer.scene.primitives.add(tileset);
            newLayer.tileset = tileset;
          }
          break;
          
        case 'entity':
          if (layer.data) {
            // Add entities from GeoJSON or other data
            const entities: Cesium.Entity[] = [];
            // Implementation depends on data format
            newLayer.entities = entities;
          }
          break;
      }

      setLayers(prevLayers => [...prevLayers, newLayer]);
      logger.info('Added layer', { id: layer.id, type: layer.type });
      
      return newLayer;
    } catch (error) {
      logger.error('Failed to add layer', error);
      return null;
    }
  };

  // Toggle layer visibility
  const toggleLayerVisibility = (layerId: string) => {
    setLayers(prevLayers => 
      prevLayers.map(layer => {
        if (layer.id === layerId) {
          // Update visibility in Cesium
          if (layer.tileset) {
            layer.tileset.show = !layer.visible;
          }
          if (layer.entities) {
            layer.entities.forEach(entity => {
              entity.show = !layer.visible;
            });
          }
          
          return { ...layer, visible: !layer.visible };
        }
        return layer;
      })
    );
  };

  // Remove a layer
  const removeLayer = (layerId: string) => {
    const layerToRemove = layers.find(layer => layer.id === layerId);
    
    if (layerToRemove && viewer) {
      // Clean up Cesium resources
      if (layerToRemove.tileset) {
        viewer.scene.primitives.remove(layerToRemove.tileset);
      }
      if (layerToRemove.entities) {
        layerToRemove.entities.forEach(entity => {
          viewer.entities.remove(entity);
        });
      }
    }
    
    setLayers(prevLayers => prevLayers.filter(layer => layer.id !== layerId));
    logger.info('Removed layer', { id: layerId });
  };

  // Clean up all layers when component unmounts
  useEffect(() => {
    return () => {
      if (viewer) {
        layers.forEach(layer => {
          if (layer.tileset) {
            viewer.scene.primitives.remove(layer.tileset);
          }
          if (layer.entities) {
            layer.entities.forEach(entity => {
              viewer.entities.remove(entity);
            });
          }
        });
      }
    };
  }, [viewer, layers]);

  return {
    layers,
    addLayer,
    toggleLayerVisibility,
    removeLayer
  };
}
```

## Integration with Existing Application

### MapContainer.tsx (Updated)

```typescript
// components/map/components/MapContainer.tsx

'use client';

import { useState } from 'react';
import { MapView } from './MapView';
import { CesiumView } from './CesiumView';
import { ViewToggle } from './ViewToggle';
import { MapProvider } from '../context/MapContext';
import { CesiumProvider } from '../context/CesiumContext';
import { LayerPanel } from './LayerPanel';
import { CesiumLayerPanel } from './CesiumLayerPanel';

export function MapContainer() {
  const [is3D, setIs3D] = useState(false);
  
  const handleViewToggle = (is3DView: boolean) => {
    setIs3D(is3DView);
  };
  
  return (
    <div className="relative w-full h-full">
      <MapProvider>
        <CesiumProvider>
          {/* Show either 2D or 3D view based on state */}
          <div className="w-full h-full" style={{ display: is3D ? 'none' : 'block' }}>
            <MapView />
          </div>
          
          <div className="w-full h-full" style={{ display: is3D ? 'block' : 'none' }}>
            <CesiumView />
          </div>
          
          {/* Controls */}
          <ViewToggle onToggle={handleViewToggle} />
          
          {/* Layer panels */}
          <div style={{ display: is3D ? 'none' : 'block' }}>
            <LayerPanel />
          </div>
          
          <div style={{ display: is3D ? 'block' : 'none' }}>
            <CesiumLayerPanel />
          </div>
        </CesiumProvider>
      </MapProvider>
    </div>
  );
}
```

## Next Steps

After implementing the component architecture outlined in this document, proceed to Part 3 of the technical specification, which covers the data processing and conversion for 3D visualization. 