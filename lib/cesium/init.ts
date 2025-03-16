import * as Cesium from 'cesium';

// Declare the CESIUM_BASE_URL property on the Window interface
declare global {
  interface Window {
    CESIUM_BASE_URL: string;
  }
}

/**
 * Create imagery provider view models for open-access tile sources
 * These can be used without Cesium Ion
 */
export function createOpenSourceImageryProviders() {
  // Ensure base URL is set before creating providers
  if (!window.CESIUM_BASE_URL) {
    window.CESIUM_BASE_URL = '/static/cesium';
  }
  
  // Carto's attribution for basemaps
  const CartoAttribution = 'Map tiles by <a href="https://carto.com">Carto</a>, under CC BY 3.0. Data by <a href="https://www.openstreetmap.org/">OpenStreetMap</a>, under ODbL.';
  
  const imageryViewModels = [];
  
  // OpenStreetMap
  imageryViewModels.push(new Cesium.ProviderViewModel({
    name: 'OpenStreetMap',
    iconUrl: '',
    tooltip: 'OpenStreetMap (OSM) is a collaborative project to create a free editable map of the world.\nhttp://www.openstreetmap.org',
    creationFunction: function() {
      return new Cesium.UrlTemplateImageryProvider({
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        subdomains: 'abc',
        minimumLevel: 0,
        maximumLevel: 19
      });
    }
  }));
  
  // Carto Positron
  imageryViewModels.push(new Cesium.ProviderViewModel({
    name: 'Positron',
    tooltip: 'CartoDB Positron basemap',
    iconUrl: '',
    creationFunction: function() {
      return new Cesium.UrlTemplateImageryProvider({
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        credit: CartoAttribution,
        subdomains: 'abcd',
        minimumLevel: 0,
        maximumLevel: 18
      });
    }
  }));
  
  // Carto Dark Matter
  imageryViewModels.push(new Cesium.ProviderViewModel({
    name: 'Dark Matter',
    tooltip: 'CartoDB Dark Matter basemap',
    iconUrl: '',
    creationFunction: function() {
      return new Cesium.UrlTemplateImageryProvider({
        url: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png',
        credit: CartoAttribution,
        subdomains: 'abcd',
        minimumLevel: 0,
        maximumLevel: 18
      });
    }
  }));
  
  // USGS National Map Satellite
  imageryViewModels.push(new Cesium.ProviderViewModel({
    name: 'National Map Satellite',
    iconUrl: '',
    tooltip: 'USGS National Map Satellite',
    creationFunction: function() {
      return new Cesium.UrlTemplateImageryProvider({
        url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
        credit: 'Tile data from <a href="https://basemap.nationalmap.gov/">USGS</a>',
        minimumLevel: 0,
        maximumLevel: 16
      });
    }
  }));
  
  // Simple grid for offline use (fallback)
  imageryViewModels.push(new Cesium.ProviderViewModel({
    name: 'Grid',
    tooltip: 'Simple grid for offline use',
    iconUrl: '',
    creationFunction: function() {
      return new Cesium.GridImageryProvider({
        cells: 4,
        color: Cesium.Color.fromCssColorString('#aaaaaa')
      });
    }
  }));
  
  return imageryViewModels;
}

/**
 * Create a default imagery provider that works without Ion
 */
export function createDefaultImageryProvider() {
  // Ensure base URL is set
  if (!window.CESIUM_BASE_URL) {
    window.CESIUM_BASE_URL = '/static/cesium';
  }
  
  // Try to use OpenStreetMap as default
  try {
    return new Cesium.UrlTemplateImageryProvider({
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      subdomains: 'abc',
      minimumLevel: 0,
      maximumLevel: 19
    });
  } catch (error) {
    console.warn('Failed to create OpenStreetMap provider, falling back to grid:', error);
    // Fallback to grid if OSM fails
    return new Cesium.GridImageryProvider({
      cells: 4,
      color: Cesium.Color.fromCssColorString('#aaaaaa')
    });
  }
}

/**
 * Initialize Cesium with global configuration
 * This setup avoids using Cesium Ion services and focuses on open-source data
 */
export function initCesium() {
  console.log('Starting Cesium initialization');
  
  // Set the base URL for Cesium assets
  window.CESIUM_BASE_URL = '/static/cesium';
  
  // Disable Cesium Ion - explicitly set to empty string to avoid warnings
  Cesium.Ion.defaultAccessToken = '';
  
  // Set default view
  Cesium.Camera.DEFAULT_VIEW_RECTANGLE = Cesium.Rectangle.fromDegrees(
    -180.0, -90.0, 180.0, 90.0
  );
  
  console.log('Cesium initialization completed with open-source imagery providers');
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
      
      // Disable features that might try to load external assets
      if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
      if (viewer.scene.sun) viewer.scene.sun.show = false;
      if (viewer.scene.moon) viewer.scene.moon.show = false;
      if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
      
      // Remove terrain provider view models to avoid Ion requests
      if (viewer.baseLayerPicker && viewer.baseLayerPicker.viewModel) {
        // Clear the terrain provider view models array
        while (viewer.baseLayerPicker.viewModel.terrainProviderViewModels.length > 0) {
          viewer.baseLayerPicker.viewModel.terrainProviderViewModels.pop();
        }
      }
      
      console.log('Performance configuration completed');
    } else {
      console.warn('Cannot configure performance: viewer or scene is not available');
    }
  } catch (error) {
    console.error('Error configuring Cesium for performance:', error);
  }
} 