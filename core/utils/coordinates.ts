import axios from 'axios';
import { LogManager } from '../logging/log-manager';
import { FeatureCollection } from 'geojson';

const logManager = LogManager.getInstance();
const SOURCE = 'Coordinates';

interface TransformResult {
  lon: number;
  lat: number;
  ell_height: number;
}

/**
 * Height delta for caching and reusing transformations
 */
export interface HeightDelta {
  refLv95: { x: number, y: number, z: number };
  refWgs84: { lon: number, lat: number, ellHeight: number };
  heightOffset: number; // Difference between LHN95 and WGS84 ellipsoidal height
  timestamp: number;
  validRadius: number; // Radius in meters where this delta is valid
}

// Cache for height deltas using grid cell keys
const heightDeltaCache: Map<string, HeightDelta> = new Map();

// Maximum age for cache entries in milliseconds (24 hours)
const MAX_CACHE_AGE = 24 * 60 * 60 * 1000; 

// Maximum distance for delta application (5km)
const MAX_DELTA_DISTANCE = 5000;

// Grid cell size for caching (1km)
const GRID_CELL_SIZE = 1000;

/**
 * Transforms LV95 coordinates to WGS84 using the REST API endpoint
 * 
 * @param eastingLv95 - LV95 easting coordinate (X)
 * @param northingLv95 - LV95 northing coordinate (Y)
 * @param lhn95Height - LHN95 height in meters
 * @returns A Promise that resolves to the transformed coordinates
 */
