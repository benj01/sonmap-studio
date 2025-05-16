import * as Cesium from 'cesium';
import { fullyDisableIon, verifyIonDisabled } from './ion-disable';
import { dbLogger } from '@/utils/logging/dbLogger';

const SOURCE = 'CesiumInit';

// Declare the CESIUM_BASE_URL property on the Window interface
declare global {
  interface Window {
    CESIUM_BASE_URL: string;
  }
}

/**
 * Verifies that Cesium is properly loaded and available
 */
async function verifyCesiumLoaded(): Promise<boolean> {
  try {
    if (typeof Cesium === 'undefined') {
      await dbLogger.error('Cesium is not defined', undefined, { source: SOURCE });
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
        await dbLogger.error(`Required Cesium component not found: ${component}`, undefined, { source: SOURCE });
        return false;
      }
    }
    
    await dbLogger.debug('Cesium components verified', { source: SOURCE });
    return true;
  } catch (error: unknown) {
    await dbLogger.error('Error verifying Cesium components', { error }, { source: SOURCE });
    return false;
  }
}

/**
 * Verifies that the base URL is properly set
 */
function verifyBaseUrl(): boolean {
  try {
    if (!window.CESIUM_BASE_URL) {
      dbLogger.error('CESIUM_BASE_URL is not set', { source: SOURCE });
      return false;
    }
    
    // Verify the base URL is accessible
    const testUrl = `${window.CESIUM_BASE_URL}/Assets/Textures/NaturalEarthII/0/0/0.jpg`;
    const xhr = new XMLHttpRequest();
    xhr.open('HEAD', testUrl, false);
    xhr.send();
    
    if (xhr.status !== 200) {
      dbLogger.error(`Base URL verification failed: ${testUrl}`, { source: SOURCE });
      return false;
    }
    
    dbLogger.debug('Base URL verified', { source: SOURCE });
    return true;
  } catch (error: unknown) {
    dbLogger.error('Error verifying base URL', { error, source: SOURCE });
    return false;
  }
}

/**
 * Creates a default imagery provider that works without Ion
 */
export function createDefaultImageryProvider(): Cesium.ImageryProvider {
  try {
    // Use OpenStreetMap as the default provider
    return new Cesium.OpenStreetMapImageryProvider({
      credit: new Cesium.Credit('© OpenStreetMap contributors'),
      maximumLevel: 19
    });
  } catch (error: unknown) {
    dbLogger.error('Failed to create default imagery provider', { error, source: SOURCE });
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
export function createDefaultViewerConfig(container: HTMLElement): Record<string, unknown> {
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
        credit: new Cesium.Credit('© OpenStreetMap contributors'),
        maximumLevel: 19
      })
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
    
    dbLogger.debug('Viewer configured successfully', { source: SOURCE });
  } catch (error: unknown) {
    dbLogger.error('Error configuring viewer', { error, source: SOURCE });
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
    
    dbLogger.info('Cesium viewer created successfully', { source: SOURCE });
    return viewer;
  } catch (error: unknown) {
    dbLogger.error('Error creating viewer', { error, source: SOURCE });
    return null;
  }
}

/**
 * Initialize Cesium with global configuration
 * This setup avoids using Cesium Ion services and focuses on open-source data
 */
export function initCesium(): boolean {
  dbLogger.info('Starting Cesium initialization', { source: SOURCE });
  
  // Step 1: Verify Cesium is loaded
  if (!verifyCesiumLoaded()) {
    dbLogger.error('Cesium initialization failed: Cesium not properly loaded', { source: SOURCE });
    return false;
  }
  
  // Step 2: Set and verify base URL
  window.CESIUM_BASE_URL = '/static/cesium';
  if (!verifyBaseUrl()) {
    dbLogger.error('Cesium initialization failed: Base URL verification failed', { source: SOURCE });
    return false;
  }
  
  // Step 3: Disable Cesium Ion
  if (!fullyDisableIon()) {
    dbLogger.error('Cesium initialization failed: Could not disable Ion services', { source: SOURCE });
    return false;
  }
  
  // Step 4: Verify Ion is disabled
  if (!verifyIonDisabled()) {
    dbLogger.error('Cesium initialization failed: Ion services not properly disabled', { source: SOURCE });
    return false;
  }
  
  // Step 5: Set default view
  Cesium.Camera.DEFAULT_VIEW_RECTANGLE = Cesium.Rectangle.fromDegrees(
    -180.0, -90.0, 180.0, 90.0
  );
  
  dbLogger.info('Cesium initialization completed successfully', { source: SOURCE });
  return true;
}

