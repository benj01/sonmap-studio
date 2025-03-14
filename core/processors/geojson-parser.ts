import { BaseGeoDataParser, ParserOptions, ParserProgressEvent, InvalidFileFormatError } from './base-parser';
import { FullDataset, GeoFeature } from '@/types/geo-import';
import type { Feature, FeatureCollection, Geometry, GeoJsonProperties, Position } from 'geojson';
import { createLogger } from '@/utils/logger';
import * as turf from '@turf/turf';
import proj4 from 'proj4';
import { XMLParser } from 'fast-xml-parser';
import { getCoordinateSystem } from '@/lib/coordinate-systems';
import { COORDINATE_SYSTEMS } from '@/core/coordinates/coordinates';

const SOURCE = 'GeoJsonParser';
const logger = createLogger(SOURCE);

/**
 * Extract coordinate system information from QGIS metadata file
 */
async function extractCRSFromQMD(qmdContent: string): Promise<{ srid: number; proj4String: string } | null> {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '_',
    });
    
    const result = parser.parse(qmdContent);
    const crs = result?.qgis?.crs?.spatialrefsys;
    
    if (!crs) {
      logger.warn('No CRS information found in QMD file');
      return null;
    }

    return {
      srid: parseInt(crs.srid, 10),
      proj4String: crs.proj4
    };
  } catch (error) {
    logger.warn('Failed to parse QMD file:', error);
    return null;
  }
}

/**
 * Transform coordinates using the provided proj4 string
 */
async function transformCoordinates(coords: Position, fromSrid: number): Promise<Position> {
  try {
    // Get coordinate system definition
    const fromSystem = await getCoordinateSystem(fromSrid);
    // Define the coordinate system if not already defined
    if (!proj4.defs(`EPSG:${fromSrid}`)) {
      proj4.defs(`EPSG:${fromSrid}`, fromSystem.proj4);
    }
    return proj4(`EPSG:${fromSrid}`, COORDINATE_SYSTEMS.WGS84, coords);
  } catch (error) {
    logger.warn('Failed to transform coordinates:', error);
    return coords;
  }
}

/**
 * Transform a GeoJSON geometry using the provided SRID
 */
