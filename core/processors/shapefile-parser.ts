import { BaseGeoDataParser, ParserOptions, ParserProgressEvent, InvalidFileFormatError } from './base-parser';
import { FullDataset, GeoFeature } from '@/types/geo-import';
import { read } from 'shapefile';
import type { Geometry, GeoJsonProperties, Position, Point, FeatureCollection, Feature } from 'geojson';
import proj4 from 'proj4';
import { dbLogger } from '@/utils/logging/dbLogger';
import { getCoordinateSystem } from '@/lib/coordinate-systems';
import { COORDINATE_SYSTEMS } from '@/core/coordinates/coordinates';
import * as turf from '@turf/turf';
import { detectSRIDFromCoordinates, detectSRIDFromWKT } from '@/core/coordinates/coordinate-detection';
import { isDebugEnabled } from '@/utils/logging/debugFlags';
import { abbreviateCoordinatesForLog } from '@/components/map/utils/logging';

const SOURCE = 'ShapefileParser';
const DEFAULT_SRID = 2056; // Swiss LV95

// Shape Type Definitions (based on shapefile spec)
const SHAPE_TYPES = {
  NULL_SHAPE: 0,
  POINT: 1,
  POLYLINE: 3,
  POLYGON: 5,
  MULTIPOINT: 8,
  POINT_Z: 11,
  POLYLINE_Z: 13,
  POLYGON_Z: 15,
  MULTIPOINT_Z: 18,
  POINT_M: 21,
  POLYLINE_M: 23,
  POLYGON_M: 25,
  MULTIPOINT_M: 28,
  MULTIPATCH: 31
};

// Reverse mapping for logging
const SHAPE_TYPE_NAMES: Record<number, string> = {
  0: 'NULL_SHAPE',
  1: 'POINT',
  3: 'POLYLINE',
  5: 'POLYGON',
  8: 'MULTIPOINT',
  11: 'POINT_Z',
  13: 'POLYLINE_Z',
  15: 'POLYGON_Z',
  18: 'MULTIPOINT_Z',
  21: 'POINT_M',
  23: 'POLYLINE_M',
  25: 'POLYGON_M',
  28: 'MULTIPOINT_M',
  31: 'MULTIPATCH'
};

// Define a proper interface for the shapefile reader result
interface ShapefileReader {
  // Add proper typings based on the actual shape of the data
  type: string;
  features: Array<{
    type: string;
    geometry: Geometry;
    properties: Record<string, unknown>;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

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
    const hasZ = coords.length > 2;
    const z = hasZ ? coords[2] : null;
    const fromSystem = await getCoordinateSystem(fromSrid);
    if (!proj4.defs(`EPSG:${fromSrid}`)) {
      proj4.defs(`EPSG:${fromSrid}`, fromSystem.proj4);
    }
    const result = proj4(`EPSG:${fromSrid}`, COORDINATE_SYSTEMS.WGS84, [coords[0], coords[1]]);
    await dbLogger.debug('Coordinate transformation', {
      fromSrid,
      toSrid: 4326,
      input: abbreviateCoordinatesForLog({ type: 'Point', coordinates: coords }),
      output: abbreviateCoordinatesForLog({ type: 'Point', coordinates: result })
    }, { source: SOURCE });
    // Switzerland bounds check
    if (result[0] < 5 || result[0] > 11 || result[1] < 45 || result[1] > 48) {
      await dbLogger.warn('Transformed coordinates out of Swiss bounds', { result: abbreviateCoordinatesForLog({ type: 'Point', coordinates: result }) }, { source: SOURCE });
    }
    return hasZ && z !== null ? [result[0], result[1], z] : result;
  } catch (error) {
    await dbLogger.warn('Failed to transform coordinates', { error, coords: abbreviateCoordinatesForLog({ type: 'Point', coordinates: coords }), fromSrid }, { source: SOURCE });
    return coords;
  }
}

/**
 * Transform a GeoJSON geometry to WGS84
 */
