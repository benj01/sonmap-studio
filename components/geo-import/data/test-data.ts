/**
 * Test data for geo import functionality
 * Contains sample GeoJSON features in Swiss LV95 (EPSG:2056) coordinate system
 */

import type { Feature, Point, Polygon, LineString, Geometry } from 'geojson';

// Generate a grid of points around a center point
export const generateTestPoints = (
  count: number = 50,
  centerX: number = 2600000,
  centerY: number = 1200000,
  spacing: number = 100
): Feature<Point>[] => {
  const features: Feature<Point>[] = [];
  const timestamp = new Date().toISOString();
  
  // Calculate grid dimensions
  const gridSize = Math.ceil(Math.sqrt(count));
  const startX = centerX - (gridSize / 2) * spacing;
  const startY = centerY - (gridSize / 2) * spacing;
  
  let id = 0;
  for (let i = 0; i < gridSize && features.length < count; i++) {
    for (let j = 0; j < gridSize && features.length < count; j++) {
      const x = startX + i * spacing;
      const y = startY + j * spacing;
      
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [x, y, 0]
        },
        properties: {
          id: id++,
          name: `Test Point ${id}`,
          timestamp,
          x,
          y
        }
      });
    }
  }
  
  return features;
};

// Generate a single polygon that encompasses several points
export const generateTestPolygon = (
  centerX: number = 2600000,
  centerY: number = 1200000,
  size: number = 500
): Feature<Polygon> => {
  const halfSize = size / 2;
  
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [centerX - halfSize, centerY - halfSize, 0],
        [centerX + halfSize, centerY - halfSize, 0],
        [centerX + halfSize, centerY + halfSize, 0],
        [centerX - halfSize, centerY + halfSize, 0],
        [centerX - halfSize, centerY - halfSize, 0]
      ]]
    },
    properties: {
      name: 'Test Polygon',
      timestamp: new Date().toISOString(),
      area: size * size
    }
  };
};

// Generate a linestring that connects several points
export const generateTestLineString = (
  centerX: number = 2600000,
  centerY: number = 1200000,
  length: number = 1000,
  segments: number = 5
): Feature<LineString> => {
  const coordinates: [number, number, number][] = [];
  const segmentLength = length / segments;
  
  for (let i = 0; i <= segments; i++) {
    coordinates.push([
      centerX - length/2 + i * segmentLength,
      centerY + Math.sin(i * Math.PI / segments) * 200,
      0
    ]);
  }
  
  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates
    },
    properties: {
      name: 'Test LineString',
      timestamp: new Date().toISOString(),
      length
    }
  };
};

// Type guard for GeoJSON Feature
function isFeature(val: unknown): val is Feature {
  return (
    typeof val === 'object' && val !== null &&
    'type' in val && (val as { type: unknown }).type === 'Feature' &&
    'geometry' in val && typeof (val as { geometry: unknown }).geometry === 'object'
  );
}

// Sample dataset with mixed geometry types
export const generateMixedDataset = (
  pointCount: number = 45,
  polygonCount: number = 3,
  lineCount: number = 2
): Feature[] => {
  const features: Feature[] = [];
  
  // Add points
  features.push(...generateTestPoints(pointCount));
  
  // Add polygons
  for (let i = 0; i < polygonCount; i++) {
    const offset = i * 1000;
    features.push(generateTestPolygon(2600000 + offset, 1200000 + offset, 500 + i * 100));
  }
  
  // Add linestrings
  for (let i = 0; i < lineCount; i++) {
    const offset = i * 500;
    features.push(generateTestLineString(2600000, 1200000 + offset, 1000 + i * 200, 5 + i));
  }
  
  return features;
}; 