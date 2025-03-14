import * as Cesium from 'cesium';

// Declare the CESIUM_BASE_URL property on the Window interface
declare global {
  interface Window {
    CESIUM_BASE_URL: string;
  }
}

/**
 * Initialize Cesium with global configuration
 * This setup avoids using Cesium Ion services and focuses on local data
 */
export function initCesium() {
  // Set the base URL for Cesium assets
  // This should match the path where assets are copied in next.config.js
  window.CESIUM_BASE_URL = '/static/cesium';
  
  // Initialize the Cesium ion access token if needed
  // Cesium.Ion.defaultAccessToken = 'your-token-here';
  
  // Configure default view options
  Cesium.Camera.DEFAULT_VIEW_RECTANGLE = Cesium.Rectangle.fromDegrees(
    -180.0, -90.0, 180.0, 90.0
  );
  
  // Disable Cesium's default request watermark
  Cesium.RequestScheduler.requestsByServer = {};
}

/**
 * Configure Cesium for optimal performance
 * @param viewer The Cesium viewer instance
 */
export function configureCesiumForPerformance(viewer: any) {
  // Optimize for performance
  if (viewer && viewer.scene) {
    // Reduce the maximum screen space error for terrain
    if (viewer.scene.terrainProvider) {
      viewer.scene.terrainProvider.maximumScreenSpaceError = 2;
    }

    // Enable frustum culling
    viewer.scene.debugShowFrustumPlanes = false;

    // Disable unnecessary rendering features
    viewer.scene.fog.enabled = false;
    viewer.scene.globe.showGroundAtmosphere = false;

    // Set a reasonable memory cache size
    viewer.scene.globe.maximumScreenSpaceError = 2;
    
    // Disable depth test against terrain when not needed
    viewer.scene.globe.depthTestAgainstTerrain = false;
  }
} 