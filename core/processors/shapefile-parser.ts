import { BaseGeoDataParser, ParserOptions, ParserProgressEvent, InvalidFileFormatError } from './base-parser';
import { FullDataset, GeoFeature } from '@/types/geo-import';
import { read } from 'shapefile';
import type { Feature, FeatureCollection, Geometry, GeoJsonProperties, Position } from 'geojson';
import proj4 from 'proj4';
import { LogManager, LogLevel } from '@/core/logging/log-manager';

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
function transformCoordinates(coords: Position, fromProj: string, logger: any): Position {
  try {
    return proj4(fromProj, 'EPSG:4326', coords);
  } catch (error) {
    logger.warn('Failed to transform coordinates:', error);
    return coords;
  }
}

/**
 * Transform a GeoJSON geometry to WGS84
 */
function transformGeometry(geometry: Geometry, fromProj: string, logger: any): Geometry {
  switch (geometry.type) {
    case 'Point':
      return {
        ...geometry,
        coordinates: transformCoordinates(geometry.coordinates, fromProj, logger)
      };
    case 'LineString':
    case 'MultiPoint':
      return {
        ...geometry,
        coordinates: geometry.coordinates.map(coord => transformCoordinates(coord, fromProj, logger))
      };
    case 'Polygon':
    case 'MultiLineString':
      return {
        ...geometry,
        coordinates: geometry.coordinates.map(ring => 
          ring.map(coord => transformCoordinates(coord, fromProj, logger))
        )
      };
    case 'MultiPolygon':
      return {
        ...geometry,
        coordinates: geometry.coordinates.map(polygon =>
          polygon.map(ring => 
            ring.map(coord => transformCoordinates(coord, fromProj, logger))
          )
        )
      };
    case 'GeometryCollection':
      return {
        ...geometry,
        geometries: geometry.geometries.map(g => transformGeometry(g, fromProj, logger))
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
  private projDef?: string;
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
          this.projDef = prjContent;
          this.srid = this.parsePrjFile(prjContent);
          this.logger.info(`Detected coordinate system: EPSG:${this.srid || 'unknown'}`, {
            projDef: this.projDef
          });
        } catch (error) {
          this.logger.warn('Failed to parse .prj file', error);
        }
      }

      // Parse with read (no streaming needed for small files)
      this.logger.info('Reading shapefile data...');
      const result = await read(mainFile, companionFiles['.dbf']);
      const geojson = result as unknown as FeatureCollection<Geometry, GeoJsonProperties>;

      this.logger.info('Shapefile parsed', {
        featureCount: geojson.features.length
      });

      // Transform coordinates if projection is defined
      if (this.projDef) {
        this.logger.info('Transforming coordinates to WGS84...');
        geojson.features = geojson.features.map(feature => ({
          ...feature,
          geometry: transformGeometry(feature.geometry, this.projDef!, this.logger)
        }));
        this.logger.info('Coordinate transformation complete');
      }

      // Process GeoJSON into FullDataset
      const features: GeoFeature[] = geojson.features.map((feature: Feature<Geometry, GeoJsonProperties>, index: number) => ({
        id: index,
        geometry: feature.geometry,
        properties: feature.properties || {},
        originalIndex: index
      }));

      // Calculate metadata
      let bounds: [number, number, number, number] | undefined;
      const geometryTypes = new Set<string>();
      const properties = features[0] ? Object.keys(features[0].properties) : [];

      for (const feature of features) {
        if (feature.geometry) {
          const coords = getCoordinates(feature.geometry);
          bounds = updateBounds(bounds, coords);
          geometryTypes.add(feature.geometry.type);
        }
      }

      const dataset: FullDataset = {
        sourceFile: 'shapefile',
        fileType: 'shp',
        features,
        metadata: {
          featureCount: features.length,
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
        // Add more common projections as needed
      };

      // Try to match against known patterns
      for (const [epsg, pattern] of Object.entries(wktPatterns)) {
        if (pattern.test(prjContent)) {
          return parseInt(epsg);
        }
      }

      // If no match found, try to parse with proj4
      const def = proj4.defs(prjContent);
      if (def && typeof def === 'string') {
        // Extract EPSG code if available
        const epsgMatch = /EPSG:(\d+)/i.exec(def);
        if (epsgMatch) {
          return parseInt(epsgMatch[1]);
        }
      }

      return undefined;
    } catch (error) {
      this.logger.warn('Failed to parse PRJ file:', error);
      return undefined;
    }
  }
} 