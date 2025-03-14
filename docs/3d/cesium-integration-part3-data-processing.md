# CesiumJS Integration Technical Specification - Part 3: Data Processing

## Introduction

This document outlines the data processing architecture for integrating 3D visualization capabilities using CesiumJS, focusing on leveraging our existing PostGIS infrastructure in Supabase rather than relying on Cesium Ion services.

## Data Processing Architecture

### Overview

The data processing pipeline will handle:
1. Parsing various file formats (starting with GeoJSON and Shapefile, later adding XYZ, CSV, point clouds, DWG, DXF)
2. Converting data to CesiumJS-compatible formats
3. Storing processed data in PostGIS
4. Retrieving and rendering data in the CesiumJS viewer

### Parser Extensions

We'll initially focus on enhancing our existing GeoJSON and Shapefile parsers to extract 3D information:

```typescript
// Enhanced GeoJSON parser with 3D support
// core/processors/geojson-parser.ts

export class GeoJSONParser implements GeoDataParser {
  // Existing parsing methods
  
  /**
   * Extract 3D information from GeoJSON features
   * - Checks for z coordinates in geometries
   * - Extracts height/altitude properties
   * - Handles extruded polygons with height information
   */
  extract3DInformation(geojson: any): any {
    // Implementation details
    // 1. Extract z values from coordinates if present
    // 2. Look for properties like 'height', 'altitude', 'elevation'
    // 3. Handle GeoJSON extensions for 3D like building heights
    
    return {
      has3DData: boolean,
      heightProperty: string | null,
      extrusionProperty: string | null,
      // Additional 3D metadata
    };
  }
}
```

Later, we'll add additional parsers following the same pattern.

### Data Conversion Utilities

Create utilities for converting between different data formats:

```typescript
// lib/cesium/converters/geojson-to-cesium.ts

import { Cartesian3, PolygonHierarchy, Color, Entity } from 'cesium';

/**
 * Convert GeoJSON data to Cesium entities
 * @param geojson The GeoJSON data to convert
 * @param options Options for conversion
 * @returns Array of Cesium entities
 */
export function geojsonToCesium(
  geojson: any,
  options: {
    extrudeHeight?: boolean | string;
    defaultHeight?: number;
    color?: Color | string;
  } = {}
): Entity[] {
  const entities: Entity[] = [];
  
  // Process features and create appropriate Cesium entities
  // Implementation details for each geometry type
  
  return entities;
}
```

### PostGIS Integration for 3D

Extend our existing PostGIS schema in Supabase to support 3D data:

```sql
-- Add Z dimension to existing geometry tables where needed
ALTER TABLE geometries
  ALTER COLUMN geometry TYPE geometry(GEOMETRYZ, 4326);

-- Create table for 3D tileset metadata
CREATE TABLE IF NOT EXISTS tileset_metadata (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  asset_id INTEGER REFERENCES assets(id),
  bounding_volume JSONB,
  root_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Functions to interact with 3D data in PostGIS:

```typescript
// lib/supabase/spatial3d.ts

import { createClient } from '@supabase/supabase-js';

/**
 * Store 3D geometries in PostGIS via Supabase
 * @param tableName Table to store geometries in
 * @param geometries Array of 3D geometries with properties
 * @returns Result of the insertion operation
 */
export async function store3DGeometries(
  tableName: string,
  geometries: Array<{
    geometry: any; // GeoJSON geometry with Z coordinates
    properties: Record<string, any>;
  }>
): Promise<{success: boolean; count: number; error?: any}> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  
  try {
    // Convert GeoJSON geometries to PostGIS format with Z coordinates
    const rows = geometries.map(g => ({
      geometry: `ST_SetSRID(ST_GeomFromGeoJSON('${JSON.stringify(g.geometry)}'), 4326)`,
      ...g.properties
    }));
    
    // Insert into specified table
    const { data, error } = await supabase.from(tableName).insert(rows);
    
    if (error) throw error;
    
    return {
      success: true,
      count: rows.length
    };
  } catch (error) {
    return {
      success: false,
      count: 0,
      error
    };
  }
}
```

### Terrain Processing

Implementation for generating terrain from height data:

```typescript
// lib/cesium/terrain.ts

import { createQuantizedMeshTerrainData } from 'cesium';

/**
 * Generate quantized-mesh terrain tiles from height data
 * @param heightData Array of points with elevation
 * @param bounds Bounding box [west, south, east, north]
 * @param options Terrain generation options
 * @returns Path to generated terrain tileset
 */
