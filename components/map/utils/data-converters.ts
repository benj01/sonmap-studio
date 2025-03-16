'use client';

import * as Cesium from 'cesium';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'DataConverters';
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

/**
 * Convert GeoJSON to Cesium entities
 */
export function geoJsonToCesium(geoJson: any, options: any = {}) {
  try {
    logger.debug('Converting GeoJSON to Cesium entities', { options });
    
    // Create a GeoJSON data source
    const dataSource = new Cesium.GeoJsonDataSource();
    
    // Load the GeoJSON data
    return dataSource.load(geoJson, {
      stroke: Cesium.Color.fromCssColorString(options.strokeColor || '#1E88E5'),
      strokeWidth: options.strokeWidth || 3,
      fill: Cesium.Color.fromCssColorString(options.fillColor || '#1E88E5').withAlpha(options.fillOpacity || 0.5),
      clampToGround: options.clampToGround !== undefined ? options.clampToGround : true,
      ...options
    });
  } catch (error) {
    logger.error('Error converting GeoJSON to Cesium entities', error);
    throw error;
  }
}

/**
 * Convert CSV data to Cesium entities
 */
export function csvToCesium(csvData: string, options: any = {}) {
  try {
    logger.debug('Converting CSV to Cesium entities', { options });
    
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
    const czml: any[] = [
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
    return dataSource.load(czml);
  } catch (error) {
    logger.error('Error converting CSV to Cesium entities', error);
    throw error;
  }
}

/**
 * Convert XYZ data to Cesium terrain
 */
export function xyzToCesiumTerrain(xyzData: string, options: any = {}) {
  try {
    logger.debug('Converting XYZ to Cesium terrain', { options });
    
    // This is a placeholder for actual terrain generation
    // In a real implementation, you would:
    // 1. Parse the XYZ data
    // 2. Generate a heightmap
    // 3. Create a terrain provider from the heightmap
    
    // For now, we'll just return a simple heightmap
    const terrainProvider = new Cesium.EllipsoidTerrainProvider();
    
    return Promise.resolve(terrainProvider);
  } catch (error) {
    logger.error('Error converting XYZ to Cesium terrain', error);
    throw error;
  }
}

/**
 * Convert Cesium entities to GeoJSON
 */
export function cesiumToGeoJson(dataSource: Cesium.DataSource) {
  try {
    logger.debug('Converting Cesium entities to GeoJSON');
    
    const entities = dataSource.entities.values;
    const features = [];
    
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
      const feature: any = {
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
          feature.properties[name] = value;
        }
      }
      
      features.push(feature);
    }
    
    // Create a GeoJSON FeatureCollection
    const geoJson = {
      type: 'FeatureCollection',
      features
    };
    
    return geoJson;
  } catch (error) {
    logger.error('Error converting Cesium entities to GeoJSON', error);
    throw error;
  }
} 