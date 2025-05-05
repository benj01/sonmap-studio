import { BaseGeoDataParser, ParserOptions, ParserProgressEvent, InvalidFileFormatError } from './base-parser';
import { FullDataset, GeoFeature } from '@/types/geo-import';
import type { Feature, FeatureCollection, Geometry, GeoJsonProperties, Position } from 'geojson';
import { dbLogger } from '@/utils/logging/dbLogger';
import * as turf from '@turf/turf';
import proj4 from 'proj4';
import { XMLParser } from 'fast-xml-parser';
import { getCoordinateSystem } from '@/lib/coordinate-systems';
import { COORDINATE_SYSTEMS } from '@/core/coordinates/coordinates';

const SOURCE = 'GeoJsonParser';

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
      await dbLogger.warn('No CRS information found in QMD file');
      return null;
    }

    return {
      srid: parseInt(crs.srid, 10),
      proj4String: crs.proj4
    };
  } catch (error) {
    await dbLogger.warn('Failed to parse QMD file:', error);
    return null;
  }
}

/**
 * Transform coordinates using the provided proj4 string
 */
async function transformCoordinates(coords: Position, fromSrid: number): Promise<Position> {
  try {
    const fromSystem = await getCoordinateSystem(fromSrid);
    if (!proj4.defs(`EPSG:${fromSrid}`)) {
      proj4.defs(`EPSG:${fromSrid}`, fromSystem.proj4);
    }
    const result = proj4(`EPSG:${fromSrid}`, COORDINATE_SYSTEMS.WGS84, coords);
    await dbLogger.debug(SOURCE, 'Coordinate transformation', {
      fromSrid,
      toSrid: 4326,
      input: coords,
      output: result
    });
    if (result[0] < 5 || result[0] > 11 || result[1] < 45 || result[1] > 48) {
      await dbLogger.warn(SOURCE, 'Transformed coordinates out of Swiss bounds', { result });
    }
    return result;
  } catch (error) {
    await dbLogger.warn(SOURCE, 'Failed to transform coordinates', { error, coords, fromSrid });
    return coords;
  }
}

/**
 * Transform a GeoJSON geometry using the provided SRID
 */
async function transformGeometry(geometry: Geometry, fromSrid: number): Promise<Geometry> {
  await dbLogger.debug(SOURCE, 'Transforming geometry', { geometryType: geometry.type, fromSrid });
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

export class GeoJsonParser extends BaseGeoDataParser {
  async parse(
    mainFile: ArrayBuffer,
    companionFiles?: Record<string, ArrayBuffer>,
    options?: ParserOptions,
    onProgress?: (event: ParserProgressEvent) => void
  ): Promise<FullDataset> {
    try {
      await dbLogger.info('Starting GeoJSON parse operation', {
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
      } catch {
        throw new InvalidFileFormatError('geojson', 'Invalid GeoJSON format');
      }

      await dbLogger.info('GeoJSON parsed', {
        featureCount: geojson.features.length
      });

      // Check for QMD file and extract CRS information
      let sourceCRS = null;
      if (companionFiles && '.qmd' in companionFiles) {
        const qmdContent = await this.readFileAsText(companionFiles['.qmd']);
        sourceCRS = await extractCRSFromQMD(qmdContent);
        if (sourceCRS) {
          await dbLogger.info('Found CRS information in QMD file', sourceCRS);
        }
      }

      // Determine source SRID
      let sourceSRID = sourceCRS?.srid;
      if (!sourceSRID) {
        // Fallback to CH1903+/LV95 if no CRS information is available
        sourceSRID = 2056; // Swiss LV95
        await dbLogger.info('No CRS information found, assuming CH1903+/LV95 (EPSG:2056)');
      }

      // Process GeoJSON into FullDataset WITHOUT transforming coordinates
      // This matches the behavior of ShapefileParser
      let features: GeoFeature[] = geojson.features.map((feature: Feature<Geometry, GeoJsonProperties>, index: number) => ({
        id: index,
        geometry: feature.geometry,
        properties: feature.properties || {},
        originalIndex: index
      }));

      await dbLogger.info('Skipping coordinate transformation for main features array');

      // After features = geojson.features.map(...)
      if (sourceSRID !== 4326) {
        try {
          await dbLogger.info('Transforming coordinates for all features', {
            fromSrid: sourceSRID,
            toSrid: 4326,
            featureCount: features.length
          });
          features = await Promise.all(features.map(async feature => ({
            ...feature,
            geometry: await transformGeometry(feature.geometry, sourceSRID)
          })));
          await dbLogger.info('Coordinate transformation complete');
        } catch (error) {
          await dbLogger.warn('Transformation failed, using original geometries', { 
            error,
            srid: sourceSRID,
            featureCount: features.length
          });
          // Do not modify features, just log and continue
        }
      }

      // Calculate metadata using all features
      const featureCollection: FeatureCollection = {
        type: 'FeatureCollection',
        features: features.map(f => ({
          type: 'Feature',
          geometry: f.geometry,
          properties: f.properties || {}
        }))
      };
      const bbox = turf.bbox(featureCollection);
      const bounds: [number, number, number, number] = [bbox[0], bbox[1], bbox[2], bbox[3]];
      const geometryTypes = new Set(features.map(f => f.geometry.type));
      const properties = features[0]?.properties ? Object.keys(features[0].properties) : [];
      const dataset: FullDataset = {
        sourceFile: options?.filename || 'unknown.geojson',
        fileType: 'geojson',
        features,
        metadata: {
          featureCount: features.length,
          bounds,
          geometryTypes: Array.from(geometryTypes) as string[],
          properties,
          srid: sourceSRID // Use source SRID
        }
      };

      this.reportProgress(onProgress, {
        phase: 'complete',
        progress: 100,
        message: 'Parsing complete'
      });

      await dbLogger.info('Parse complete', dataset.metadata);
      return dataset;
    } catch (error) {
      await dbLogger.error('Parse failed', error);
      throw new InvalidFileFormatError('geojson',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async validate(
    mainFile: ArrayBuffer,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _companionFiles?: Record<string, ArrayBuffer>
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
      await dbLogger.warn('Validation failed', error);
      return false;
    }
  }

  async getMetadata(
    mainFile: ArrayBuffer,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _companionFiles?: Record<string, ArrayBuffer>
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
        geometryTypes: Array.from(geometryTypes) as string[],
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