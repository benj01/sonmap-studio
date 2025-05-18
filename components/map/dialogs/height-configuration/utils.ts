import { Feature, Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon, GeometryCollection } from 'geojson';
import { ZCoordinatesInfo, NumericAttributesInfo, SwissCoordinatesInfo, HeightPreviewItem } from './types';
import { dbLogger } from '@/utils/logging/dbLogger';

const SOURCE = 'HeightConfigUtils';

/**
 * Gets the first Z coordinate from a feature or null if none exists
 */
export function getFeatureZCoordinate(feature: Feature): number | null {
  // First check for LV95 stored heights - this takes priority
  if (feature.properties?.height_mode === 'lv95_stored') {
    // Check for lv95_height property first
    if (typeof feature.properties.lv95_height === 'number' && 
        !isNaN(feature.properties.lv95_height)) {
      return feature.properties.lv95_height;
    }
    
    // Fallback to height property if present
    if (typeof feature.properties.height === 'number' && 
        !isNaN(feature.properties.height)) {
      return feature.properties.height;
    }
    
    // Fallback to base_elevation_ellipsoidal if present
    if (typeof feature.properties.base_elevation_ellipsoidal === 'number' && 
        !isNaN(feature.properties.base_elevation_ellipsoidal)) {
      return feature.properties.base_elevation_ellipsoidal;
    }
  }
  
  // Then check for direct Z coordinates in the geometry
  if (!feature.geometry) return null;
  
  try {
    switch (feature.geometry.type) {
      case 'Point': {
        const geometry = feature.geometry as Point;
        const coords = geometry.coordinates;
        return coords.length >= 3 ? coords[2] : null;
      }
      case 'LineString': {
        const geometry = feature.geometry as LineString;
        const coords = geometry.coordinates[0];
        return coords && coords.length >= 3 ? coords[2] : null;
      }
      case 'Polygon': {
        const geometry = feature.geometry as Polygon;
        const coords = geometry.coordinates[0]?.[0];
        return coords && coords.length >= 3 ? coords[2] : null;
      }
      case 'MultiPoint': {
        const geometry = feature.geometry as MultiPoint;
        const coords = geometry.coordinates[0];
        return coords && coords.length >= 3 ? coords[2] : null;
      }
      case 'MultiLineString': {
        const geometry = feature.geometry as MultiLineString;
        const coords = geometry.coordinates[0]?.[0];
        return coords && coords.length >= 3 ? coords[2] : null;
      }
      case 'MultiPolygon': {
        const geometry = feature.geometry as MultiPolygon;
        const coords = geometry.coordinates[0]?.[0]?.[0];
        return coords && coords.length >= 3 ? coords[2] : null;
      }
      case 'GeometryCollection': {
        const geometryCollection = feature.geometry as GeometryCollection;
        if (geometryCollection.geometries && geometryCollection.geometries.length > 0) {
          const firstGeom = geometryCollection.geometries[0];
          if (firstGeom.type === 'Point') {
            const coords = (firstGeom as Point).coordinates;
            return coords.length >= 3 ? coords[2] : null;
          }
        }
        return null;
      }
      default:
        return null;
    }
  } catch (error) {
    (async () => {
      await dbLogger.error('Error extracting Z coordinate from feature', { source: SOURCE, error });
    })().catch(console.error);
    return null;
  }
}

/**
 * Detects if features have Z coordinates
 */
