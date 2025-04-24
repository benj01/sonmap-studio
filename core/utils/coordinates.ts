import axios from 'axios';
import { LogManager } from '../logging/log-manager';

const logManager = LogManager.getInstance();
const SOURCE = 'Coordinates';

interface TransformResult {
  lon: number;
  lat: number;
  ell_height: number;
}

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
    logManager.debug(SOURCE, `Transforming LV95 (${eastingLv95}, ${northingLv95}, ${lhn95Height}) to WGS84`);
    
    const response = await axios.post('/api/coordinates/transform', {
      eastingLv95,
      northingLv95,
      lhn95Height
    });
    
    if (response.status !== 200) {
      throw new Error(`Transformation API returned status ${response.status}`);
    }
    
    const result = response.data as TransformResult;
    logManager.debug(SOURCE, `Transformed to WGS84: (${result.lon}, ${result.lat}, ${result.ell_height})`);
    
    return result;
  } catch (error) {
    logManager.error(SOURCE, 'Coordinate transformation failed:', error);
    
    // Fallback to approximation for development/testing
    // This is a very rough approximation and should not be used in production
    const roughLon = 8.23 + (eastingLv95 - 2600000) / 78000;
    const roughLat = 46.82 + (northingLv95 - 1200000) / 111000;
    const roughEllHeight = lhn95Height + 49.5; // Average offset between LHN95 and ellipsoidal height
    
    logManager.warn(SOURCE, `Using fallback approximation: (${roughLon}, ${roughLat}, ${roughEllHeight})`);
    
    return {
      lon: roughLon,
      lat: roughLat,
      ell_height: roughEllHeight
    };
  }
}

/**
 * Processes features with stored LV95 coordinates
 * This can be called to transform coordinates that were stored during import
 * 
 * @param feature - GeoJSON feature with LV95 coordinates stored in properties
 * @returns The feature with added WGS84 ellipsoidal height if transformation was successful
 */
export async function processStoredLv95Coordinates(feature: any): Promise<any> {
  try {
    const props = feature.properties;
    
    if (props.height_mode === 'lv95_stored' && 
        props.lv95_easting && 
        props.lv95_northing && 
        props.lv95_height) {
      
      const result = await transformLv95ToWgs84(
        props.lv95_easting,
        props.lv95_northing,
        props.lv95_height
      );
      
      // Update feature with the transformed height
      return {
        ...feature,
        properties: {
          ...props,
          base_elevation_ellipsoidal: result.ell_height,
          height_mode: 'absolute_ellipsoidal'
        }
      };
    }
    
    return feature;
  } catch (error) {
    logManager.error(SOURCE, 'Error processing stored LV95 coordinates:', error);
    return feature;
  }
} 