async function transformGeometry(geometry: Geometry, srid: number): Promise<Geometry> {
  try {
    await dbLogger.debug('Transforming geometry', { geometryType: geometry.type, srid }, { source: SOURCE });
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
    await dbLogger.warn('Failed to transform geometry', { error, geometryType: geometry.type, srid }, { source: SOURCE });
    return geometry;
  }
}

/**
 * Updates bounds with new coordinates
 */
function updateBounds(bounds: [number, number, number, number] | undefined, coords: number[]): [number, number, number, number] {
  if (coords.length < 2) return bounds || [0, 0, 0, 0];
  
  const [minX, minY, maxX, maxY] = bounds || [Infinity, Infinity, -Infinity, -Infinity];
  const newBounds: [number, number, number, number] = [minX, minY, maxX, maxY];
  
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
  private supportedExtension = 'shp';

  /**
   * Parse a Shapefile and its companion files
   */
  async parse(
    mainFile: ArrayBuffer,
    companionFiles?: Record<string, ArrayBuffer>,
    options?: ParserOptions,
    onProgress?: (event: ParserProgressEvent, context?: any) => void,
    context?: any
  ): Promise<FullDataset> {
    const shouldTransform = options?.transformCoordinates !== false;
    // CRITICAL DEBUG LOGS FOR TRANSFORMATION ISSUE - Using logger instead of console.log
    if (isDebugEnabled('ShapefileParserTrace')) {
      await dbLogger.debug('🔍 TRANSFORMATION DEBUG: Received options', { 
        options,
        optionsJSON: JSON.stringify(options, null, 2) 
      }, { source: SOURCE });
      await dbLogger.debug('🚨 TRANSFORMATION DEBUG: shouldTransform calculation', { 
        shouldTransform,
        transformCoordinatesOptionValue: options?.transformCoordinates,
        calculationLogic: "options?.transformCoordinates !== false" 
      }, { source: SOURCE });
      // Create simple stack trace
      const stackTrace = new Error().stack?.split('\n').slice(1, 5).join('\n');
      await dbLogger.debug('📞 TRANSFORMATION DEBUG: Callstack', { stackTrace }, { source: SOURCE });
    }
    // --- END OF CRITICAL DEBUG LOGS ---

    try {
      this.reportProgress(onProgress, {
        phase: 'reading',
        progress: 0,
        message: 'Starting shapefile parsing'
      }, context);
      await Promise.resolve(); // yield
      await dbLogger.info('ShapefileParser: Starting parse', { fileName: options?.filename, fileSize: mainFile.byteLength }, { source: SOURCE });

      // Validate companion files
      if (!companionFiles || !companionFiles['.dbf']) {
        const error = 'Missing required .dbf file';
        await dbLogger.error('ShapefileParser: Invalid shapefile format', { error }, { source: SOURCE });
        throw new InvalidFileFormatError('shapefile', error);
      }

      // First check if SRID is provided in options
      if (options?.srid) {
        this.srid = options.srid;
        await dbLogger.info('Using provided coordinate system', { srid: this.srid }, { source: SOURCE });
      }
      
      // If no SRID in options, try to detect from .prj file
      if (!this.srid && companionFiles['.prj']) {
        try {
          const prjContent = new TextDecoder().decode(companionFiles['.prj']);
          const detectedSrid = this.parsePrjFile(prjContent);
          if (detectedSrid !== null) {
            this.srid = detectedSrid;
            await dbLogger.info('Detected coordinate system from PRJ', { srid: this.srid, prjContent }, { source: SOURCE });
          }
        } catch (error) {
          await dbLogger.warn('Failed to parse .prj file', { error }, { source: SOURCE });
        }
      }

      // Parse shapefile
      await dbLogger.info('Reading shapefile data', { source: SOURCE });
      await dbLogger.debug('ShapefileParser: buffer info', {
        mainFileType: typeof mainFile,
        mainFileConstructor: mainFile?.constructor?.name,
        mainFileIsArrayBuffer: mainFile instanceof ArrayBuffer,
        mainFileIsUint8Array: mainFile instanceof Uint8Array,
        mainFileByteLength: mainFile?.byteLength,
        mainFileFirstBytes: Array.from(new Uint8Array(mainFile, 0, Math.min(10, mainFile.byteLength))),
        dbfType: typeof companionFiles['.dbf'],
        dbfConstructor: companionFiles['.dbf']?.constructor?.name,
        dbfIsArrayBuffer: companionFiles['.dbf'] instanceof ArrayBuffer,
        dbfIsUint8Array: companionFiles['.dbf'] instanceof Uint8Array,
        dbfByteLength: companionFiles['.dbf']?.byteLength,
        dbfFirstBytes: Array.from(new Uint8Array(companionFiles['.dbf'], 0, Math.min(10, companionFiles['.dbf']?.byteLength || 0)))
      }, { source: SOURCE });
      // mainFile and dbfBuffer are always ArrayBuffer
      let mainBuffer = mainFile;
      let dbfBuffer = companionFiles['.dbf'];
      let result: ShapefileReader;
      try {
        result = await read(
          mainBuffer,
          dbfBuffer ? dbfBuffer : undefined
        ) as unknown as ShapefileReader;
      } catch (readError) {
        await dbLogger.error('ShapefileParser: read() failed', {
          errorMessage: readError instanceof Error ? readError.message : String(readError),
          errorStack: readError instanceof Error ? readError.stack : undefined,
          mainFileType: typeof mainFile,
          mainFileIsArrayBuffer: mainFile instanceof ArrayBuffer,
          mainFileByteLength: mainFile?.byteLength,
          dbfType: typeof companionFiles['.dbf'],
          dbfIsArrayBuffer: companionFiles['.dbf'] instanceof ArrayBuffer,
          dbfByteLength: companionFiles['.dbf']?.byteLength
        }, { source: SOURCE });
        throw readError;
      }
      const geojson = {
        type: 'FeatureCollection',
        features: result.features || []
      } as FeatureCollection<Geometry, GeoJsonProperties>;
      this.reportProgress(onProgress, {
        phase: 'parsing',
        progress: 10,
        message: 'Shapefile read, parsing features',
        totalFeatures: geojson.features.length
      }, context);
      await Promise.resolve(); // yield

      await dbLogger.info('ShapefileParser: Finished parse', { fileName: options?.filename, featureCount: geojson.features.length }, { source: SOURCE });
      
      // Check for PointZ shapes and extract Z values if needed
      // Get the shape type (bytes 32-35, little-endian)
      const view = new DataView(mainFile);
      const shapeType = view.getInt32(32, true);
      
      await dbLogger.info('Detected shapefile type from header', {
        shapeType,
        typeDescription: SHAPE_TYPE_NAMES[shapeType] || 'UNKNOWN',
        isPointZ: shapeType === SHAPE_TYPES.POINT_Z,
        headerBytes: Array.from(new Uint8Array(mainFile.slice(0, 40)))
          .map(b => b.toString(16).padStart(2, '0')).join(' ')
      }, { source: SOURCE });
      
      // For PointZ types, we need to ensure Z values are preserved
      if (shapeType === SHAPE_TYPES.POINT_Z) {
        await dbLogger.info('Processing PointZ shapefile type', {
          totalFeatures: geojson.features.length
        }, { source: SOURCE });
        
        try {
          // Skip 100 bytes of the header
          let offset = 100;
          
          for (let i = 0; i < Math.min(geojson.features.length, 1000); i++) {
            try {
              // Skip record header (8 bytes)
              offset += 8;
              
              // Skip shape type (4 bytes)
              offset += 4;
              
              // Read X, Y (8 bytes each)
              const x = view.getFloat64(offset, true);
              const y = view.getFloat64(offset + 8, true);
              
              // Read Z (8 bytes) - this is what's missing from the library parsing
              const z = view.getFloat64(offset + 16, true);
              
              // Only log per-feature Z extraction if debug flag is enabled
              if (isDebugEnabled('ShapefileParser')) {
                await dbLogger.debug('Extracted Z value for feature', { 
                  x, y, z,
                  originalCoords: geojson.features[i].geometry.type === 'Point' ? 
                    (geojson.features[i].geometry as Point).coordinates : 
                    'non-point geometry'
                }, { source: SOURCE });
              }
              
              // Update the feature with Z coordinate
              if (geojson.features[i].geometry.type === 'Point') {
                const pointGeom = geojson.features[i].geometry as Point;
                pointGeom.coordinates = [x, y, z];
              }
              
              // Move to next record
              offset += 24; // 8 for X, 8 for Y, 8 for Z
              
              // Skip M value if present (8 bytes) - depends on shapefile format
              // Some PointZ have M values too
              if (offset + 8 <= mainFile.byteLength) {
                offset += 8;
              }
            } catch (e) {
              await dbLogger.warn('Error reading Z value for feature', { error: e });
            }
          }
        } catch (e) {
          await dbLogger.warn('Error processing Z values from PointZ shapefile', { error: e });
        }
      }

      // CRITICAL DEBUG LOG - Display sample coordinates from first feature
      if (geojson.features.length > 0) {
        const firstFeature = geojson.features[0];
        const coords = getCoordinates(firstFeature.geometry);
        if (isDebugEnabled('ShapefileParser')) {
          await dbLogger.debug('📍 ORIGINAL first feature coordinates sample', {
            coords: abbreviateCoordinatesForLog(firstFeature.geometry),
          }, { source: SOURCE });
        }
      }
      // --- END OF CRITICAL DEBUG LOG ---

      // If still no SRID, try to detect from coordinates
      if (!this.srid && geojson.features.length > 0) {
        const firstFeature = geojson.features[0];
        const coords = getCoordinates(firstFeature.geometry);
        if (coords.length >= 2) {
          const [x, y] = coords;
          const detected = detectSRIDFromCoordinates(x, y);
          if (detected) {
            this.srid = detected.srid;
            await dbLogger.info('Detected coordinate system from coordinates', { name: detected.name, srid: detected.srid, coordinates: [x, y] }, { source: SOURCE });
          } else {
            // If no SRID detected, use default Swiss LV95
            this.srid = DEFAULT_SRID;
            await dbLogger.info('Using default coordinate system', { srid: DEFAULT_SRID, system: 'Swiss LV95' }, { source: SOURCE });
          }
        }
      }

      // Transform coordinates if SRID is detected and transformation is not explicitly disabled
      let features: GeoFeature[] = geojson.features.map((feature: Feature<Geometry, GeoJsonProperties>, index: number) => ({
        id: typeof feature.id === 'number' ? feature.id : index,
        geometry: feature.geometry,
        properties: feature.properties ?? undefined,
        originalIndex: index
      }));

      if (shouldTransform && this.srid !== undefined && this.srid !== 4326) {
        if (isDebugEnabled('ShapefileParserTrace')) {
          await dbLogger.debug('🔄 ENTERING TRANSFORMATION block', {
            shouldTransform,
            srid: this.srid,
            transformCondition: {
              shouldTransform,
              srid: this.srid, 
              isSridNot4326: this.srid !== 4326, 
              allConditionsMet: shouldTransform && this.srid !== undefined && this.srid !== 4326
            }
          });
        }
        // --- END OF CRITICAL DEBUG LOG ---
        try {
          if (this.srid === undefined) throw new Error('SRID is undefined');
          await dbLogger.info('Transforming coordinates for all features', { fromSrid: this.srid, toSrid: 4326, featureCount: features.length }, { source: SOURCE });
          // Chunked async transformation for progress
          const total = features.length;
          const chunkSize = Math.max(1, Math.floor(total / 10));
          for (let i = 0; i < total; i += chunkSize) {
            const chunk = features.slice(i, i + chunkSize);
            const transformed = await Promise.all(chunk.map(async (feature: GeoFeature) => ({
              ...feature,
              geometry: await transformGeometry(feature.geometry, this.srid as number)
            })));
            features.splice(i, transformed.length, ...transformed);
            const progress = 10 + Math.round((i + chunk.length) / total * 80); // 10% to 90%
            this.reportProgress(onProgress, {
              phase: 'processing',
              progress,
              message: `Transforming coordinates (${i + chunk.length}/${total})`,
              featuresProcessed: i + chunk.length,
              totalFeatures: total
            }, context);
            await Promise.resolve(); // yield
          }
          await dbLogger.info('Coordinate transformation complete', undefined, { source: SOURCE });
        } catch (error) {
          await dbLogger.warn('Transformation failed, creating simplified fallback', { error, srid: this.srid, featureCount: features.length }, { source: SOURCE });
          features = features.map(f => ({
            ...f,
            geometry: (() => {
              const fallback = this.createFallbackCoordinates(f.geometry);
              switch (f.geometry.type) {
                case 'Point':
                  return { ...f.geometry, coordinates: fallback as Position };
                case 'LineString':
                case 'MultiPoint':
                  return { ...f.geometry, coordinates: fallback as Position[] };
                case 'Polygon':
                case 'MultiLineString':
                  return { ...f.geometry, coordinates: fallback as Position[][] };
                case 'MultiPolygon':
                  return { ...f.geometry, coordinates: fallback as Position[][][] };
                default:
                  return f.geometry;
              }
            })()
          }));
        }
      } else {
        if (isDebugEnabled('ShapefileParserTrace')) {
          await dbLogger.debug('⛔ SKIPPING TRANSFORMATION block', {
            reasons: {
              shouldTransform,
              srid: this.srid,
              isSridUndefined: this.srid === undefined,
              isSridAlreadyWGS84: this.srid === 4326
            }
          });
        }
        // --- END OF CRITICAL DEBUG LOG ---
      }

      // Calculate metadata using all features
      const featureCollection: FeatureCollection = {
        type: 'FeatureCollection',
        features: features.map((f: GeoFeature) => ({
          type: 'Feature',
          geometry: f.geometry,
          properties: f.properties ? f.properties : {}
        }))
      };
      const bbox = turf.bbox(featureCollection);
      const bounds: [number, number, number, number] = [bbox[0], bbox[1], bbox[2], bbox[3]];
      const geometryTypes = new Set(features.map(f => f.geometry.type));
      const properties = Object.keys(result.features[0].properties || {});

      await dbLogger.debug('ShapefileParser: about to emit 100% complete', {
        featuresLength: features.length,
        srid: this.srid
      });
      this.reportProgress(onProgress, {
        phase: 'complete',
        progress: 100,
        message: 'Parsing complete',
        featuresProcessed: features.length,
        totalFeatures: features.length
      }, context);
      await Promise.resolve(); // yield

      return {
        sourceFile: options?.filename || 'unknown.shp',
        fileType: 'shapefile',
        features,
        metadata: {
          featureCount: features.length,
          bounds,
          geometryTypes: Array.from(geometryTypes) as string[],
          properties,
          srid: this.srid
        }
      };

    } catch (error) {
      await dbLogger.error('ShapefileParser: Error parsing shapefile', { error }, { source: SOURCE });
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

      const result = await read(
        mainFile,
        companionFiles['.dbf']
      ) as unknown as ShapefileReader;
      return result.features.length > 0 && !!result.features[0].geometry;
    } catch (error) {
      await dbLogger.warn('Validation failed', error);
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

      const result = await read(
        mainFile,
        companionFiles['.dbf']
      ) as unknown as ShapefileReader;
      if (!result.features.length) {
        throw new Error('Empty shapefile');
      }

      let bounds: [number, number, number, number] | undefined;
      const geometryTypes = new Set<string>();
      const properties = Object.keys(result.features[0].properties || {});

      for (const feature of result.features) {
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
        featureCount: result.features.length,
        bounds,
        geometryTypes: Array.from(geometryTypes) as string[],
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
        dbLogger.info(`Detected coordinate system from PRJ content: ${detected.name} (EPSG:${detected.srid})`).catch(() => {});
        return detected.srid;
      }
      
      dbLogger.warn('Could not determine coordinate system from PRJ file', { prjContent }).catch(() => {});
      return undefined;
    } catch (error) {
      dbLogger.warn('Failed to parse PRJ file:', error).catch(() => {});
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
      dbLogger.warn('Failed to get first feature coordinates:', error).catch(() => {});
      return undefined;
    }
  }

  /**
   * Create fallback WGS84 coordinates for preview when transformation fails
   */
  private createFallbackCoordinates(geometry: Geometry): Position | Position[] | Position[][] | Position[][][] {
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