export function detectZCoordinates(features: Feature[]): ZCoordinatesInfo {
  if (!features || features.length === 0) {
    return { 
      hasZ: false, 
      zCount: 0,
      totalCoords: 0,
      zMin: 0,
      zMax: 0,
      message: 'No features found' 
    };
  }
  
  let zCount = 0;
  let zMin = Infinity;
  let zMax = -Infinity;
  let totalCoords = 0;
  let lv95StoredCount = 0;
  let propertyZCount = 0;
  
  // Function to process coordinates recursively
  const processCoords = (coords: number[] | number[][]): void => {
    if (!Array.isArray(coords)) return;
    // If this is a single coordinate (number[])
    if (typeof coords[0] === 'number') {
      if (coords.length >= 3 && typeof coords[2] === 'number') {
        const z = coords[2];
        if (!isNaN(z)) {
          zCount++;
          zMin = Math.min(zMin, z);
          zMax = Math.max(zMax, z);
        }
        totalCoords++;
      }
      return;
    }
    // Otherwise, it's an array of coordinates (number[][])
    (coords as number[][]).forEach(c => processCoords(c));
  };
  
  // Collect first 3 feature IDs per geometry type
  const debugSamples: Record<string, any[]> = {};
  // Process all features
  features.forEach((feature, idx) => {
    if (!feature) {
      (async () => {
        await dbLogger.warn('Null or undefined feature encountered in detectZCoordinates', { source: SOURCE });
      })().catch(console.error);
      return;
    }
    let hasProcessedZForFeature = false;
    
    // Check if feature has stored Z values in properties 
    // This takes priority because it indicates intentional height data
    if (feature.properties) {
      // LV95 stored heights
      if (feature.properties.height_mode === 'lv95_stored') {
        lv95StoredCount++;
        
        // Extract height from properties - try multiple possible sources
        let zValue = null;
        
        if (typeof feature.properties.lv95_height === 'number' && !isNaN(feature.properties.lv95_height)) {
          zValue = feature.properties.lv95_height;
        } else if (typeof feature.properties.height === 'number' && !isNaN(feature.properties.height)) {
          zValue = feature.properties.height;
        } else if (typeof feature.properties.base_elevation_ellipsoidal === 'number' && 
                  !isNaN(feature.properties.base_elevation_ellipsoidal)) {
          zValue = feature.properties.base_elevation_ellipsoidal;
        }
        
        if (zValue !== null) {
          propertyZCount++;
          zCount++;
          zMin = Math.min(zMin, zValue);
          zMax = Math.max(zMax, zValue);
          totalCoords++;
          hasProcessedZForFeature = true;
        }
      }
    }
    
    // Only check geometry if we haven't already found Z data in properties
    if (!hasProcessedZForFeature && feature.geometry) {
      try {
        const type = feature.geometry.type;
        if (!debugSamples[type]) debugSamples[type] = [];
        if (debugSamples[type].length < 3) {
          debugSamples[type].push(feature.id || idx);
        }
        switch (type) {
          case 'Point': processCoords((feature.geometry as Point).coordinates); break;
          case 'LineString': processCoords((feature.geometry as LineString).coordinates); break;
          case 'Polygon': processCoords((feature.geometry as Polygon).coordinates[0]); break;
          case 'MultiPoint': processCoords((feature.geometry as MultiPoint).coordinates); break;
          case 'MultiLineString': processCoords((feature.geometry as MultiLineString).coordinates[0]); break;
          case 'MultiPolygon': (feature.geometry as MultiPolygon).coordinates[0].forEach(ring => processCoords(ring)); break;
          case 'GeometryCollection': {
            const geometryCollection = feature.geometry as GeometryCollection;
            if (geometryCollection.geometries) {
              geometryCollection.geometries.forEach(geom => {
                if (geom.type === 'Point') processCoords([(geom as Point).coordinates]);
                else if (geom.type === 'LineString') processCoords((geom as LineString).coordinates);
                else if (geom.type === 'Polygon') processCoords((geom as Polygon).coordinates[0]);
                else if (geom.type === 'MultiPoint') processCoords((geom as MultiPoint).coordinates);
                else if (geom.type === 'MultiLineString') processCoords((geom as MultiLineString).coordinates[0]);
                else if (geom.type === 'MultiPolygon') processCoords((geom as MultiPolygon).coordinates[0][0]);
              });
            }
            break;
          }
        }
      } catch (error) {
        (async () => {
          await dbLogger.error('Error processing geometry coordinates in detectZCoordinates', {
            source: SOURCE,
            error,
            feature,
            geometry: feature.geometry
          });
        })().catch(console.error);
        return;
      }
    }
  });
  // After the loop, log samples and a summary
  (async () => {
    // Log up to 3 sample IDs per geometry type
    const sampleSummary = Object.entries(debugSamples).reduce((acc, [type, ids]) => {
      acc[type] = ids.length > 3 ? [...ids.slice(0, 3), `... (${ids.length - 3} more)`] : ids;
      return acc;
    }, {} as Record<string, any[]>);
    await dbLogger.debug('detectZCoordinates samples', sampleSummary);
    await dbLogger.debug('detectZCoordinates summary', {
      totalFeatures: features.length,
      sampleTypes: Object.keys(debugSamples),
      sampleCounts: Object.fromEntries(Object.entries(debugSamples).map(([type, ids]) => [type, ids.length])),
      sampleIdsPerType: sampleSummary
    });
  })().catch(console.error);
  
  // If we have property-based Z values but no coordinates, use feature count
  if ((lv95StoredCount > 0 || propertyZCount > 0) && totalCoords === 0) {
    totalCoords = features.length;
    (async () => {
      await dbLogger.debug('Using feature count for total coordinates due to property-based Z values', { 
        source: SOURCE,
        lv95StoredCount,
        propertyZCount,
        totalCoords
      });
    })().catch(console.error);
  }
  
  // Determine if we have meaningful Z data
  const hasZ = zCount > 0;
  
  // Generate appropriate message
  let message = '';
  if (hasZ) {
    if (lv95StoredCount > 0) {
      message = `Found ${lv95StoredCount} features with stored LV95 heights`;
    } else if (propertyZCount > 0) {
      message = `Found ${propertyZCount} features with height properties`;
    } else {
      message = `Found ${zCount} coordinates with Z values out of ${totalCoords} total coordinates`;
    }
  } else {
    message = 'No Z coordinates or height values found';
  }
  
  return {
    hasZ,
    zCount,
    totalCoords,
    zMin: hasZ ? zMin : 0,
    zMax: hasZ ? zMax : 0,
    message
  };
}

