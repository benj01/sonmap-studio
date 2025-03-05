import { BaseGeoDataParser, ParserOptions, ParserProgressEvent, InvalidFileFormatError } from './base-parser';
import { FullDataset, GeoFeature } from '@/types/geo-import';
import { read } from 'shapefile';
import type { Feature, FeatureCollection, Geometry, GeoJsonProperties, Position } from 'geojson';
import proj4 from 'proj4';
import { LogManager, LogLevel } from '@/core/logging/log-manager';
import { getCoordinateSystem } from '@/lib/coordinate-systems';
import { COORDINATE_SYSTEMS } from '@/core/coordinates/coordinates';
import * as turf from '@turf/turf';

const SOURCE = 'ShapefileParser';
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
  }
};

/**
 * Gets coordinates from a GeoJSON geometry
 */
function getCoordinates(geometry: Geometry): number[] {
  switch (geometry.type) {
    case 'Point':
      return geometry.coordinates;
    case 'LineString':
    case 'MultiPoint':
      return geometry.coordinates.flat();
    case 'Polygon':
    case 'MultiLineString':
      return geometry.coordinates.flat(2);
    case 'MultiPolygon':
      return geometry.coordinates.flat(3);
    case 'GeometryCollection':
      return geometry.geometries.flatMap(g => getCoordinates(g));
    default:
      return [];
  }
}

/**
 * Detect SRID based on coordinate ranges
 * Returns null if coordinates don't match any known ranges
 */
function detectSRIDFromCoordinates(x: number, y: number): number | null {
  // Swiss LV95 coordinate range
  if (x >= 2485000 && x <= 2834000 && y >= 1075000 && y <= 1299000) {
    logger.info('Detected Swiss LV95 coordinates based on coordinate ranges', { x, y });
    return 2056;
  }
  // Add more coordinate range checks here if needed
  return null;
}

/**
 * Transform coordinates to WGS84
 */
async function transformCoordinates(coords: Position, fromSrid: number): Promise<Position> {
  try {
    // Extract Z coordinate if it exists
    const hasZ = coords.length > 2;
    const z = hasZ ? coords[2] : null;

    // Get coordinate system definition
    const fromSystem = await getCoordinateSystem(fromSrid);
    // Define the coordinate system if not already defined
    if (!proj4.defs(`EPSG:${fromSrid}`)) {
      proj4.defs(`EPSG:${fromSrid}`, fromSystem.proj4);
    }
    
    // Transform X,Y coordinates
    const result = proj4(`EPSG:${fromSrid}`, COORDINATE_SYSTEMS.WGS84, [coords[0], coords[1]]);
    
    // Add Z coordinate back if it existed
    return hasZ && z !== null ? [result[0], result[1], z] : result;
  } catch (error) {
    logger.warn('Failed to transform coordinates:', error);
    return coords;
  }
}

/**
 * Transform a GeoJSON geometry to WGS84
 */
async function transformGeometry(geometry: Geometry, srid: number): Promise<Geometry> {
  try {
    switch (geometry.type) {
      case 'Point':
        return {
          ...geometry,
          coordinates: await transformCoordinates(geometry.coordinates, srid)
        };
      case 'LineString':
      case 'MultiPoint':
        return {
          ...geometry,
          coordinates: await Promise.all(geometry.coordinates.map(coord => transformCoordinates(coord, srid)))
        };
      case 'Polygon':
      case 'MultiLineString':
        return {
          ...geometry,
          coordinates: await Promise.all(geometry.coordinates.map(async ring => 
            await Promise.all(ring.map(coord => transformCoordinates(coord, srid)))
          ))
        };
      case 'MultiPolygon':
        return {
          ...geometry,
          coordinates: await Promise.all(geometry.coordinates.map(async polygon =>
            await Promise.all(polygon.map(async ring => 
              await Promise.all(ring.map(coord => transformCoordinates(coord, srid)))
            ))
          ))
        };
      case 'GeometryCollection':
        return {
          ...geometry,
          geometries: await Promise.all(geometry.geometries.map(g => transformGeometry(g, srid)))
        };
      default:
        return geometry;
    }
  } catch (error) {
    logger.warn('Failed to transform geometry:', { error, geometryType: geometry.type });
    return geometry;
  }
}

/**
 * Updates bounds with new coordinates
 */