export async function generateTerrainTiles(
  heightData: Array<{x: number, y: number, z: number}>,
  bounds: [number, number, number, number],
  options: {
    resolution?: number;
    outputDir?: string;
  } = {}
): Promise<string> {
  // 1. Create a regular grid from the input points using interpolation
  // 2. Generate a mesh from the height grid
  // 3. Create quantized-mesh tiles at different LOD levels
  // 4. Save tiles to the file system with proper structure
  // 5. Generate a layer.json descriptor
  
  const outputPath = options.outputDir || './public/terrain';
  
  // Implementation details...
  
  return outputPath;
}
```

### 3D Tiles Generation

For buildings and other 3D models:

```typescript
// lib/cesium/tiles.ts

/**
 * Generate 3D Tiles for buildings from GeoJSON
 * @param buildings GeoJSON features with height properties
 * @param options Options for 3D Tiles generation
 * @returns Path to generated 3D Tiles
 */
export async function generateBuildingTiles(
  buildings: any,
  options: {
    heightProperty?: string;
    colorProperty?: string;
    outputDir?: string;
  } = {}
): Promise<string> {
  // 1. Extract building footprints and heights
  // 2. Generate 3D building models (glTF format)
  // 3. Create 3D Tiles hierarchy (tileset.json)
  // 4. Save tiles to the file system
  
  const outputPath = options.outputDir || './public/3dtiles/buildings';
  
  // Implementation details...
  
  return outputPath;
}
```

## File Format Support

Initially, we'll focus on enhancing our GeoJSON and Shapefile parsers to extract and utilize 3D information. Later phases will add support for:

### XYZ/CSV Files

Uses:
- Digital Elevation Models (DEMs)
- Terrain height points
- 3D point data with attributes

### Point Cloud Data

Uses:
- LiDAR data visualization
- 3D scanning results
- Dense survey points

### DWG/DXF Files

Uses:
- CAD models
- Architectural designs
- Engineering structures

## Storage Strategy

Our storage approach will balance performance with cost-effectiveness:

1. **Database Storage**:
   - Store original 3D geometries in PostGIS
   - Store metadata about generated tilesets and terrain
   - Use for spatial queries and analysis

2. **File System Storage**:
   - Store generated 3D Tiles and terrain tiles in the file system
   - Organize in standardized directory structure
   - Serve directly as static assets for efficient delivery

### Directory Structure (to be adapted to the existing structure)

```
public/
  cesium/         # Cesium static assets
  terrain/        # Generated terrain tiles
    {asset_id}/   # Subdirectory for each terrain dataset
      layer.json  # Terrain tileset descriptor
      0/          # Zoom level
        0/        # Row
          0.terrain  # Tile
  3dtiles/        # Generated 3D Tiles
    {asset_id}/   # Subdirectory for each 3D model dataset
      tileset.json  # 3D Tiles tileset descriptor
      content.b3dm  # 3D Tiles binary format files
```

## Performance Optimization

### Level of Detail (LOD)

Implement custom LOD strategies:

```typescript
// lib/cesium/lod.ts

/**
 * Generate level-of-detail representations for 3D models
 * @param model Original 3D model data
 * @param levels Number of LOD levels to generate
 * @returns Array of models at different detail levels
 */
export function generateModelLOD(model: any, levels: number = 3): any[] {
  // Implementation details...
  // 1. Simplify geometry for each level
  // 2. Reduce texture resolution as appropriate
  // 3. Return array of models from highest to lowest detail
  
  return [];
}
```

### Data Flow Sequence

The complete data flow for 3D visualization will follow this sequence:

1. User uploads a file (initially GeoJSON or Shapefile with 3D info)
2. Parser extracts both 2D and 3D information
3. 3D data is stored in PostGIS via Supabase
4. For complex 3D data (terrain, buildings), tilesets are generated
5. Metadata about tilesets is stored in Supabase
6. CesiumJS loads tilesets from the file system via standard HTTP
7. User navigates and interacts with the 3D visualization

## Implementation Phases

### Phase 1: GeoJSON and Shapefile 3D Enhancement

1. Enhance existing parsers to extract 3D information
2. Implement basic 3D entity creation in CesiumJS
3. Add height extrusion for polygons based on properties

### Phase 2: Terrain and Building Generation

1. Implement terrain generation from height data
2. Create 3D building generation from footprints with height
3. Develop storage and retrieval mechanisms

### Phase 3: Additional Format Support

1. Add XYZ/CSV parser for terrain data
2. Implement point cloud visualization
3. Add CAD format support (DWG/DXF)

## Next Steps

After implementing the data processing architecture outlined in this document, proceed to Part 4 of the technical specification, which covers user interface components and interaction for 3D visualization.