/**
 * Detects numeric attributes in features
 */
export function detectNumericAttributes(features: Feature[]): NumericAttributesInfo {
  if (!features || features.length === 0) {
    return {
      attributes: [],
      message: 'No features found'
    };
  }
  
  const numericAttributes = new Map<string, { min: number; max: number; count: number }>();
  
  features.forEach(feature => {
    if (!feature?.properties) return;
    
    Object.entries(feature.properties).forEach(([key, value]) => {
      // Skip known non-numeric fields
      if (key === 'id' || key === 'height_mode' || key === 'feature_id') return;
      
      // Check if value is numeric
      if (typeof value === 'number' && !isNaN(value)) {
        const current = numericAttributes.get(key) || { min: Infinity, max: -Infinity, count: 0 };
        current.min = Math.min(current.min, value);
        current.max = Math.max(current.max, value);
        current.count++;
        numericAttributes.set(key, current);
      }
    });
  });
  
  // Convert to array and sort by count (most frequent first)
  const attributes = Array.from(numericAttributes.entries())
    .map(([name, { min, max, count }]) => ({ name, min, max, count }))
    .sort((a, b) => b.count - a.count);
  
  // Generate message
  const message = attributes.length > 0
    ? `Found ${attributes.length} numeric attributes`
    : 'No numeric attributes found';
  
  return { attributes, message };
}

/**
 * Gets a preview of height values for features
 */
export function getHeightPreview(features: Feature[], source: string, maxSamples = 5): HeightPreviewItem[] {
  const preview: HeightPreviewItem[] = [];
  
  // Get a subset of features
  const sampleFeatures = features.slice(0, maxSamples);
  
  sampleFeatures.forEach(feature => {
    const featureId = feature.id || feature.properties?.id || feature.properties?.feature_id;
    let value: number | null = null;
    
    try {
      if (source === 'z_coord') {
        value = getFeatureZCoordinate(feature);
      } else if (source === 'attribute' && feature.properties) {
        const attrValue = feature.properties[source];
        value = typeof attrValue === 'number' && !isNaN(attrValue) ? attrValue : null;
      }
    } catch (error) {
      (async () => {
        await dbLogger.warn('Error getting height preview value', { source: SOURCE, error });
      })().catch(console.error);
    }
    
    preview.push({ featureId, value });
  });
  
  return preview;
}

/**
 * Detects if features use Swiss coordinates
 */
