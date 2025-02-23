const proj4 = require('proj4');
const { LogManager } = require('@/core/logging/log-manager');

const SOURCE = 'TestCoords';
const logManager = LogManager.getInstance();

const logger = {
  info: (message, data) => {
    logManager.info(SOURCE, message, data);
  }
};

// Define the Swiss LV95 projection
proj4.defs('EPSG:2056', '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs');

// Test coordinates from your shapefile
const swissCoords = [2643720.09032188, 1248971.43845587];

// Transform to WGS84
const wgs84 = proj4('EPSG:2056', 'EPSG:4326', swissCoords);
logger.info('Coordinate transformation', {
  original: {
    type: 'Swiss LV95',
    coordinates: swissCoords
  },
  wgs84: {
    type: 'WGS84',
    coordinates: wgs84
  }
});

// Now transform to Web Mercator (EPSG:3857)
proj4.defs('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs');
const webMercator = proj4('EPSG:4326', 'EPSG:3857', wgs84);
logger.info('Web Mercator transformation', {
  webMercator: {
    type: 'Web Mercator',
    coordinates: webMercator
  }
}); 