import { BaseGeoDataParser, ParserOptions, ParserProgressEvent, InvalidFileFormatError } from './base-parser';
import { FullDataset, GeoFeature } from '@/types/geo-import';
import { read } from 'shapefile';
import type { Feature, FeatureCollection, Geometry, GeoJsonProperties, Position } from 'geojson';
import proj4 from 'proj4';
import { createLogger } from '@/utils/logger';
import { getCoordinateSystem } from '@/lib/coordinate-systems';
import { COORDINATE_SYSTEMS } from '@/core/coordinates/coordinates';
import * as turf from '@turf/turf';
import { detectSRIDFromCoordinates, detectSRIDFromWKT } from '@/core/coordinates/coordinate-detection';

const SOURCE = 'ShapefileParser';
const logger = createLogger(SOURCE);
const DEFAULT_SRID = 2056; // Swiss LV95

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
    logger.warn('Failed to transform coordinates', { error, coords, fromSrid });
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
    logger.warn('Failed to transform geometry', { error, geometryType: geometry.type, srid });
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
        companionFiles: companionFiles ? Object.keys(companionFiles) : [],
        options
      });

      // Validate companion files
      if (!companionFiles || !companionFiles['.dbf']) {
        const error = 'Missing required .dbf file';
        logger.error('Invalid shapefile format', { error });
        throw new InvalidFileFormatError('shapefile', error);
      }

      // First check if SRID is provided in options
      if (options?.srid) {
        this.srid = options.srid;
        logger.info('Using provided coordinate system', { srid: this.srid });
      }
      
      // If no SRID in options, try to detect from .prj file
      if (!this.srid && companionFiles['.prj']) {
        try {
          const prjContent = new TextDecoder().decode(companionFiles['.prj']);
          const detectedSrid = this.parsePrjFile(prjContent);
          if (detectedSrid !== null) {
            this.srid = detectedSrid;
            logger.info('Detected coordinate system from PRJ', {
              srid: this.srid,
              prjContent
            });
          }
        } catch (error) {
          logger.warn('Failed to parse .prj file', { error });
        }
      }

      // Parse shapefile
      logger.info('Reading shapefile data');
      const result = await read(mainFile, companionFiles['.dbf']);
      const geojson = result as unknown as FeatureCollection<Geometry, GeoJsonProperties>;

      logger.info('Shapefile parsed successfully', {
        featureCount: geojson.features.length
      });

      // If still no SRID, try to detect from coordinates
      if (!this.srid && geojson.features.length > 0) {
        const firstFeature = geojson.features[0];
        const coords = getCoordinates(firstFeature.geometry);
        if (coords.length >= 2) {
          const [x, y] = coords;
          const detected = detectSRIDFromCoordinates(x, y);
          if (detected) {
            this.srid = detected.srid;
            logger.info('Detected coordinate system from coordinates', {
              name: detected.name,
              srid: detected.srid,
              coordinates: [x, y]
            });
          } else {
            // If no SRID detected, use default Swiss LV95
            this.srid = DEFAULT_SRID;
            logger.info('Using default coordinate system', {
              srid: DEFAULT_SRID,
              system: 'Swiss LV95'
            });
          }
        }
      }

      // Transform coordinates if SRID is detected and transformation is not explicitly disabled
      let features = geojson.features.map((feature, index) => ({
        id: index,
        geometry: feature.geometry,
        properties: feature.properties || {},
        originalIndex: index
      }));

      if (this.srid !== undefined && this.srid !== 4326) {
        try {
          logger.info('Transforming coordinates for all features', {
            fromSrid: this.srid,
            toSrid: 4326,
            featureCount: features.length
          });
          features = await Promise.all(features.map(async feature => ({
            ...feature,
            geometry: await transformGeometry(feature.geometry, this.srid!)
          })));
          logger.info('Coordinate transformation complete');
        } catch (error) {
          logger.warn('Transformation failed, creating simplified fallback', { 
            error,
            srid: this.srid,
            featureCount: features.length
          });
          features = features.map(f => ({
            ...f,
            geometry: {
              ...f.geometry,
              coordinates: this.createFallbackCoordinates(f.geometry)
            }
          }));
        }
      }

      // Calculate metadata using all features
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
        metadata: {
          featureCount: features.length,
          bounds,
          geometryTypes: Array.from(geometryTypes) as any[],
          properties,
          srid: this.srid
        }
      };

    } catch (error) {
      logger.error('Failed to parse shapefile', { error });
      throw error;
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
      const detected = detectSRIDFromWKT(prjContent);
      if (detected) {
        logger.info(`Detected coordinate system from PRJ content: ${detected.name} (EPSG:${detected.srid})`);
        return detected.srid;
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

  /**
   * Create fallback WGS84 coordinates for preview when transformation fails
   */
  private createFallbackCoordinates(geometry: Geometry): any {
    // Create a simple bounding box in Switzerland (roughly centered)
    const center = [8.2275, 46.8182]; // Center of Switzerland
    const offset = 0.01; // Small offset for visual separation

    switch (geometry.type) {
      case 'Point':
        return [
          center[0] + (Math.random() - 0.5) * offset,
          center[1] + (Math.random() - 0.5) * offset
        ];
      case 'LineString':
        return [
          [center[0] - offset, center[1] - offset],
          [center[0] + offset, center[1] + offset]
        ];
      case 'Polygon':
        return [[
          [center[0] - offset, center[1] - offset],
          [center[0] + offset, center[1] - offset],
          [center[0] + offset, center[1] + offset],
          [center[0] - offset, center[1] + offset],
          [center[0] - offset, center[1] - offset]
        ]];
      case 'MultiPoint':
        return [
          [center[0] - offset, center[1] - offset],
          [center[0] + offset, center[1] + offset]
        ];
      case 'MultiLineString':
        return [[
          [center[0] - offset, center[1] - offset],
          [center[0] + offset, center[1] + offset]
        ]];
      case 'MultiPolygon':
        return [[[
          [center[0] - offset, center[1] - offset],
          [center[0] + offset, center[1] - offset],
          [center[0] + offset, center[1] + offset],
          [center[0] - offset, center[1] + offset],
          [center[0] - offset, center[1] - offset]
        ]]];
      default:
        return [center[0], center[1]];
    }
  }
} 