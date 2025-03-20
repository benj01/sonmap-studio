import * as Cesium from 'cesium';
import { fullyDisableIon, verifyIonDisabled } from './ion-disable';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'CesiumInit';
const logManager = LogManager.getInstance();

const logger = {
  info: (message: string, data?: any) => {
    logManager.info(SOURCE, message, data);
    console.log(`[${SOURCE}] ${message}`, data);
  },
  warn: (message: string, error?: any) => {
    logManager.warn(SOURCE, message, error);
    console.warn(`[${SOURCE}] ${message}`, error);
  },
  error: (message: string, error?: any) => {
    logManager.error(SOURCE, message, error);
    console.error(`[${SOURCE}] ${message}`, error);
  },
  debug: (message: string, data?: any) => {
    logManager.debug(SOURCE, message, data);
    console.debug(`[${SOURCE}] ${message}`, data);
  }
};

// Declare the CESIUM_BASE_URL property on the Window interface
declare global {
  interface Window {
    CESIUM_BASE_URL: string;
  }
}

/**
 * Verifies that Cesium is properly loaded and available
 */
function verifyCesiumLoaded(): boolean {
  try {
    if (typeof Cesium === 'undefined') {
      logger.error('Cesium is not defined');
      return false;
    }
    
    // Check for essential Cesium components
    const requiredComponents = [
      'Viewer',
      'Scene',
      'Camera',
      'Globe',
      'ImageryLayer',
      'TileMapServiceImageryProvider',
      'EllipsoidTerrainProvider'
    ];
    
    for (const component of requiredComponents) {
      if (!(component in Cesium)) {
        logger.error(`Required Cesium component not found: ${component}`);
        return false;
      }
    }
    
    logger.debug('Cesium components verified');
    return true;
  } catch (error) {
    logger.error('Error verifying Cesium components:', error);
    return false;
  }
}

/**
 * Verifies that the base URL is properly set
 */
function verifyBaseUrl(): boolean {
  try {
    if (!window.CESIUM_BASE_URL) {
      logger.error('CESIUM_BASE_URL is not set');
      return false;
    }
    
    // Verify the base URL is accessible
    const testUrl = `${window.CESIUM_BASE_URL}/Assets/Textures/NaturalEarthII/0/0/0.jpg`;
    const xhr = new XMLHttpRequest();
    xhr.open('HEAD', testUrl, false);
    xhr.send();
    
    if (xhr.status !== 200) {
      logger.error(`Base URL verification failed: ${testUrl}`);
      return false;
    }
    
    logger.debug('Base URL verified');
    return true;
  } catch (error) {
    logger.error('Error verifying base URL:', error);
    return false;
  }
}

/**
 * Creates a set of offline imagery providers
 */
function createOfflineImageryProviders(): Cesium.ImageryProvider[] {
  const providers: Cesium.ImageryProvider[] = [];
  
  try {
    // Natural Earth II (base layer)
    providers.push(new Cesium.TileMapServiceImageryProvider({
      url: Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII'),
      fileExtension: 'jpg',
      maximumLevel: 5,
      credit: new Cesium.Credit('Natural Earth II')
    }));

    // OpenStreetMap (as a fallback)
    providers.push(new Cesium.OpenStreetMapImageryProvider({
      url: 'https://tile.openstreetmap.org/',
      fileExtension: 'png',
      maximumLevel: 19,
      credit: 'MapQuest, Open Street Map and contributors, CC-BY-SA'
    } as any));

    // Grid provider (ultimate fallback)
    providers.push(new Cesium.GridImageryProvider({
      cells: 4,
      color: Cesium.Color.fromCssColorString('#aaaaaa')
    }));

    logger.debug('Offline imagery providers created successfully');
    return providers;
  } catch (error) {
    logger.error('Error creating offline imagery providers:', error);
    // Return just the grid provider as a fallback
    return [new Cesium.GridImageryProvider({
      cells: 4,
      color: Cesium.Color.fromCssColorString('#aaaaaa')
    })];
  }
}

/**
 * Creates a default imagery provider that works without Ion
 */
export function createDefaultImageryProvider(): Cesium.ImageryProvider {
  try {
    // Use OpenStreetMap as the default provider
    return new Cesium.OpenStreetMapImageryProvider({
      url: 'https://tile.openstreetmap.org/',
      credit: new Cesium.Credit('© OpenStreetMap contributors'),
      maximumLevel: 19,
      enablePickFeatures: false
    } as any);
  } catch (error) {
    logger.error('Failed to create default imagery provider:', error);
    // Fallback to grid if all else fails
    return new Cesium.GridImageryProvider({
      cells: 4,
      color: Cesium.Color.fromCssColorString('#aaaaaa')
    });
  }
}