async function transformGeometry(geometry: Geometry, fromSrid: number): Promise<Geometry> {
  switch (geometry.type) {
    case 'Point':
      return {
        ...geometry,
        coordinates: await transformCoordinates(geometry.coordinates, fromSrid)
      };
    case 'LineString':
    case 'MultiPoint':
      return {
        ...geometry,
        coordinates: await Promise.all(geometry.coordinates.map(coord => transformCoordinates(coord, fromSrid)))
      };
    case 'Polygon':
    case 'MultiLineString':
      return {
        ...geometry,
        coordinates: await Promise.all(geometry.coordinates.map(async ring => 
          await Promise.all(ring.map(coord => transformCoordinates(coord, fromSrid)))
        ))
      };
    case 'MultiPolygon':
      return {
        ...geometry,
        coordinates: await Promise.all(geometry.coordinates.map(async polygon =>
          await Promise.all(polygon.map(async ring => 
            await Promise.all(ring.map(coord => transformCoordinates(coord, fromSrid)))
          ))
        ))
      };
    case 'GeometryCollection':
      return {
        ...geometry,
        geometries: await Promise.all(geometry.geometries.map(g => transformGeometry(g, fromSrid)))
      };
    default:
      return geometry;
  }
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
 * Updates bounds with new coordinates
 */
function updateBounds(
  bounds: [number, number, number, number] | undefined,
  coordinates: number[]
): [number, number, number, number] {
  if (coordinates.length < 2) return bounds || [0, 0, 0, 0];

  const pairs: [number, number][] = [];
  for (let i = 0; i < coordinates.length; i += 2) {
    pairs.push([coordinates[i], coordinates[i + 1]]);
  }

  if (!bounds) {
    const [first] = pairs;
    bounds = [first[0], first[1], first[0], first[1]];
  }

  for (const [x, y] of pairs) {
    bounds[0] = Math.min(bounds[0], x); // min x
    bounds[1] = Math.min(bounds[1], y); // min y
    bounds[2] = Math.max(bounds[2], x); // max x
    bounds[3] = Math.max(bounds[3], y); // max y
  }

  return bounds;
}

export class GeoJsonParser extends BaseGeoDataParser {
  async parse(
    mainFile: ArrayBuffer,
    companionFiles?: Record<string, ArrayBuffer>,
    options?: ParserOptions,
    onProgress?: (event: ParserProgressEvent) => void
  ): Promise<FullDataset> {
    try {
      logger.info('Starting GeoJSON parse operation', {
        mainFileSize: mainFile.byteLength,
        companionFiles: companionFiles ? Object.keys(companionFiles) : []
      });

      this.reportProgress(onProgress, {
        phase: 'parsing',
        progress: 0,
        message: 'Starting GeoJSON parsing'
      });

      // Parse GeoJSON content
      const content = await this.readFileAsText(mainFile);
      let geojson: FeatureCollection;

      try {
        const parsed = JSON.parse(content);
        
        // Handle different GeoJSON types using Turf.js
        if (parsed.type === 'FeatureCollection') {
          geojson = parsed;
        } else if (parsed.type === 'Feature') {
          geojson = turf.featureCollection([parsed]);
        } else if (['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'].includes(parsed.type)) {
          geojson = turf.featureCollection([turf.feature(parsed)]);
        } else {
          throw new Error(`Invalid GeoJSON type: ${parsed.type}`);
        }
      } catch (error) {
        throw new InvalidFileFormatError('geojson', 'Invalid GeoJSON format');
      }

      logger.info('GeoJSON parsed', {
        featureCount: geojson.features.length
      });

      // Check for QMD file and extract CRS information
      let sourceCRS = null;
      if (companionFiles && '.qmd' in companionFiles) {
        const qmdContent = await this.readFileAsText(companionFiles['.qmd']);
        sourceCRS = await extractCRSFromQMD(qmdContent);
        if (sourceCRS) {
          logger.info('Found CRS information in QMD file', sourceCRS);
        }
      }

      // Determine source SRID
      let sourceSRID = sourceCRS?.srid;
      if (!sourceSRID) {
        // Fallback to CH1903+/LV95 if no CRS information is available
        sourceSRID = 2056; // Swiss LV95
        logger.info('No CRS information found, assuming CH1903+/LV95 (EPSG:2056)');
      }

      // Process GeoJSON into FullDataset WITHOUT transforming coordinates
      // This matches the behavior of ShapefileParser
      const features: GeoFeature[] = geojson.features.map((feature: Feature<Geometry, GeoJsonProperties>, index: number) => ({
        id: index,
        geometry: feature.geometry,
        properties: feature.properties || {},
        originalIndex: index
      }));

      logger.info('Skipping coordinate transformation for main features array');

      // For preview, create a copy and transform a subset of features
      let previewFeatures = features.slice(0, 100);
      if (sourceSRID !== 4326) {
        try {
          logger.info('Transforming coordinates for preview features', {
            fromSrid: sourceSRID,
            toSrid: 4326,
            featureCount: previewFeatures.length
          });
          
          previewFeatures = await Promise.all(previewFeatures.map(async feature => ({
            ...feature,
            geometry: await transformGeometry(feature.geometry, sourceSRID)
          })));
          
          logger.info('Preview coordinate transformation complete');
        } catch (error) {
          logger.warn('Preview transformation failed', { 
            error,
            srid: sourceSRID,
            featureCount: previewFeatures.length
          });
        }
      }

      // Calculate metadata using Turf.js
      const previewFeatureCollection: FeatureCollection = {
        type: 'FeatureCollection',
        features: previewFeatures.map(f => ({
          type: 'Feature' as const,
          geometry: f.geometry,
          properties: f.properties || {}
        }))
      };
      
      const bbox = turf.bbox(previewFeatureCollection);
      const bounds: [number, number, number, number] = [bbox[0], bbox[1], bbox[2], bbox[3]];
      const geometryTypes = new Set(features.map(f => f.geometry.type));
      const properties = features[0]?.properties ? Object.keys(features[0].properties) : [];

      const dataset: FullDataset = {
        sourceFile: options?.filename || 'unknown.geojson',
        fileType: 'geojson',
        features,
        previewFeatures,
        metadata: {
          featureCount: features.length,
          bounds,
          geometryTypes: Array.from(geometryTypes) as any[],
          properties,
          srid: sourceSRID // Use source SRID
        }
      };

      this.reportProgress(onProgress, {
        phase: 'complete',
        progress: 100,
        message: 'Parsing complete'
      });

      logger.info('Parse complete', dataset.metadata);
      return dataset;
    } catch (error) {
      logger.error('Parse failed', error);
      throw new InvalidFileFormatError('geojson',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async validate(
    mainFile: ArrayBuffer,
    companionFiles?: Record<string, ArrayBuffer>
  ): Promise<boolean> {
    try {
      const content = await this.readFileAsText(mainFile);
      const json = JSON.parse(content);
      
      // Use Turf.js for validation
      if (json.type === 'FeatureCollection') {
        return turf.featureCollection(json.features) !== undefined;
      }
      
      if (json.type === 'Feature') {
        return turf.feature(json.geometry) !== undefined;
      }
      
      if (['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'].includes(json.type)) {
        return turf.feature(json) !== undefined;
      }
      
      return false;
    } catch (error) {
      logger.warn('Validation failed', error);
      return false;
    }
  }

  async getMetadata(
    mainFile: ArrayBuffer,
    companionFiles?: Record<string, ArrayBuffer>
  ): Promise<{
    featureCount: number;
    bounds?: [number, number, number, number];
    geometryTypes: string[];
    properties: string[];
    srid?: number;
  }> {
    try {
      const content = await this.readFileAsText(mainFile);
      const json = JSON.parse(content);
      
      let geojson: FeatureCollection;
      if (json.type === 'FeatureCollection') {
        geojson = json;
      } else if (json.type === 'Feature') {
        geojson = turf.featureCollection([json]);
      } else {
        geojson = turf.featureCollection([turf.feature(json)]);
      }

      const bbox = turf.bbox(geojson);
      const bounds: [number, number, number, number] = [bbox[0], bbox[1], bbox[2], bbox[3]];
      const geometryTypes = new Set(geojson.features.map(f => f.geometry.type));
      const properties = geojson.features[0] ? Object.keys(geojson.features[0].properties || {}) : [];

      return {
        featureCount: geojson.features.length,
        bounds,
        geometryTypes: Array.from(geometryTypes),
        properties,
        srid: 4326
      };
    } catch (error) {
      throw new InvalidFileFormatError('geojson',
        error instanceof Error ? error.message : 'Failed to read metadata'
      );
    }
  }
} 