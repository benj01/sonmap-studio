import { BaseGeoDataParser, ParserOptions, ParserProgressEvent, InvalidFileFormatError } from './base-parser';
import { FullDataset, GeoFeature } from '@/types/geo-import';
import { read } from 'shapefile';
import type { Feature, FeatureCollection, Geometry, GeoJsonProperties, Position } from 'geojson';
import proj4 from 'proj4';
import { LogManager, LogLevel } from '@/core/logging/log-manager';

// Initialize proj4 with Swiss coordinate system
proj4.defs('EPSG:2056', '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs');

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
 * Transform coordinates to WGS84
 */
function transformCoordinates(coords: Position, fromSrid: number, logger: any): Position {
  try {
    // Use EPSG code instead of raw proj definition
    const fromProj = `EPSG:${fromSrid}`;
    const result = proj4(fromProj, 'EPSG:4326', coords);
    logger.info('Transformed coordinates', { from: coords, to: result });
    return result;
  } catch (error) {
    logger.warn('Failed to transform coordinates:', { error, coords });
    return coords;
  }
}

/**
 * Transform a GeoJSON geometry to WGS84
 */
function transformGeometry(geometry: Geometry, srid: number, logger: any): Geometry {
  switch (geometry.type) {
    case 'Point':
      return {
        ...geometry,
        coordinates: transformCoordinates(geometry.coordinates, srid, logger)
      };
    case 'LineString':
    case 'MultiPoint':
      return {
        ...geometry,
        coordinates: geometry.coordinates.map(coord => transformCoordinates(coord, srid, logger))
      };
    case 'Polygon':
    case 'MultiLineString':
      return {
        ...geometry,
        coordinates: geometry.coordinates.map(ring => 
          ring.map(coord => transformCoordinates(coord, srid, logger))
        )
      };
    case 'MultiPolygon':
      return {
        ...geometry,
        coordinates: geometry.coordinates.map(polygon =>
          polygon.map(ring => 
            ring.map(coord => transformCoordinates(coord, srid, logger))
          )
        )
      };
    case 'GeometryCollection':
      return {
        ...geometry,
        geometries: geometry.geometries.map(g => transformGeometry(g, srid, logger))
      };
    default:
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
  private srid?: number;
  private features: GeoFeature[] = [];
  private logManager = LogManager.getInstance();
  private readonly SOURCE = 'ShapefileParser';

  private logger = {
    info: (message: string, data?: any) => {
      this.logManager.info(this.SOURCE, message, data);
    },
    warn: (message: string, error?: any) => {
      this.logManager.warn(this.SOURCE, message, error);
    },
    error: (message: string, error?: any) => {
      this.logManager.error(this.SOURCE, message, error);
    },
    progress: (message: string, progress: number) => {
      this.logManager.info(this.SOURCE, `${progress.toFixed(1)}% - ${message}`);
    }
  };

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
      this.logger.info('Starting parse operation', {
        mainFileSize: mainFile.byteLength,
        companionFiles: companionFiles ? Object.keys(companionFiles) : [],
        options
      });

      this.reportProgress(onProgress, {
        phase: 'parsing',
        progress: 0,
        message: 'Starting Shapefile parsing'
      });

      if (!companionFiles || !companionFiles['.dbf']) {
        const error = 'Missing required .dbf file';
        this.logger.error(error);
        throw new InvalidFileFormatError('shapefile', error);
      }

      // Handle .prj file and set up projection
      if (companionFiles['.prj']) {
        try {
          const prjContent = new TextDecoder().decode(companionFiles['.prj']);
          this.srid = this.parsePrjFile(prjContent);
          this.logger.info(`Detected coordinate system: EPSG:${this.srid || 'unknown'}`, {
            prjContent
          });
        } catch (error) {
          this.logger.warn('Failed to parse .prj file', error);
        }
      }

      // Parse with read
      this.logger.info('Reading shapefile data...');
      const result = await read(mainFile, companionFiles['.dbf']);
      const geojson = result as unknown as FeatureCollection<Geometry, GeoJsonProperties>;

      this.logger.info('Shapefile parsed', {
        featureCount: geojson.features.length
      });

      // Store original coordinates without transformation
      // PostGIS will handle the transformation when needed
      this.features = geojson.features.map((feature: Feature<Geometry, GeoJsonProperties>, index: number) => ({
        id: index,
        geometry: feature.geometry,
        properties: feature.properties || {},
        originalIndex: index
      }));

      // Calculate metadata
      let bounds: [number, number, number, number] | undefined;
      const geometryTypes = new Set<string>();
      const properties = this.features[0] ? Object.keys(this.features[0].properties) : [];

      for (const feature of this.features) {
        if (feature.geometry) {
          const coords = getCoordinates(feature.geometry);
          bounds = updateBounds(bounds, coords);
          geometryTypes.add(feature.geometry.type);
        }
      }

      const dataset: FullDataset = {
        sourceFile: 'shapefile',
        fileType: 'shp',
        features: this.features,
        metadata: {
          featureCount: this.features.length,
          bounds,
          geometryTypes: Array.from(geometryTypes),
          properties,
          srid: this.srid
        }
      };

      this.reportProgress(onProgress, {
        phase: 'complete',
        progress: 100,
        message: 'Parsing complete'
      });

      this.logger.info('Parse complete', dataset.metadata);
      return dataset;
    } catch (error) {
      this.logger.error('Parse failed', error);
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
      this.logger.warn('Validation failed', error);
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
      // Common EPSG codes and their WKT patterns
      const wktPatterns: Record<number, RegExp> = {
        4326: /GEOGCS.*WGS.*84/i,
        3857: /PROJCS.*Web.*Mercator/i,
        2056: /PROJCS.*CH1903\+.*LV95/i,
        21781: /PROJCS.*CH1903/i
      };

      // First try to detect Swiss coordinates by looking for typical value ranges
      const firstFeature = this.getFirstFeatureCoordinates();
      if (firstFeature) {
        const [x, y] = firstFeature;
        // Check if coordinates are in typical Swiss range
        if (x >= 2485000 && x <= 2834000 && y >= 1075000 && y <= 1299000) {
          this.logger.info('Detected Swiss coordinates based on coordinate ranges', { x, y });
          return 2056;
        }
      }

      // Try to match against known patterns
      for (const [epsg, pattern] of Object.entries(wktPatterns)) {
        if (pattern.test(prjContent)) {
          this.logger.info(`Detected coordinate system from PRJ pattern: EPSG:${epsg}`);
          return parseInt(epsg);
        }
      }

      // If we still haven't identified the system but coordinates look like they might be Swiss
      if (prjContent.includes('Switzerland') || prjContent.includes('Swiss') || 
          prjContent.includes('CH') || prjContent.includes('LV95')) {
        this.logger.info('Defaulting to Swiss LV95 (EPSG:2056) based on PRJ content');
        return 2056;
      }

      this.logger.warn('Could not determine coordinate system from PRJ file', { prjContent });
      return undefined;
    } catch (error) {
      this.logger.warn('Failed to parse PRJ file:', error);
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
      this.logger.warn('Failed to get first feature coordinates:', error);
      return undefined;
    }
  }
} 