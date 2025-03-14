# CesiumJS Integration Technical Specification - Part 1: Setup and Configuration

## Introduction

This document provides detailed technical specifications for integrating CesiumJS into the existing web application to enable 3D visualization capabilities. This is part 1 of the technical specification, focusing on setup and configuration.

## Dependencies

### Required Packages

| Package | Version | Purpose |
|---------|---------|---------|
| cesium | ^1.110.0 | Core CesiumJS library |
| copy-webpack-plugin | ^11.0.0 | For copying Cesium assets during build |

### Installation

```bash
npm install cesium copy-webpack-plugin --save
```

## Next.js Configuration

### Webpack Configuration

Update the `next.config.js` file to include the necessary Cesium assets:

```javascript
const CopyWebpackPlugin = require('copy-webpack-plugin');
const path = require('path');
const webpack = require('webpack');

// Merge with existing Next.js configuration
const nextConfig = {
  // ... existing config
  
  webpack: (config, { isServer }) => {
    // Only run this on the client-side build
    if (!isServer) {
      // Define global Cesium variables
      config.plugins.push(
        new webpack.DefinePlugin({
          CESIUM_BASE_URL: JSON.stringify('/static/cesium')
        })
      );
      
      // Copy Cesium assets to static directory
      config.plugins.push(
        new CopyWebpackPlugin({
          patterns: [
            {
              from: path.join(
                path.dirname(require.resolve('cesium')),
                'Build/Cesium/Workers'
              ),
              to: 'static/cesium/Workers',
            },
            {
              from: path.join(
                path.dirname(require.resolve('cesium')),
                'Build/Cesium/ThirdParty'
              ),
              to: 'static/cesium/ThirdParty',
            },
            {
              from: path.join(
                path.dirname(require.resolve('cesium')),
                'Build/Cesium/Assets'
              ),
              to: 'static/cesium/Assets',
            },
            {
              from: path.join(
                path.dirname(require.resolve('cesium')),
                'Build/Cesium/Widgets'
              ),
              to: 'static/cesium/Widgets',
            },
          ],
        })
      );
    }
    
    // Add any existing webpack configurations
    if (typeof nextConfig.webpack === 'function') {
      config = nextConfig.webpack(config, options);
    }
    
    return config;
  },
};

module.exports = nextConfig;
```

## Global Styles

Add the required Cesium CSS to the global styles in `app/globals.css`:

```css
/* Import Cesium widget styles */
@import url('~cesium/Build/Cesium/Widgets/widgets.css');

/* Override Cesium widget styles to match application theme */
.cesium-viewer {
  font-family: inherit;
  --cesium-widget-background: transparent;
}

.cesium-viewer-bottom {
  display: none;
}

/* Additional custom styles for Cesium widgets */
```

## Initialization Module

Create a utility module for initializing Cesium:

```typescript
// lib/cesium/init.ts

/**
 * Initialize Cesium with global configuration
 */
export function initCesium() {
  // Configure default Cesium settings
  // Add any additional global Cesium configuration here
}
```

## Terrain Handling

Create utilities for handling terrain data:

```typescript
// lib/cesium/terrain.ts

import { CesiumTerrainProvider } from 'cesium';

/**
 * Create a terrain provider from local terrain data
 * @param url URL to the local terrain data
 * @returns A CesiumTerrainProvider instance
 */
export function createLocalTerrainProvider(url: string): CesiumTerrainProvider {
  return new CesiumTerrainProvider({
    url,
    requestVertexNormals: true,
    requestWaterMask: true
  });
}

/**
 * Generate terrain from height data (XYZ/CSV)
 * @param heightData Array of height points with x, y, z coordinates
 * @param bounds Bounding box of the terrain
 * @param resolution Resolution of the terrain
 * @returns URL to the generated terrain data
 */
export async function generateTerrainFromHeightData(
  heightData: Array<{x: number, y: number, z: number}>,
  bounds: [number, number, number, number],
  resolution: number
): Promise<string> {
  // Implementation for generating terrain from height data
  // This would create a quantized-mesh terrain tileset from the input data
  // Return the URL to the generated terrain
  return '/terrain/generated';
}
```

## 3D Tiles Handling

Create utilities for handling 3D Tiles:

```typescript
// lib/cesium/tiles.ts

import { Cesium3DTileset } from 'cesium';

/**
 * Create a 3D Tileset from a local tileset
 * @param url URL to the local 3D Tiles data
 * @returns A Cesium3DTileset instance
 */
export function createLocal3DTileset(url: string): Cesium3DTileset {
  return new Cesium3DTileset({
    url,
    maximumScreenSpaceError: 2, // Adjust for quality vs performance
    maximumMemoryUsage: 1024    // In MB
  });
}

/**
 * Generate 3D Tiles from building data
 * @param buildingData Building data in GeoJSON or other format
 * @param options Options for 3D Tiles generation
 * @returns URL to the generated 3D Tiles
 */
export async function generate3DTilesFromBuildings(
  buildingData: any,
  options: {
    extrudeHeight?: number,
    textured?: boolean
  } = {}
): Promise<string> {
  // Implementation for generating 3D Tiles from building data
  // This would create a 3D Tiles tileset from the input data
  // Return the URL to the generated 3D Tiles
  return '/3dtiles/buildings';
}
```

## PostGIS Integration

Create utilities for integrating with PostGIS:

```typescript
// lib/cesium/postgis.ts

/**
 * Fetch 3D data from PostGIS
 * @param tableName Name of the table containing 3D data
 * @param bounds Bounding box to query
 * @param options Additional query options
 * @returns 3D data in a format suitable for Cesium
 */
export async function fetch3DDataFromPostGIS(
  tableName: string,
  bounds: [number, number, number, number],
  options: {
    limit?: number,
    offset?: number,
    filter?: string
  } = {}
): Promise<any> {
  // Implementation for fetching 3D data from PostGIS
  // This would query the database and return the data in a format suitable for Cesium
  return [];
}

/**
 * Store 3D data in PostGIS
 * @param tableName Name of the table to store data in
 * @param data 3D data to store
 * @returns Result of the operation
 */
export async function store3DDataInPostGIS(
  tableName: string,
  data: any
): Promise<{success: boolean, message: string}> {
  // Implementation for storing 3D data in PostGIS
  // This would convert the data to a format suitable for PostGIS and store it
  return {success: true, message: 'Data stored successfully'};
}
```

## Next Steps

After completing the setup and configuration outlined in this document, proceed to Part 2 of the technical specification, which covers the component architecture and integration with the existing application. 