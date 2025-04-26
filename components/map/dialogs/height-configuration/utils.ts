import { Feature, Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon, GeometryCollection } from 'geojson';
import { ZCoordinatesInfo, NumericAttributesInfo, SwissCoordinatesInfo, HeightPreviewItem } from './types';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'HeightConfigUtils';
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
    logger.error('Error extracting Z coordinate from feature', error);
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
  let zSum = 0;
  let zMin = Infinity;
  let zMax = -Infinity;
  let totalCoords = 0;
  let lv95StoredCount = 0;
  let propertyZCount = 0;
  
  // Function to process coordinates recursively
  const processCoords = (coords: any[]) => {
    if (!Array.isArray(coords)) return;
    
    if (coords.length >= 3 && typeof coords[2] === 'number') {
      // This is a coordinate with Z value
      const z = coords[2];
      if (!isNaN(z)) {
        zCount++;
        zSum += z;
        zMin = Math.min(zMin, z);
        zMax = Math.max(zMax, z);
      }
      totalCoords++;
    } else if (Array.isArray(coords[0])) {
      // This is a nested array of coordinates
      coords.forEach(c => processCoords(c));
    }
  };
  
  // Process all features
  features.forEach(feature => {
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
          zSum += zValue;
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
        switch (feature.geometry.type) {
          case 'Point': {
            const geometry = feature.geometry as Point;
            processCoords(geometry.coordinates);
            break;
          }
          case 'LineString': {
            const geometry = feature.geometry as LineString;
            processCoords(geometry.coordinates);
            break;
          }
          case 'Polygon': {
            const geometry = feature.geometry as Polygon;
            processCoords(geometry.coordinates);
            break;
          }
          case 'MultiPoint': {
            const geometry = feature.geometry as MultiPoint;
            processCoords(geometry.coordinates);
            break;
          }
          case 'MultiLineString': {
            const geometry = feature.geometry as MultiLineString;
            processCoords(geometry.coordinates);
            break;
          }
          case 'MultiPolygon': {
            const geometry = feature.geometry as MultiPolygon;
            processCoords(geometry.coordinates);
            break;
          }
          case 'GeometryCollection': {
            const geometryCollection = feature.geometry as GeometryCollection;
            if (geometryCollection.geometries) {
              geometryCollection.geometries.forEach(geom => {
                if (geom.type === 'Point') {
                  processCoords((geom as Point).coordinates);
                } else if (geom.type === 'LineString') {
                  processCoords((geom as LineString).coordinates);
                } else if (geom.type === 'Polygon') {
                  processCoords((geom as Polygon).coordinates);
                } else if (geom.type === 'MultiPoint') {
                  processCoords((geom as MultiPoint).coordinates);
                } else if (geom.type === 'MultiLineString') {
                  processCoords((geom as MultiLineString).coordinates);
                } else if (geom.type === 'MultiPolygon') {
                  processCoords((geom as MultiPolygon).coordinates);
                }
              });
            }
            break;
          }
        }
      } catch (error) {
        logger.error('Error processing geometry coordinates', error);
      }
    }
  });
  
  // If we have property-based Z values but no coordinates, use feature count
  if ((lv95StoredCount > 0 || propertyZCount > 0) && totalCoords === 0) {
    totalCoords = features.length;
    logger.debug('Using feature count for total coordinates due to property-based Z values', { 
      lv95StoredCount,
      propertyZCount,
      featureCount: features.length
    });
  }
  
  // No Z coordinates found
  if (zCount === 0) {
    return { 
      hasZ: false, 
      zCount: 0,
      totalCoords,
      zMin,
      zMax,
      message: 'No Z coordinates found' 
    };
  }
  
  // Analyze results
  const hasNonZeroZ = zMin !== 0 || zMax !== 0;
  const hasReasonableRange = zMin >= -100 && zMax <= 5000; // Increased upper range for mountain areas
  const hasSufficientData = zCount > 0 && (zCount >= 0.1 * totalCoords || lv95StoredCount > 0);
  
  if (!hasNonZeroZ) {
    return { 
      hasZ: false,
      zCount,
      totalCoords,
      zMin,
      zMax,
      message: 'All Z coordinates are zero'
    };
  } else if (!hasReasonableRange) {
    return { 
      hasZ: false,
      zCount,
      totalCoords,
      zMin,
      zMax,
      message: `Z values outside reasonable range (${zMin.toFixed(1)} to ${zMax.toFixed(1)})`
    };
  } else if (!hasSufficientData) {
    return { 
      hasZ: false,
      zCount,
      totalCoords,
      zMin,
      zMax,
      message: `Limited Z data (${zCount} of ${totalCoords} coordinates)`
    };
  }
  
  // Special case for LV95 stored heights - always mark as having Z
  if (lv95StoredCount > 0) {
    // If ALL features have LV95 stored heights, that's a strong indication
    const isAllLv95 = lv95StoredCount === features.length;
    
    return { 
      hasZ: true, // Always true for LV95 stored heights
      zCount,
      totalCoords,
      zMin,
      zMax,
      message: isAllLv95 
        ? `All features have Swiss LV95 height values (range: ${zMin.toFixed(1)} to ${zMax.toFixed(1)} meters)`
        : `${lv95StoredCount} of ${features.length} features have Swiss LV95 height values (range: ${zMin.toFixed(1)} to ${zMax.toFixed(1)} meters)`
    };
  }
  
  // General case for geometry Z coordinates
  return { 
    hasZ: true,
    zCount,
    totalCoords,
    zMin,
    zMax,
    message: `${zCount} coordinates with Z values (range: ${zMin.toFixed(1)} to ${zMax.toFixed(1)} meters)`
  };
}