/**
 * Creates a default viewer configuration
 */
export function createDefaultViewerConfig(container: HTMLElement): any {
  return {
    container: container,
    imageryProvider: createDefaultImageryProvider(),
    baseLayerPicker: false,
    geocoder: false,
    sceneModePicker: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    navigationHelpButton: false,
    homeButton: false,
    infoBox: false,
    selectionIndicator: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
    contextOptions: {
      webgl: {
        alpha: false,
        antialias: true,
        preserveDrawingBuffer: true,
        failIfMajorPerformanceCaveat: false
      }
    }
  };
}

/**
 * Configures a viewer instance for optimal performance and offline use
 */
export function configureViewer(viewer: Cesium.Viewer): void {
  try {
    // Remove all existing imagery layers
    viewer.imageryLayers.removeAll();
    
    // Add OpenStreetMap as the base layer
    const baseLayer = new Cesium.ImageryLayer(
      new Cesium.OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/',
        credit: new Cesium.Credit('© OpenStreetMap contributors'),
        maximumLevel: 19,
        enablePickFeatures: false
      } as any)
    );
    viewer.imageryLayers.add(baseLayer);
    
    // Disable sky and atmosphere
    viewer.scene.skyBox.show = false;
    viewer.scene.sun.show = false;
    viewer.scene.moon.show = false;
    viewer.scene.skyAtmosphere.show = false;
    
    // Disable globe lighting and atmosphere
    viewer.scene.globe.enableLighting = false;
    viewer.scene.globe.showGroundAtmosphere = false;
    viewer.scene.globe.depthTestAgainstTerrain = false;
    
    // Set performance options
    viewer.scene.globe.maximumScreenSpaceError = 2;
    viewer.scene.globe.baseColor = Cesium.Color.WHITE;
    
    // Remove any Ion-related view models
    if (viewer.baseLayerPicker && viewer.baseLayerPicker.viewModel) {
      viewer.baseLayerPicker.viewModel.imageryProviderViewModels.length = 0;
      viewer.baseLayerPicker.viewModel.terrainProviderViewModels.length = 0;
    }
    
    logger.debug('Viewer configured successfully');
  } catch (error) {
    logger.error('Error configuring viewer:', error);
  }
}

/**
 * Creates and configures a new Cesium viewer
 */
export function createViewer(container: HTMLElement): Cesium.Viewer | null {
  try {
    // Create viewer with default configuration
    const viewer = new Cesium.Viewer(container, createDefaultViewerConfig(container));
    
    // Configure the viewer
    configureViewer(viewer);
    
    logger.info('Cesium viewer created successfully');
    return viewer;
  } catch (error) {
    logger.error('Error creating viewer:', error);
    return null;
  }
}

/**
 * Initialize Cesium with global configuration
 * This setup avoids using Cesium Ion services and focuses on open-source data
 */
export function initCesium(): boolean {
  logger.info('Starting Cesium initialization');
  
  // Step 1: Verify Cesium is loaded
  if (!verifyCesiumLoaded()) {
    logger.error('Cesium initialization failed: Cesium not properly loaded');
    return false;
  }
  
  // Step 2: Set and verify base URL
  window.CESIUM_BASE_URL = '/static/cesium';
  if (!verifyBaseUrl()) {
    logger.error('Cesium initialization failed: Base URL verification failed');
    return false;
  }
  
  // Step 3: Disable Cesium Ion
  if (!fullyDisableIon()) {
    logger.error('Cesium initialization failed: Could not disable Ion services');
    return false;
  }
  
  // Step 4: Verify Ion is disabled
  if (!verifyIonDisabled()) {
    logger.error('Cesium initialization failed: Ion services not properly disabled');
    return false;
  }
  
  // Step 5: Set default view
  Cesium.Camera.DEFAULT_VIEW_RECTANGLE = Cesium.Rectangle.fromDegrees(
    -180.0, -90.0, 180.0, 90.0
  );
  
  logger.info('Cesium initialization completed successfully');
  return true;
}

/**
 * Verifies that a viewer instance is properly configured
 */