export async function transformLv95ToWgs84(
  eastingLv95: number, 
  northingLv95: number, 
  lhn95Height: number
): Promise<TransformResult> {
  try {
    // Enhanced logging - input coordinates with unique identifier
    const requestId = `req_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    logManager.info(SOURCE, `Swiss Reframe transformation request ${requestId}`, { 
      eastingLv95,
      northingLv95,
      lhn95Height,
      requestId
    });
    
    const requestPayload = {
      eastingLv95,
      northingLv95,
      lhn95Height
    };
    
    logManager.debug(SOURCE, `Sending transformation request ${requestId} to API`, { 
      endpoint: '/api/coordinates/transform',
      payload: requestPayload
    });
    
    const response = await axios.post('/api/coordinates/transform', requestPayload);
    
    if (response.status !== 200) {
      logManager.error(SOURCE, `Transformation API returned non-200 status for ${requestId}`, {
        status: response.status,
        statusText: response.statusText,
        responseData: response.data
      });
      throw new Error(`Transformation API returned status ${response.status}`);
    }
    
    const result = response.data as TransformResult;
    
    // Log successful transformation with both input and output
    logManager.info(SOURCE, `Swiss Reframe transformation completed ${requestId}`, { 
      input: {
        eastingLv95,
        northingLv95,
        lhn95Height
      },
      output: {
        lon: result.lon,
        lat: result.lat,
        ell_height: result.ell_height
      },
      requestId
    });
    
    return result;
  } catch (error) {
    logManager.error(SOURCE, 'Swiss coordinate transformation failed:', error);
    
    // Fallback to approximation for development/testing
    // This is a very rough approximation and should not be used in production
    const roughLon = 8.23 + (eastingLv95 - 2600000) / 78000;
    const roughLat = 46.82 + (northingLv95 - 1200000) / 111000;
    const roughEllHeight = lhn95Height + 49.5; // Average offset between LHN95 and ellipsoidal height
    
    logManager.warn(SOURCE, `Using fallback approximation for Swiss coordinates`, { 
      input: {
        eastingLv95,
        northingLv95,
        lhn95Height
      },
      approximation: {
        lon: roughLon,
        lat: roughLat,
        ell_height: roughEllHeight
      }
    });
    
    return {
      lon: roughLon,
      lat: roughLat,
      ell_height: roughEllHeight
    };
  }
}

/**
 * Gets a cached height delta or calculates a new one
 * 
 * @param eastingLv95 - LV95 easting coordinate (X)
 * @param northingLv95 - LV95 northing coordinate (Y)
 * @param lhn95Height - LHN95 height in meters
 * @returns A Promise that resolves to a height delta
 */
export async function getHeightDelta(
  eastingLv95: number,
  northingLv95: number,
  lhn95Height: number
): Promise<HeightDelta> {
  // Generate cache key based on grid cells (1km resolution)
  const gridX = Math.floor(eastingLv95 / GRID_CELL_SIZE) * GRID_CELL_SIZE;
  const gridY = Math.floor(northingLv95 / GRID_CELL_SIZE) * GRID_CELL_SIZE;
  const cacheKey = `${gridX}:${gridY}`;
  
  // Check cache
  const cachedDelta = heightDeltaCache.get(cacheKey);
  const now = Date.now();
  
  if (cachedDelta && (now - cachedDelta.timestamp < MAX_CACHE_AGE)) {
    logManager.debug(SOURCE, 'Using cached height delta', { 
      cacheKey, 
      age: Math.round((now - cachedDelta.timestamp) / 1000) + 's' 
    });
    return cachedDelta;
  }
  
  // Calculate new delta
  logManager.debug(SOURCE, 'Calculating new height delta', { cacheKey });
  
  // Use grid cell center for reference point
  const refEasting = gridX + (GRID_CELL_SIZE / 2);
  const refNorthing = gridY + (GRID_CELL_SIZE / 2);
  
  // Transform the reference point
  const wgs84Coords = await transformLv95ToWgs84(refEasting, refNorthing, lhn95Height);
  
  const newDelta: HeightDelta = {
    refLv95: { x: refEasting, y: refNorthing, z: lhn95Height },
    refWgs84: { 
      lon: wgs84Coords.lon, 
      lat: wgs84Coords.lat, 
      ellHeight: wgs84Coords.ell_height 
    },
    heightOffset: wgs84Coords.ell_height - lhn95Height,
    timestamp: now,
    validRadius: GRID_CELL_SIZE // 1km validity radius
  };
  
  // Store in cache
  heightDeltaCache.set(cacheKey, newDelta);
  
  return newDelta;
}

/**
 * Applies a height delta to transform a coordinate
 * 
 * @param eastingLv95 - LV95 easting coordinate (X)
 * @param northingLv95 - LV95 northing coordinate (Y)
 * @param lhn95Height - LHN95 height in meters
 * @param delta - The height delta to apply
 * @returns Transformed coordinates or null if delta cannot be applied
 */
export function applyHeightDelta(
  eastingLv95: number,
  northingLv95: number,
  lhn95Height: number,
  delta: HeightDelta
): TransformResult | null {
  // Calculate distance to reference point
  const distance = Math.sqrt(
    Math.pow(eastingLv95 - delta.refLv95.x, 2) +
    Math.pow(northingLv95 - delta.refLv95.y, 2)
  );
  
  // If too far, return null to force a new API call
  if (distance > delta.validRadius) {
    logManager.debug(SOURCE, 'Point too far from reference, delta not applied', { 
      distance, 
      validRadius: delta.validRadius 
    });
    return null;
  }
  
  // Apply delta to height
  const ellipsoidalHeight = lhn95Height + delta.heightOffset;
  
  // For horizontal coordinates, use proj4js transformation
  // This is a simplified approach - for true precision, we'd call the API
  const dx = eastingLv95 - delta.refLv95.x;
  const dy = northingLv95 - delta.refLv95.y;
  
  // Very rough approximation of coordinate shift
  // This works because we're in a small area (within 1km of reference)
  // For a real implementation, use proper coordinate transformation formulas
  // ~ 0.000013 degrees per meter at Swiss latitude (very approximate)
  const lonPerMeter = 0.000013;
  const latPerMeter = 0.000009;
  
  const lon = delta.refWgs84.lon + (dx * lonPerMeter);
  const lat = delta.refWgs84.lat + (dy * latPerMeter);
  
  logManager.debug(SOURCE, 'Applied height delta', { 
    input: { eastingLv95, northingLv95, lhn95Height },
    output: { lon, lat, ellipsoidalHeight },
    heightOffset: delta.heightOffset
  });
  
  return {
    lon,
    lat,
    ell_height: ellipsoidalHeight
  };
}

/**
 * Enhanced transformation function that uses delta caching
 * 
 * @param eastingLv95 - LV95 easting coordinate (X)
 * @param northingLv95 - LV95 northing coordinate (Y)
 * @param lhn95Height - LHN95 height in meters
 * @param useCache - Whether to use delta caching
 * @returns A Promise that resolves to the transformed coordinates
 */
export async function transformLv95ToWgs84WithDelta(
  eastingLv95: number,
  northingLv95: number,
  lhn95Height: number,
  useCache: boolean = true
): Promise<TransformResult> {
  try {
    if (!useCache) {
      // Skip delta calculation and use direct API call
      return await transformLv95ToWgs84(eastingLv95, northingLv95, lhn95Height);
    }
    
    // Try to get a delta from the cache
    const delta = await getHeightDelta(eastingLv95, northingLv95, lhn95Height);
    
    // Apply the delta
    const result = applyHeightDelta(eastingLv95, northingLv95, lhn95Height, delta);
    
    // If delta application failed, fall back to API call
    if (!result) {
      logManager.debug(SOURCE, 'Delta application failed, falling back to API call');
      return await transformLv95ToWgs84(eastingLv95, northingLv95, lhn95Height);
    }
    
    return result;
  } catch (error) {
    logManager.error(SOURCE, 'Delta-based transformation failed, falling back to direct call', error);
    // Fall back to original implementation
    return await transformLv95ToWgs84(eastingLv95, northingLv95, lhn95Height);
  }
}

/**
 * Processes features with stored LV95 coordinates
 * This can be called to transform coordinates that were stored during import
 * 
 * @param feature - GeoJSON feature with LV95 coordinates stored in properties
 * @param options - Processing options
 * @returns The feature with added WGS84 ellipsoidal height if transformation was successful
 */
export async function processStoredLv95Coordinates(
  feature: any,
  options: {
    transformationMethod?: 'api' | 'delta';
    cacheResults?: boolean;
  } = {}
): Promise<any> {
  try {
    const props = feature.properties;
    const featureId = feature.id || 'unknown';
    
    // Log feature processing start
    logManager.info(SOURCE, `Processing feature with LV95 coordinates`, {
      featureId,
      height_mode: props?.height_mode,
      transformationMethod: options.transformationMethod || 'api',
      hasLv95Data: !!(props?.lv95_easting && props?.lv95_northing && props?.lv95_height)
    });
    
    if (props?.height_mode === 'lv95_stored' && 
        props.lv95_easting && 
        props.lv95_northing && 
        props.lv95_height) {
      
      // Log LV95 values for debugging
      logManager.debug(SOURCE, `Feature LV95 coordinates`, {
        featureId,
        lv95_easting: props.lv95_easting,
        lv95_northing: props.lv95_northing,
        lv95_height: props.lv95_height
      });
      
      let result: TransformResult;
      
      // Use appropriate transformation method
      if (options.transformationMethod === 'delta') {
        logManager.debug(SOURCE, `Using delta-based transformation for feature`, {
          featureId,
          cacheResults: options.cacheResults ?? true
        });
        
        result = await transformLv95ToWgs84WithDelta(
          props.lv95_easting,
          props.lv95_northing,
          props.lv95_height,
          options.cacheResults ?? true
        );
      } else {
        // Default to direct API call
        logManager.debug(SOURCE, `Using direct API transformation for feature`, {
          featureId
        });
        
        result = await transformLv95ToWgs84(
          props.lv95_easting,
          props.lv95_northing,
          props.lv95_height
        );
      }
      
      // Log transformation result
      logManager.info(SOURCE, `Feature transformation completed`, {
        featureId,
        height_mode: 'lv95_stored',
        newHeightMode: 'absolute_ellipsoidal',
        original_height: props.lv95_height,
        transformed_height: result.ell_height,
        height_difference: result.ell_height - props.lv95_height
      });
      
      // Update feature with the transformed height
      const updatedFeature = {
        ...feature,
        properties: {
          ...props,
          base_elevation_ellipsoidal: result.ell_height,
          height_mode: 'absolute_ellipsoidal',
          height_transformed: true,
          height_transformed_at: new Date().toISOString()
        }
      };
      
      // Log updated feature data
      logManager.debug(SOURCE, `Updated feature properties after transformation`, {
        featureId,
        updatedProperties: {
          base_elevation_ellipsoidal: updatedFeature.properties.base_elevation_ellipsoidal,
          height_mode: updatedFeature.properties.height_mode,
          height_transformed: updatedFeature.properties.height_transformed,
          height_transformed_at: updatedFeature.properties.height_transformed_at
        }
      });
      
      return updatedFeature;
    }
    
    logManager.warn(SOURCE, `Feature skipped - not eligible for LV95 processing`, {
      featureId,
      height_mode: props?.height_mode,
      hasLv95Easting: !!props?.lv95_easting,
      hasLv95Northing: !!props?.lv95_northing,
      hasLv95Height: !!props?.lv95_height
    });
    
    return feature;
  } catch (error) {
    const featureId = feature?.id || 'unknown';
    logManager.error(SOURCE, `Error processing LV95 coordinates for feature ${featureId}:`, error);
    logManager.error(SOURCE, `Feature that caused error:`, {
      featureId,
      properties: feature?.properties ? {
        height_mode: feature.properties.height_mode,
        lv95_easting: feature.properties.lv95_easting,
        lv95_northing: feature.properties.lv95_northing,
        lv95_height: feature.properties.lv95_height
      } : 'No properties'
    });
    return feature;
  }
}

/**
 * Transforms multiple LV95 coordinates to WGS84 using the batch API endpoint
 * 
 * @param coordinates - Array of LV95 coordinates to transform
 * @returns A Promise that resolves to the transformation results
 */
export async function batchTransformLv95ToWgs84(
  coordinates: Array<{
    eastingLv95: number;
    northingLv95: number;
    lhn95Height: number;
    id?: string | number;
  }>
): Promise<Array<{
  input: {
    eastingLv95: number;
    northingLv95: number;
    lhn95Height: number;
    id?: string | number;
  };
  result?: TransformResult;
  error?: string;
}>> {
  try {
    logManager.debug(SOURCE, `Batch transforming ${coordinates.length} coordinates`);
    
    // Split into chunks of maximum 100 coordinates
    const MAX_BATCH_SIZE = 100;
    const batches: typeof coordinates[] = [];
    
    for (let i = 0; i < coordinates.length; i += MAX_BATCH_SIZE) {
      batches.push(coordinates.slice(i, i + MAX_BATCH_SIZE));
    }
    
    logManager.debug(SOURCE, `Split into ${batches.length} batches`);
    
    // Process each batch
    const results = [];
    for (const batch of batches) {
      const response = await axios.post('/api/coordinates/transform-batch', {
        coordinates: batch
      });
      
      if (response.status !== 200) {
        throw new Error(`Batch transformation API returned status ${response.status}`);
      }
      
      results.push(...response.data.results);
      
      logManager.debug(SOURCE, `Batch processed with ${response.data.summary.success} successes and ${response.data.summary.failed} failures`);
    }
    
    return results;
  } catch (error) {
    logManager.error(SOURCE, 'Batch coordinate transformation failed:', error);
    
    // Return array with errors for all coordinates
    return coordinates.map(coord => ({
      input: coord,
      error: error instanceof Error ? error.message : 'Unknown error'
    }));
  }
}

/**
 * Groups features by spatial proximity for efficient batch processing
 */
export function groupFeaturesByProximity(
  features: any[], 
  gridSize: number = 1000
): Array<{
  referenceFeature: any;
  relatedFeatures: any[];
}> {
  if (!features || features.length === 0) {
    return [];
  }
  
  // Create a map to group features by grid cells
  const gridCells: Record<string, any[]> = {};
  
  // Assign features to grid cells
  for (const feature of features) {
    const props = feature.properties;
    
    if (props?.height_mode === 'lv95_stored' && 
        props.lv95_easting && 
        props.lv95_northing) {
      
      const gridX = Math.floor(props.lv95_easting / gridSize) * gridSize;
      const gridY = Math.floor(props.lv95_northing / gridSize) * gridSize;
      const cellKey = `${gridX}:${gridY}`;
      
      if (!gridCells[cellKey]) {
        gridCells[cellKey] = [];
      }
      
      gridCells[cellKey].push(feature);
    }
  }
  
  // Convert grid cells to reference + related features
  return Object.values(gridCells).map(cellFeatures => {
    // Select a feature near the center of the cell as reference
    const referenceFeature = cellFeatures[0]; // Simple approach - could be improved
    const relatedFeatures = cellFeatures.slice(1);
    
    return {
      referenceFeature,
      relatedFeatures
    };
  });
}

/**
 * Processes a GeoJSON FeatureCollection to transform heights for features 
 * with LV95 stored coordinates.
 * 
 * @param featureCollection The GeoJSON feature collection to process
 * @returns A transformed feature collection with accurate ellipsoidal heights
 */
export async function processFeatureCollectionHeights(
  featureCollection: FeatureCollection
): Promise<FeatureCollection> {
  try {
    logManager.info(SOURCE, 'Processing feature collection heights', {
      featureCount: featureCollection.features.length
    });
    
    let transformedCount = 0;
    let unchangedCount = 0;
    
    // Process each feature in parallel
    const transformedFeatures = await Promise.all(
      featureCollection.features.map(async (feature) => {
        // Check if this feature has lv95_stored height mode
        if (feature.properties?.height_mode === 'lv95_stored') {
          try {
            // Transform using the utility function
            const transformedFeature = await processStoredLv95Coordinates(feature);
            transformedCount++;
            return transformedFeature;
          } catch (error) {
            logManager.error(SOURCE, 'Error transforming feature height', {
              featureId: feature.id,
              error
            });
            // Return original feature if transformation fails
            unchangedCount++;
            return feature;
          }
        } else {
          // Feature doesn't need height transformation
          unchangedCount++;
          return feature;
        }
      })
    );
    
    logManager.info(SOURCE, 'Feature heights processed', {
      transformedCount,
      unchangedCount,
      totalCount: featureCollection.features.length
    });
    
    return {
      ...featureCollection,
      features: transformedFeatures
    };
  } catch (error) {
    logManager.error(SOURCE, 'Error processing feature collection heights', error);
    // Return original collection if processing fails
    return featureCollection;
  }
} 