function updateBounds(bounds: [number, number, number, number] | undefined, coords: number[]): [number, number, number, number] {
  if (coords.length < 2) return bounds || [0, 0, 0, 0];
  
  const [minX, minY, maxX, maxY] = bounds || [Infinity, Infinity, -Infinity, -Infinity];
  let newBounds: [number, number, number, number] = [minX, minY, maxX, maxY];
  
  for (let i = 0; i < coords.length; i += 2) {
    const x = coords[i];
    const y = coords[i + 1];
    if (x < newBounds[0]) newBounds[0] = x;
    if (y < newBounds[1]) newBounds[1] = y;
    if (x > newBounds[2]) newBounds[2] = x;
    if (y > newBounds[3]) newBounds[3] = y;
  }
  
  return newBounds;
}

// Update the metadata type to include srid
interface ShapefileMetadata {
  featureCount: number;
  bounds?: [number, number, number, number];
  geometryTypes: string[];
  properties: string[];
  srid?: number;
}

/**
 * Parser for ESRI Shapefiles
 */
export class ShapefileParser extends BaseGeoDataParser {
  private srid: number | undefined = undefined;
  private features: GeoFeature[] = [];

  /**
   * Parse a Shapefile and its companion files
   */
  async parse(
    mainFile: ArrayBuffer,
    companionFiles?: Record<string, ArrayBuffer>,
    options?: ParserOptions,
    onProgress?: (event: ParserProgressEvent) => void
  ): Promise<FullDataset> {
    try {
      logger.info('Starting parse operation', {
        mainFileSize: mainFile.byteLength,
        companionFiles: companionFiles ? Object.keys(companionFiles) : []
      });

      // Validate companion files
      if (!companionFiles || !companionFiles['.dbf']) {
        const error = 'Missing required .dbf file';
        logger.error(error);
        throw new InvalidFileFormatError('shapefile', error);
      }

      // Try to detect coordinate system from .prj file
      if (companionFiles['.prj']) {
        try {
          const prjContent = new TextDecoder().decode(companionFiles['.prj']);
          const detectedSrid = this.parsePrjFile(prjContent);
          if (detectedSrid !== null) {
            this.srid = detectedSrid;
            logger.info(`Detected coordinate system: EPSG:${this.srid}`, {
              prjContent
            });
          }
        } catch (error) {
          logger.warn('Failed to parse .prj file', error);
        }
      }

      // Parse shapefile
      logger.info('Reading shapefile data...');
      const result = await read(mainFile, companionFiles['.dbf']);
      const geojson = result as unknown as FeatureCollection<Geometry, GeoJsonProperties>;

      logger.info('Shapefile parsed', {
        featureCount: geojson.features.length
      });

      // If no SRID detected from PRJ, try to detect from coordinates
      if (!this.srid && geojson.features.length > 0) {
        const firstFeature = geojson.features[0];
        const coords = getCoordinates(firstFeature.geometry);
        if (coords.length >= 2) {
          const [x, y] = coords;
          const detectedSrid = detectSRIDFromCoordinates(x, y);
          if (detectedSrid !== null) {
            this.srid = detectedSrid;
          }
        }
      }

      // Transform coordinates if SRID is detected
      let features = geojson.features.map((feature, index) => ({
        id: index,
        geometry: feature.geometry,
        properties: feature.properties || {},
        originalIndex: index
      }));

      if (this.srid) {
        logger.info(`Transforming coordinates from EPSG:${this.srid} to WGS84...`);
        features = await Promise.all(features.map(async feature => ({
          ...feature,
          geometry: await transformGeometry(feature.geometry, this.srid!)
        })));
        logger.info('Coordinate transformation complete');
      }

      // Calculate metadata
      const featureCollection: FeatureCollection = {
        type: 'FeatureCollection',
        features: features.map(f => ({
          type: 'Feature',
          geometry: f.geometry,
          properties: f.properties
        }))
      };

      const bbox = turf.bbox(featureCollection);
      const bounds: [number, number, number, number] = [bbox[0], bbox[1], bbox[2], bbox[3]];
      const geometryTypes = new Set(features.map(f => f.geometry.type));
      const properties = features[0] ? Object.keys(features[0].properties) : [];

      return {
        sourceFile: options?.filename || 'unknown.shp',
        fileType: 'shapefile',
        features,
        previewFeatures: features.slice(0, 100),
        metadata: {
          featureCount: features.length,
          bounds,
          geometryTypes: Array.from(geometryTypes) as any[],
          properties,
          srid: this.srid || 2056 // Use detected SRID or default to Swiss LV95
        }
      };

    } catch (error) {
      logger.error('Parse failed', error);
      throw new InvalidFileFormatError('shapefile', 
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Validate the Shapefile and its companion files
   */
  async validate(
    mainFile: ArrayBuffer,
    companionFiles?: Record<string, ArrayBuffer>
  ): Promise<boolean> {
    try {
      if (!companionFiles || !companionFiles['.dbf']) {
        throw new Error('Missing required .dbf file');
      }

      const result = await read(mainFile, companionFiles['.dbf']);
      const geojson = result as unknown as FeatureCollection<Geometry, GeoJsonProperties>;
      return geojson.features.length > 0 && !!geojson.features[0].geometry;
    } catch (error) {
      logger.warn('Validation failed', error);
      return false;
    }
  }

  /**
   * Get metadata about the Shapefile
   */
  async getMetadata(
    mainFile: ArrayBuffer,
    companionFiles?: Record<string, ArrayBuffer>
  ): Promise<ShapefileMetadata> {
    try {
      if (!companionFiles?.['.dbf']) {
        throw new Error('Missing required .dbf file');
      }

      const result = await read(mainFile, companionFiles['.dbf']);
      const geojson = result as unknown as FeatureCollection<Geometry, GeoJsonProperties>;
      if (!geojson.features.length) {
        throw new Error('Empty shapefile');
      }

      let bounds: [number, number, number, number] | undefined;
      const geometryTypes = new Set<string>();
      const properties = Object.keys(geojson.features[0].properties || {});

      for (const feature of geojson.features) {
        if (feature.geometry) {
          const coords = getCoordinates(feature.geometry);
          bounds = updateBounds(bounds, coords);
          geometryTypes.add(feature.geometry.type);
        }
      }

      let srid: number | undefined;
      if (companionFiles['.prj']) {
        const prjContent = new TextDecoder().decode(companionFiles['.prj']);
        srid = this.parsePrjFile(prjContent);
      }

      return {
        featureCount: geojson.features.length,
        bounds,
        geometryTypes: Array.from(geometryTypes),
        properties,
        srid
      };
    } catch (error) {
      throw new InvalidFileFormatError('shapefile',
        error instanceof Error ? error.message : 'Failed to read metadata'
      );
    }
  }

  /**
   * Parse a .prj file and return the SRID if possible
   */
  private parsePrjFile(prjContent: string): number | undefined {
    try {
      // Common WKT patterns for coordinate systems
      const wktPatterns = {
        '2056': /CH1903\+|LV95|EPSG:2056/i,
        '21781': /CH1903|LV03|EPSG:21781/i,
        '4326': /WGS84|EPSG:4326/i,
        '3857': /Web_Mercator|EPSG:3857/i
      };

      // Try to match against known patterns
      for (const [epsg, pattern] of Object.entries(wktPatterns)) {
        if (pattern.test(prjContent)) {
          logger.info(`Detected coordinate system from PRJ pattern: EPSG:${epsg}`);
          return parseInt(epsg);
        }
      }

      // Fallback to Swiss LV95 if PRJ content suggests Swiss coordinates
      if (prjContent.includes('Switzerland') || prjContent.includes('Swiss') || 
          prjContent.includes('CH') || prjContent.includes('LV95')) {
        logger.info('Defaulting to Swiss LV95 (EPSG:2056) based on PRJ content');
        return 2056;
      }

      logger.warn('Could not determine coordinate system from PRJ file', { prjContent });
      return undefined;
    } catch (error) {
      logger.warn('Failed to parse PRJ file:', error);
      return undefined;
    }
  }

  /**
   * Helper method to get coordinates of the first feature for analysis
   */
  private getFirstFeatureCoordinates(): [number, number] | undefined {
    try {
      const firstFeature = this.features?.[0];
      if (firstFeature?.geometry) {
        const coords = getCoordinates(firstFeature.geometry);
        if (coords.length >= 2) {
          return [coords[0], coords[1]];
        }
      }
      return undefined;
    } catch (error) {
      logger.warn('Failed to get first feature coordinates:', error);
      return undefined;
    }
  }
} 