export function detectSwissCoordinates(features: Feature[]): SwissCoordinatesInfo {
  if (!features || features.length === 0) {
    return {
      isSwiss: false,
      hasLv95Stored: false,
      hasSwissVerticalDatum: false,
      message: 'No features found',
      featureCount: 0
    };
  }
  
  let lv95StoredCount = 0;
  let swissVerticalDatumCount = 0;
  let swissCoordCount = 0;
  
  features.forEach(feature => {
    // Check for LV95 stored heights
    if (feature.properties?.height_mode === 'lv95_stored') {
      lv95StoredCount++;
    }
    
    // Check for Swiss vertical datum
    if (feature.properties?.vertical_datum === 'ln02' || 
        feature.properties?.vertical_datum === 'lhn95') {
      swissVerticalDatumCount++;
    }
    
    // Check coordinates for Swiss range
    if (feature.geometry) {
      try {
        const coords = getFirstCoordinate(feature);
        if (coords && isSwissCoordinate(coords)) {
          swissCoordCount++;
        }
      } catch (error) {
        (async () => {
          await dbLogger.warn('Error checking coordinates', { source: SOURCE, error });
        })().catch(console.error);
      }
    }
  });
  
  const hasLv95Stored = lv95StoredCount > 0;
  const hasSwissVerticalDatum = swissVerticalDatumCount > 0;
  const isSwiss = hasLv95Stored || hasSwissVerticalDatum || swissCoordCount > 0;
  
  let message = '';
  if (isSwiss) {
    const details = [];
    if (hasLv95Stored) details.push(`${lv95StoredCount} with LV95 stored heights`);
    if (hasSwissVerticalDatum) details.push(`${swissVerticalDatumCount} with Swiss vertical datum`);
    if (swissCoordCount > 0) details.push(`${swissCoordCount} with Swiss coordinates`);
    message = `Swiss coordinate system detected: ${details.join(', ')}`;
  } else {
    message = 'No Swiss coordinate system detected';
  }
  
  return {
    isSwiss,
    hasLv95Stored,
    hasSwissVerticalDatum,
    message,
    featureCount: features.length
  };
}

/**
 * Helper to get first coordinate from a feature
 */
function getFirstCoordinate(feature: Feature): number[] | null {
  if (!feature.geometry) return null;
  
  switch (feature.geometry.type) {
    case 'Point':
      return (feature.geometry as Point).coordinates;
    case 'LineString':
      return (feature.geometry as LineString).coordinates[0];
    case 'Polygon':
      return (feature.geometry as Polygon).coordinates[0][0];
    case 'MultiPoint':
      return (feature.geometry as MultiPoint).coordinates[0];
    case 'MultiLineString':
      return (feature.geometry as MultiLineString).coordinates[0][0];
    case 'MultiPolygon':
      return (feature.geometry as MultiPolygon).coordinates[0][0][0];
    case 'GeometryCollection': {
      const geometryCollection = feature.geometry as GeometryCollection;
      if (geometryCollection.geometries && geometryCollection.geometries.length > 0) {
        const firstGeom = geometryCollection.geometries[0];
        if (firstGeom.type === 'Point') {
          return (firstGeom as Point).coordinates;
        }
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Helper to check if coordinates are in Swiss range
 */
function isSwissCoordinate(coords: number[]): boolean {
  if (!coords || coords.length < 2) return false;
  
  const [x, y] = coords;
  
  // Check if coordinates are in Swiss range (approximate)
  // LV95: [2485000-2834000, 1075000-1299000]
  // LV03: [485000-834000, 75000-299000]
  return (
    // LV95
    (x >= 2485000 && x <= 2834000 && y >= 1075000 && y <= 1299000) ||
    // LV03
    (x >= 485000 && x <= 834000 && y >= 75000 && y <= 299000)
  );
}

/**
 * Determines the appropriate Swiss height transformation method
 */
export function determineSwissTransformationMethod(swissCoordinatesInfo: SwissCoordinatesInfo): 'api' | 'delta' | 'auto' {
  // If we have stored LV95 heights, use them directly (delta)
  if (swissCoordinatesInfo.hasLv95Stored) {
    return 'delta';
  }
  
  // If we have Swiss vertical datum but no stored heights, use API
  if (swissCoordinatesInfo.hasSwissVerticalDatum) {
    return 'api';
  }
  
  // For other cases, let the system decide based on feature count
  return 'auto';
} 