import * as Cesium from 'cesium';

/**
 * Convert longitude, latitude, height to Cartesian3
 * @param longitude Longitude in degrees
 * @param latitude Latitude in degrees
 * @param height Height in meters
 * @returns Cartesian3 position
 */
export function lonLatHeightToCartesian(
  longitude: number,
  latitude: number,
  height: number = 0
): Cesium.Cartesian3 {
  return Cesium.Cartesian3.fromDegrees(longitude, latitude, height);
}

/**
 * Convert Cartesian3 to longitude, latitude, height
 * @param position Cartesian3 position
 * @returns Object with longitude, latitude, height
 */
export function cartesianToLonLatHeight(
  position: Cesium.Cartesian3
): { longitude: number; latitude: number; height: number } {
  const cartographic = Cesium.Cartographic.fromCartesian(position);
  
  return {
    longitude: Cesium.Math.toDegrees(cartographic.longitude),
    latitude: Cesium.Math.toDegrees(cartographic.latitude),
    height: cartographic.height
  };
}

/**
 * Convert a GeoJSON position to Cartesian3
 * @param position GeoJSON position [longitude, latitude, height?]
 * @returns Cartesian3 position
 */
export function geoJsonPositionToCartesian(
  position: [number, number] | [number, number, number]
): Cesium.Cartesian3 {
  const longitude = position[0];
  const latitude = position[1];
  const height = position.length > 2 ? position[2] : 0;
  
  return Cesium.Cartesian3.fromDegrees(longitude, latitude, height);
}

/**
 * Convert a Cartesian3 position to GeoJSON position
 * @param position Cartesian3 position
 * @param includeHeight Whether to include height in the result
 * @returns GeoJSON position [longitude, latitude, height?]
 */
export function cartesianToGeoJsonPosition(
  position: Cesium.Cartesian3,
  includeHeight: boolean = true
): [number, number] | [number, number, number] {
  const { longitude, latitude, height } = cartesianToLonLatHeight(position);
  
  return includeHeight ? 
    [longitude, latitude, height] : 
    [longitude, latitude];
}

/**
 * Convert a bounding box from [west, south, east, north] to a rectangle
 * @param bbox Bounding box [west, south, east, north]
 * @returns Rectangle in radians
 */
export function bboxToRectangle(
  bbox: [number, number, number, number]
): { west: number; south: number; east: number; north: number } {
  const [west, south, east, north] = bbox;
  
  return {
    west: Cesium.Math.toRadians(west),
    south: Cesium.Math.toRadians(south),
    east: Cesium.Math.toRadians(east),
    north: Cesium.Math.toRadians(north)
  };
}

/**
 * Calculate the center of a bounding box
 * @param bbox Bounding box [west, south, east, north]
 * @returns Center position [longitude, latitude]
 */
export function bboxCenter(
  bbox: [number, number, number, number]
): [number, number] {
  const [west, south, east, north] = bbox;
  
  return [
    west + (east - west) / 2,
    south + (north - south) / 2
  ];
} 