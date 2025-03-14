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
  console.log('Starting Cesium initialization');
  
  // Set the base URL for Cesium assets
  window.CESIUM_BASE_URL = '/static/cesium';
  
  // Disable Cesium Ion
  Cesium.Ion.defaultAccessToken = '';
  
  // Set default view
  Cesium.Camera.DEFAULT_VIEW_RECTANGLE = Cesium.Rectangle.fromDegrees(
    -180.0, -90.0, 180.0, 90.0
  );
  
  console.log('Cesium initialization completed');
  return true;
}

/**
 * Configure Cesium for optimal performance
 * @param viewer The Cesium viewer instance
 */
export function configureCesiumForPerformance(viewer: Cesium.Viewer) {
  try {
    console.log('Configuring Cesium for performance');
    
    if (viewer && viewer.scene) {
      // Disable unnecessary rendering features
      viewer.scene.fog.enabled = false;
      viewer.scene.globe.showGroundAtmosphere = false;
      
      // Set a reasonable memory cache size
      viewer.scene.globe.maximumScreenSpaceError = 2;
      
      // Disable depth test against terrain when not needed
      viewer.scene.globe.depthTestAgainstTerrain = false;
      
      console.log('Performance configuration completed');
    } else {
      console.warn('Cannot configure performance: viewer or scene is not available');
    }
  } catch (error) {
    console.error('Error configuring Cesium for performance:', error);
  }
} 