/**
 * Verifies that a viewer instance is properly configured
 */
export function verifyViewer(viewer: Cesium.Viewer): boolean {
  try {
    // Check if viewer exists and is not destroyed
    if (!viewer || viewer.isDestroyed()) {
      dbLogger.error('Viewer is not available or has been destroyed', { source: SOURCE });
      return false;
    }
    
    // Check essential components
    if (!viewer.scene || !viewer.camera) {
      dbLogger.error('Viewer is missing essential components', { source: SOURCE });
      return false;
    }
    
    // Check if Ion is still disabled
    if (!verifyIonDisabled()) {
      dbLogger.error('Ion services are not properly disabled in viewer', { source: SOURCE });
      return false;
    }
    
    // Check if imagery layers are properly configured
    if (!viewer.imageryLayers || viewer.imageryLayers.length === 0) {
      dbLogger.error('Viewer imagery layers are not properly configured', { source: SOURCE });
      return false;
    }

    // Check for Ion-related DOM elements
    const cesiumCredit = document.querySelector('.cesium-credit-logoContainer');
    if (cesiumCredit) {
      dbLogger.warn('Cesium logo container found in DOM, hiding it', { source: SOURCE });
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
        dbLogger.warn(`Found Ion-related element: ${selector}, hiding it`, { source: SOURCE });
        (element as HTMLElement).style.display = 'none';
      }
    });

    // Verify viewer configuration
    if (viewer.baseLayerPicker) {
      dbLogger.warn('Base layer picker is enabled (read-only property)', { source: SOURCE });
    }
    if (viewer.geocoder) {
      dbLogger.warn('Geocoder is enabled (read-only property)', { source: SOURCE });
    }
    if (viewer.homeButton) {
      dbLogger.warn('Home button is enabled (read-only property)', { source: SOURCE });
    }
    if (viewer.sceneModePicker) {
      dbLogger.warn('Scene mode picker is enabled (read-only property)', { source: SOURCE });
    }
    if (viewer.navigationHelpButton) {
      dbLogger.warn('Navigation help button is enabled (read-only property)', { source: SOURCE });
    }
    if (viewer.animation) {
      dbLogger.warn('Animation widget is enabled (read-only property)', { source: SOURCE });
    }
    if (viewer.timeline) {
      dbLogger.warn('Timeline widget is enabled (read-only property)', { source: SOURCE });
    }
    if (viewer.fullscreenButton) {
      dbLogger.warn('Fullscreen button is enabled (read-only property)', { source: SOURCE });
    }
    if (viewer.infoBox) {
      dbLogger.warn('Info box is enabled (read-only property)', { source: SOURCE });
    }
    if (viewer.selectionIndicator) {
      dbLogger.warn('Selection indicator is enabled (read-only property)', { source: SOURCE });
    }

    // Verify scene configuration
    if (viewer.scene.skyBox.show) {
      dbLogger.warn('Sky box is visible, hiding it', { source: SOURCE });
      viewer.scene.skyBox.show = false;
    }

    if (viewer.scene.sun.show) {
      dbLogger.warn('Sun is visible, hiding it', { source: SOURCE });
      viewer.scene.sun.show = false;
    }

    if (viewer.scene.moon.show) {
      dbLogger.warn('Moon is visible, hiding it', { source: SOURCE });
      viewer.scene.moon.show = false;
    }

    if (viewer.scene.skyAtmosphere.show) {
      dbLogger.warn('Sky atmosphere is visible, hiding it', { source: SOURCE });
      viewer.scene.skyAtmosphere.show = false;
    }

    if (viewer.scene.globe.enableLighting) {
      dbLogger.warn('Globe lighting is enabled, disabling it', { source: SOURCE });
      viewer.scene.globe.enableLighting = false;
    }

    if (viewer.scene.globe.showGroundAtmosphere) {
      dbLogger.warn('Ground atmosphere is visible, hiding it', { source: SOURCE });
      viewer.scene.globe.showGroundAtmosphere = false;
    }

    if (viewer.scene.globe.depthTestAgainstTerrain) {
      dbLogger.warn('Terrain depth testing is enabled, disabling it', { source: SOURCE });
      viewer.scene.globe.depthTestAgainstTerrain = false;
    }
    
    dbLogger.debug('Viewer verification passed', { source: SOURCE });
    return true;
  } catch (error: unknown) {
    dbLogger.error('Error verifying viewer', { error, source: SOURCE });
    return false;
  }
} 