export function verifyViewer(viewer: Cesium.Viewer): boolean {
  try {
    // Check if viewer exists and is not destroyed
    if (!viewer || viewer.isDestroyed()) {
      logger.error('Viewer is not available or has been destroyed');
      return false;
    }
    
    // Check essential components
    if (!viewer.scene || !viewer.camera) {
      logger.error('Viewer is missing essential components');
      return false;
    }
    
    // Check if Ion is still disabled
    if (!verifyIonDisabled()) {
      logger.error('Ion services are not properly disabled in viewer');
      return false;
    }
    
    // Check if imagery layers are properly configured
    if (!viewer.imageryLayers || viewer.imageryLayers.length === 0) {
      logger.error('Viewer imagery layers are not properly configured');
      return false;
    }

    // Check for Ion-related DOM elements
    const cesiumCredit = document.querySelector('.cesium-credit-logoContainer');
    if (cesiumCredit) {
      logger.warn('Cesium logo container found in DOM, hiding it');
      (cesiumCredit as HTMLElement).style.display = 'none';
    }

    // Check for Ion-related UI elements
    const ionElements = [
      '.cesium-viewer-bottom',
      '.cesium-viewer-toolbar',
      '.cesium-viewer-animationContainer',
      '.cesium-viewer-timelineContainer',
      '.cesium-viewer-fullscreenContainer',
      '.cesium-viewer-vrContainer',
      '.cesium-viewer-geocoderContainer',
      '.cesium-viewer-homeButtonContainer',
      '.cesium-viewer-sceneModePickerContainer',
      '.cesium-viewer-navigationHelpButtonContainer',
      '.cesium-viewer-infoBoxContainer'
    ];

    ionElements.forEach(selector => {
      const element = document.querySelector(selector);
      if (element) {
        logger.warn(`Found Ion-related element: ${selector}, hiding it`);
        (element as HTMLElement).style.display = 'none';
      }
    });

    // Verify viewer configuration
    if (viewer.baseLayerPicker) {
      logger.warn('Base layer picker is enabled, disabling it');
      viewer.baseLayerPicker = false;
    }

    if (viewer.geocoder) {
      logger.warn('Geocoder is enabled, disabling it');
      viewer.geocoder = false;
    }

    if (viewer.homeButton) {
      logger.warn('Home button is enabled, disabling it');
      viewer.homeButton = false;
    }

    if (viewer.sceneModePicker) {
      logger.warn('Scene mode picker is enabled, disabling it');
      viewer.sceneModePicker = false;
    }

    if (viewer.navigationHelpButton) {
      logger.warn('Navigation help button is enabled, disabling it');
      viewer.navigationHelpButton = false;
    }

    if (viewer.animation) {
      logger.warn('Animation widget is enabled, disabling it');
      viewer.animation = false;
    }

    if (viewer.timeline) {
      logger.warn('Timeline widget is enabled, disabling it');
      viewer.timeline = false;
    }

    if (viewer.fullscreenButton) {
      logger.warn('Fullscreen button is enabled, disabling it');
      viewer.fullscreenButton = false;
    }

    if (viewer.infoBox) {
      logger.warn('Info box is enabled, disabling it');
      viewer.infoBox = false;
    }

    if (viewer.selectionIndicator) {
      logger.warn('Selection indicator is enabled, disabling it');
      viewer.selectionIndicator = false;
    }

    // Verify scene configuration
    if (viewer.scene.skyBox.show) {
      logger.warn('Sky box is visible, hiding it');
      viewer.scene.skyBox.show = false;
    }

    if (viewer.scene.sun.show) {
      logger.warn('Sun is visible, hiding it');
      viewer.scene.sun.show = false;
    }

    if (viewer.scene.moon.show) {
      logger.warn('Moon is visible, hiding it');
      viewer.scene.moon.show = false;
    }

    if (viewer.scene.skyAtmosphere.show) {
      logger.warn('Sky atmosphere is visible, hiding it');
      viewer.scene.skyAtmosphere.show = false;
    }

    if (viewer.scene.globe.enableLighting) {
      logger.warn('Globe lighting is enabled, disabling it');
      viewer.scene.globe.enableLighting = false;
    }

    if (viewer.scene.globe.showGroundAtmosphere) {
      logger.warn('Ground atmosphere is visible, hiding it');
      viewer.scene.globe.showGroundAtmosphere = false;
    }

    if (viewer.scene.globe.depthTestAgainstTerrain) {
      logger.warn('Terrain depth testing is enabled, disabling it');
      viewer.scene.globe.depthTestAgainstTerrain = false;
    }
    
    logger.debug('Viewer verification passed');
    return true;
  } catch (error) {
    logger.error('Error verifying viewer:', error);
    return false;
  }
} 