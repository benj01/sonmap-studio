import { Feature, Position } from 'geojson';
import { ProcessorResult } from '../../../../base/types';
import { ShapefileRecord } from '../types/records';

/**
 * Default bounds when no valid coordinates are found
 */
const DEFAULT_BOUNDS: Required<ProcessorResult>['bounds'] = {
  minX: 0,
  minY: 0,
  maxX: 0,
  maxY: 0
};

/**
 * Calculate bounds from shapefile records
 */
export function calculateBoundsFromRecords(records: ShapefileRecord[]): Required<ProcessorResult>['bounds'] {
  const bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  };

  records.forEach(record => {
    const bbox = record?.data?.bbox;
    if (bbox && 
        typeof bbox.xMin === 'number' && !isNaN(bbox.xMin) &&
        typeof bbox.yMin === 'number' && !isNaN(bbox.yMin) &&
        typeof bbox.xMax === 'number' && !isNaN(bbox.xMax) &&
        typeof bbox.yMax === 'number' && !isNaN(bbox.yMax)) {
      bounds.minX = Math.min(bounds.minX, bbox.xMin);
      bounds.minY = Math.min(bounds.minY, bbox.yMin);
      bounds.maxX = Math.max(bounds.maxX, bbox.xMax);
      bounds.maxY = Math.max(bounds.maxY, bbox.yMax);
    }
  });

  return isFinite(bounds.minX) ? bounds : DEFAULT_BOUNDS;
}

/**
 * Update bounds with new records
 */
export function updateBounds(
  currentBounds: ProcessorResult['bounds'],
  records: ShapefileRecord[]
): Required<ProcessorResult>['bounds'] {
  const bounds = currentBounds ?? {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  };

  records.forEach(record => {
    const bbox = record?.data?.bbox;
    if (bbox && 
        typeof bbox.xMin === 'number' && !isNaN(bbox.xMin) &&
        typeof bbox.yMin === 'number' && !isNaN(bbox.yMin) &&
        typeof bbox.xMax === 'number' && !isNaN(bbox.xMax) &&
        typeof bbox.yMax === 'number' && !isNaN(bbox.yMax)) {
      bounds.minX = Math.min(bounds.minX, bbox.xMin);
      bounds.minY = Math.min(bounds.minY, bbox.yMin);
      bounds.maxX = Math.max(bounds.maxX, bbox.xMax);
      bounds.maxY = Math.max(bounds.maxY, bbox.yMax);
    }
  });

  return isFinite(bounds.minX) ? bounds : DEFAULT_BOUNDS;
}

/**
 * Update bounds with a coordinate pair
 */
function updateBoundsWithCoordinate(bounds: ProcessorResult['bounds'], [x, y]: Position) {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
}

/**
 * Get bounds for a specific feature
 */
export function getFeatureBounds(feature: Feature): Required<ProcessorResult>['bounds'] {
  if (!feature.geometry) {
    return DEFAULT_BOUNDS;
  }

  const bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  };

  // Try to use bbox if available
  if (feature.bbox && feature.bbox.length >= 4) {
    bounds.minX = feature.bbox[0];
    bounds.minY = feature.bbox[1];
    bounds.maxX = feature.bbox[2];
    bounds.maxY = feature.bbox[3];
    return bounds;
  }

  // Calculate from coordinates
  switch (feature.geometry.type) {
    case 'Point': {
      const coords = feature.geometry.coordinates;
      updateBoundsWithCoordinate(bounds, coords);
      break;
    }

    case 'LineString': {
      feature.geometry.coordinates.forEach(coord => {
        updateBoundsWithCoordinate(bounds, coord);
      });
      break;
    }

    case 'Polygon': {
      feature.geometry.coordinates[0].forEach(coord => {
        updateBoundsWithCoordinate(bounds, coord);
      });
      break;
    }

    case 'MultiPoint': {
      feature.geometry.coordinates.forEach(coord => {
        updateBoundsWithCoordinate(bounds, coord);
      });
      break;
    }

    case 'MultiLineString': {
      feature.geometry.coordinates.forEach(line => {
        line.forEach(coord => {
          updateBoundsWithCoordinate(bounds, coord);
        });
      });
      break;
    }

    case 'MultiPolygon': {
      feature.geometry.coordinates.forEach(polygon => {
        polygon[0].forEach(coord => {
          updateBoundsWithCoordinate(bounds, coord);
        });
      });
      break;
    }

    case 'GeometryCollection': {
      feature.geometry.geometries.forEach(geom => {
        const geomBounds = getFeatureBounds({
          type: 'Feature',
          geometry: geom,
          properties: null
        });
        bounds.minX = Math.min(bounds.minX, geomBounds.minX);
        bounds.minY = Math.min(bounds.minY, geomBounds.minY);
        bounds.maxX = Math.max(bounds.maxX, geomBounds.maxX);
        bounds.maxY = Math.max(bounds.maxY, geomBounds.maxY);
      });
      break;
    }
  }

  return isFinite(bounds.minX) ? bounds : DEFAULT_BOUNDS;
}
