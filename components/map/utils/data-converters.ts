'use client';

import * as Cesium from 'cesium';
import { dbLogger } from '@/utils/logging/dbLogger';
import type { Feature, FeatureCollection } from 'geojson';
import { summarizeFeaturesForLogging } from './logging';

const LOG_SOURCE = 'DataConverters';

interface CsvToCesiumOptions {
  pointColor?: { rgba: [number, number, number, number] };
  pointSize?: number;
  outlineColor?: { rgba: [number, number, number, number] };
  outlineWidth?: number;
  [key: string]: unknown;
}

interface XyzToCesiumOptions {
  [key: string]: unknown;
}

interface CzmlDocument {
  id: string;
  name: string;
  version: string;
}

interface CzmlPoint {
  id: string;
  position: {
    cartographicDegrees: [number, number, number];
  };
  point: {
    color: { rgba: [number, number, number, number] };
    pixelSize: number;
    outlineColor: { rgba: [number, number, number, number] };
    outlineWidth: number;
  };
}

type CzmlEntity = CzmlDocument | CzmlPoint;

/**
 * Convert GeoJSON to Cesium entities
 */
export async function geoJsonToCesium(
  geoJson: FeatureCollection | Feature,
  options: {
    strokeColor?: string;
    strokeWidth?: number;
    fillColor?: string;
    fillOpacity?: number;
    clampToGround?: boolean;
    [key: string]: unknown;
  } = {}
) {
  const context = {
    source: LOG_SOURCE,
    options,
    ...(geoJson && 'features' in geoJson && Array.isArray((geoJson as any).features)
      ? { summary: summarizeFeaturesForLogging((geoJson as any).features, 'info') }
      : {})
  };

  try {
    await dbLogger.debug('Converting GeoJSON to Cesium entities', context);
    
    // Create a GeoJSON data source
    const dataSource = new Cesium.GeoJsonDataSource();
    
    // Load the GeoJSON data
    return await dataSource.load(geoJson, {
      stroke: Cesium.Color.fromCssColorString(options.strokeColor || '#1E88E5'),
      strokeWidth: options.strokeWidth || 3,
      fill: Cesium.Color.fromCssColorString(options.fillColor || '#1E88E5').withAlpha(options.fillOpacity || 0.5),
      clampToGround: options.clampToGround !== undefined ? options.clampToGround : true,
      ...options
    });
  } catch (error) {
    await dbLogger.error('Error converting GeoJSON to Cesium entities', {
      ...context,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error
    });
    throw error;
  }
}

/**
 * Convert CSV data to Cesium entities
 */
export async function csvToCesium(csvData: string, options: CsvToCesiumOptions = {}) {
  const context = {
    source: LOG_SOURCE,
    options
  };

  try {
    await dbLogger.debug('Converting CSV to Cesium entities', context);
    
    // Create a CZML data source
    const dataSource = new Cesium.CzmlDataSource();
    
    // Parse CSV data
    const lines = csvData.split('\n');
    const headers = lines[0].split(',');
    
    // Find the latitude, longitude, and height columns
    const latIndex = headers.findIndex(h => 
      h.toLowerCase().includes('lat') || h.toLowerCase() === 'y');
    const lonIndex = headers.findIndex(h => 
      h.toLowerCase().includes('lon') || h.toLowerCase() === 'x');
    const heightIndex = headers.findIndex(h => 
      h.toLowerCase().includes('height') || 
      h.toLowerCase().includes('altitude') || 
      h.toLowerCase() === 'z');
    
    if (latIndex === -1 || lonIndex === -1) {
      throw new Error('CSV data must contain latitude and longitude columns');
    }
    
    // Create a CZML document
    const czml: CzmlEntity[] = [
      {
        id: 'document',
        name: 'CSV Data',
        version: '1.0'
      }
    ];
    
    // Convert each line to a CZML point
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const values = line.split(',');
      const lat = parseFloat(values[latIndex]);
      const lon = parseFloat(values[lonIndex]);
      const height = heightIndex !== -1 ? parseFloat(values[heightIndex]) : 0;
      
      if (isNaN(lat) || isNaN(lon)) continue;
      
      czml.push({
        id: `point-${i}`,
        position: {
          cartographicDegrees: [lon, lat, height]
        },
        point: {
          color: options.pointColor || { rgba: [30, 136, 229, 255] },
          pixelSize: options.pointSize || 10,
          outlineColor: options.outlineColor || { rgba: [255, 255, 255, 255] },
          outlineWidth: options.outlineWidth || 2
        }
      });
    }
    
    // Load the CZML data
    return await dataSource.load(czml);
  } catch (error) {
    await dbLogger.error('Error converting CSV to Cesium entities', {
      ...context,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error
    });
    throw error;
  }
}

/**
 * Convert XYZ data to Cesium terrain
 */
export async function xyzToCesiumTerrain(xyzData: string, options: XyzToCesiumOptions = {}) {
  const context = {
    source: LOG_SOURCE,
    options
  };

  try {
    await dbLogger.debug('Converting XYZ to Cesium terrain', context);
    
    // This is a placeholder for actual terrain generation
    // In a real implementation, you would:
    // 1. Parse the XYZ data
    // 2. Generate a heightmap
    // 3. Create a terrain provider from the heightmap
    
    // For now, we'll just return a simple heightmap
    const terrainProvider = new Cesium.EllipsoidTerrainProvider();
    
    return terrainProvider;
  } catch (error) {
    await dbLogger.error('Error converting XYZ to Cesium terrain', {
      ...context,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error
    });
    throw error;
  }
}

/**
 * Convert Cesium entities to GeoJSON
 */
export async function cesiumToGeoJson(dataSource: Cesium.DataSource): Promise<FeatureCollection> {
  const context = {
    source: LOG_SOURCE
  };

  try {
    await dbLogger.debug('Converting Cesium entities to GeoJSON', context);
    
    const entities = dataSource.entities.values;
    const features: Feature[] = [];
    
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      
      // Skip entities without position
      if (!entity.position) continue;
      
      // Get the position
      const position = entity.position.getValue(Cesium.JulianDate.now());
      if (!position) continue;
      
      // Convert to cartographic
      const cartographic = Cesium.Cartographic.fromCartesian(position);
      const lon = Cesium.Math.toDegrees(cartographic.longitude);
      const lat = Cesium.Math.toDegrees(cartographic.latitude);
      const height = cartographic.height;
      
      // Create a GeoJSON feature
      const feature: Feature = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [lon, lat, height]
        },
        properties: {}
      };
      
      // Add properties
      if (entity.properties) {
        const propertyNames = entity.properties.propertyNames;
        for (let j = 0; j < propertyNames.length; j++) {
          const name = propertyNames[j];
          const value = entity.properties[name].getValue(Cesium.JulianDate.now());
          if (feature.properties) {
            feature.properties[name] = value;
          }
        }
      }
      
      features.push(feature);
    }
    
    // Create a GeoJSON FeatureCollection
    return {
      type: 'FeatureCollection',
      features
    };
  } catch (error) {
    await dbLogger.error('Error converting Cesium entities to GeoJSON', {
      ...context,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error
    });
    throw error;
  }
} 