/**
 * Detects numeric attributes that could be used for height values
 */
export function detectNumericAttributes(features: Feature[]): NumericAttributesInfo {
  if (!features || features.length === 0) {
    return { attributes: [], message: 'No features found' };
  }
  
  const attributeStats: Record<string, { min: number; max: number; count: number; valid: boolean }> = {};
  
  // Collect all numeric attributes and their ranges
  features.forEach(feature => {
    if (!feature.properties) return;
    
    // Check if this feature has LV95 stored height data
    const isLv95Stored = feature.properties.height_mode === 'lv95_stored';
    
    // Analyze each property
    Object.entries(feature.properties).forEach(([key, value]) => {
      // Skip known non-attribute values
      if (key === 'id' || key === 'layer_id' || key === 'geometry_type') return;
      
      // Skip LV95 coordinates (these are treated as Z coordinates)
      if (key === 'lv95_easting' || key === 'lv95_northing' || key === 'lv95_height') return;
      
      // Skip height_mode and related properties
      if (key === 'height_mode' || 
          key === 'height_source' || 
          key === 'height_transformation_status' ||
          key === 'vertical_datum_source') return;
      
      // If this is an LV95 stored feature, skip height values that should be considered Z coordinates
      if (isLv95Stored && (key === 'height' || key === 'base_elevation_ellipsoidal')) return;

      // Try to convert value to number
      const numValue = typeof value === 'number' ? value : 
                      typeof value === 'string' ? parseFloat(value) : NaN;
      
      if (!isNaN(numValue)) {
        if (!attributeStats[key]) {
          attributeStats[key] = { min: numValue, max: numValue, count: 1, valid: true };
        } else {
          attributeStats[key].min = Math.min(attributeStats[key].min, numValue);
          attributeStats[key].max = Math.max(attributeStats[key].max, numValue);
          attributeStats[key].count++;
        }
      }
    });
  });
  
  // Filter attributes with reasonable height ranges and sufficient data
  const validAttributes = Object.entries(attributeStats)
    .filter(([_, stats]) => 
      stats.min >= -100 && stats.max <= 4000 && // Reasonable height range
      stats.count >= 0.5 * features.length      // Present in at least half the features
    )
    .map(([name, stats]) => ({
      name,
      min: stats.min,
      max: stats.max,
      count: stats.count
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  
  return {
    attributes: validAttributes,
    message: validAttributes.length > 0 
      ? `Found ${validAttributes.length} potential height attributes` 
      : 'No suitable height attributes found'
  };
}

/**
 * Gets a preview of height values for a sample of features
 */
export function getHeightPreview(features: Feature[], source: string, maxSamples: number = 5): HeightPreviewItem[] {
  if (!features.length) return [];

  // Take a sample of features for preview
  const sampleSize = Math.min(features.length, maxSamples);
  const sampleFeatures = features.slice(0, sampleSize);
  
  // Extract height data based on source
  return sampleFeatures.map(feature => {
    let value: number | null = null;
    
    if (source === 'z_coord') {
      // Use our comprehensive Z coordinate extraction function
      value = getFeatureZCoordinate(feature);
    } else if (source && feature.properties) {
      // For attribute source, get the property value
      if (typeof feature.properties[source] === 'number') {
        value = feature.properties[source] as number;
      } else if (typeof feature.properties[source] === 'string') {
        const parsedValue = parseFloat(feature.properties[source] as string);
        if (!isNaN(parsedValue)) {
          value = parsedValue;
        }
      }
    }
    
    return {
      featureId: feature.id || feature.properties?.id || `feature-${sampleFeatures.indexOf(feature)}`,
      value
    };
  });
}

/**
 * Detects Swiss coordinates in features
 */
export function detectSwissCoordinates(features: any[]): SwissCoordinatesInfo {
  if (!features || features.length === 0) {
    return {
      isSwiss: false,
      hasLv95Stored: false,
      hasSwissVerticalDatum: false,
      message: 'No features to analyze',
      featureCount: 0
    };
  }
  
  let lv95StoredCount = 0;
  let swissVerticalDatumCount = 0;
  let hasValidLv95Coordinates = false;
  
  // Check each feature for Swiss coordinates
  for (const feature of features) {
    const props = feature.properties || {};
    
    // Check for LV95 stored coordinates
    if (props.height_mode === 'lv95_stored') {
      lv95StoredCount++;
      
      // Validate that the stored coordinates are in LV95 format
      // LV95 eastings should be around 2.5M to 2.9M and northings around 1.1M to 1.3M
      if (props.lv95_easting && props.lv95_northing) {
        const easting = parseFloat(props.lv95_easting);
        const northing = parseFloat(props.lv95_northing);
        
        if (!isNaN(easting) && !isNaN(northing) &&
            easting >= 2450000 && easting <= 2850000 &&
            northing >= 1050000 && northing <= 1350000) {
          hasValidLv95Coordinates = true;
        }
      }
    }
    
    // Check for Swiss vertical datum
    if (props.vertical_datum_source === 'LHN95' || 
        props.vertical_datum_source === 'lhn95') {
      swissVerticalDatumCount++;
    }
  }
  
  const hasLv95Stored = lv95StoredCount > 0 && hasValidLv95Coordinates;
  const hasSwissVerticalDatum = swissVerticalDatumCount > 0;
  const isSwiss = hasLv95Stored || hasSwissVerticalDatum;
  
  // Generate appropriate message
  let message = '';
  if (isSwiss) {
    if (hasLv95Stored && hasValidLv95Coordinates) {
      message = `Swiss LV95 coordinates detected. Height transformation will be applied automatically using the Swiss Reframe API for proper 3D visualization.`;
    } else if (hasLv95Stored && !hasValidLv95Coordinates) {
      message = `Features have LV95 format but coordinates appear to be outside valid Swiss range. Transformation may not be accurate.`;
    } else if (hasSwissVerticalDatum) {
      message = `Swiss vertical datum detected. Height values will be interpreted appropriately.`;
    }
  } else {
    message = 'No Swiss coordinates detected. Using standard WGS84 interpretation.';
  }

  return {
    isSwiss,
    hasLv95Stored: hasLv95Stored && hasValidLv95Coordinates,
    hasSwissVerticalDatum,
    message,
    featureCount: features.length
  };
}

/**
 * Determines the best Swiss transformation method based on feature characteristics
 * @param swissCoordinatesInfo Information about Swiss coordinates
 * @returns The recommended transformation method: 'api' | 'delta' | 'auto'
 */
export function determineSwissTransformationMethod(swissCoordinatesInfo: SwissCoordinatesInfo): 'api' | 'delta' | 'auto' {
  if (!swissCoordinatesInfo.isSwiss) {
    return 'api'; // Default if not Swiss
  }
  
  // For small datasets, use direct API calls
  if (swissCoordinatesInfo.featureCount < 200) {
    return 'api';
  }
  
  // For larger datasets, use delta-based approach
  if (swissCoordinatesInfo.featureCount >= 200) {
    return 'delta';
  }
  
  // Fall back to auto mode which will determine per-feature
  return 'auto';
} 