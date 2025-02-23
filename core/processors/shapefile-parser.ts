import { BaseGeoDataParser, ParserOptions, ParserProgressEvent, InvalidFileFormatError } from './base-parser';
import { FullDataset, GeoFeature } from '@/types/geo-import';
import { read } from 'shapefile';
import array from 'array-source';
import type { Feature, FeatureCollection, Geometry, GeoJsonProperties, Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon } from 'geojson';

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
 * Updates bounds based on coordinates
 */
function updateBounds(bounds: [number, number, number, number] | undefined, coords: number[]): [number, number, number, number] | undefined {
  if (coords.length < 2) return bounds;
  
  const coordPairs: [number, number][] = [];
  for (let i = 0; i < coords.length; i += 2) {
    if (i + 1 < coords.length) {
      coordPairs.push([coords[i], coords[i + 1]]);
    }
  }

  if (coordPairs.length === 0) return bounds;

  if (!bounds) {
    const [x, y] = coordPairs[0];
    bounds = [x, y, x, y];
  }

  for (const [x, y] of coordPairs) {
    bounds[0] = Math.min(bounds[0], x);
    bounds[1] = Math.min(bounds[1], y);
    bounds[2] = Math.max(bounds[2], x);
    bounds[3] = Math.max(bounds[3], y);
  }

  return bounds;
}

/**
 * Parser for ESRI Shapefiles
 */
export class ShapefileParser extends BaseGeoDataParser {
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
      // Report start of parsing
      this.reportProgress(onProgress, {
        phase: 'parsing',
        progress: 0,
        message: 'Starting Shapefile parsing'
      });

      // Parse shapefile
      const features: GeoFeature[] = [];
      let featuresProcessed = 0;
      let metadata = {
        featureCount: 0,
        geometryTypes: new Set<string>(),
        properties: [] as string[]
      };

      // Create array sources
      const shpSource = array(mainFile);
      const dbfSource = companionFiles?.['.dbf'] ? array(companionFiles['.dbf']) : undefined;

      // Read features
      const source = await read(shpSource, dbfSource);
      const collection: FeatureCollection = {
        type: 'FeatureCollection',
        features: []
      };

      // Read all features and calculate bounds
      let bounds: [number, number, number, number] | undefined;
      while (true) {
        const result = await source.read();
        if (result.done) break;
        
        const feature = result.value as Feature<Geometry, GeoJsonProperties>;
        collection.features.push(feature);

        // Update bounds if feature has geometry
        if (feature.geometry) {
          const coords = getCoordinates(feature.geometry);
          bounds = updateBounds(bounds, coords);
        }
      }

      // Process features
      for (const feature of collection.features) {
        if (!feature.geometry) continue;

        // Get properties from first feature
        if (featuresProcessed === 0) {
          metadata.properties = Object.keys(feature.properties || {});
        }

        // Track geometry types
        if (feature.geometry?.type) {
          metadata.geometryTypes.add(feature.geometry.type);
        }

        features.push({
          id: featuresProcessed,
          geometry: feature.geometry,
          properties: feature.properties || {},
          originalIndex: featuresProcessed
        });

        featuresProcessed++;

        // Report progress periodically
        if (onProgress && featuresProcessed % 100 === 0) {
          this.reportProgress(onProgress, {
            phase: 'parsing',
            progress: (featuresProcessed / collection.features.length) * 100,
            message: `Parsed ${featuresProcessed} features`,
            featuresProcessed,
            totalFeatures: collection.features.length
          });
        }

        // Check if we've reached the maximum features
        if (options?.maxFeatures && featuresProcessed >= options.maxFeatures) {
          break;
        }
      }

      metadata.featureCount = featuresProcessed;

      // Create the full dataset
      const dataset: FullDataset = {
        sourceFile: 'shapefile',
        fileType: 'shp',
        features,
        metadata: {
          ...metadata,
          geometryTypes: Array.from(metadata.geometryTypes),
          bounds
        }
      };

      return dataset;
    } catch (error) {
      if (error instanceof Error) {
        throw new InvalidFileFormatError('shapefile', error.message);
      }
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
      // Check for required companion files
      if (!companionFiles || !companionFiles['.dbf']) {
        throw new Error('Missing required companion files (.dbf)');
      }

      // Try to create readers
      const shpSource = array(mainFile);
      const dbfSource = array(companionFiles['.dbf']);

      // Create readers
      const source = await read(shpSource, dbfSource);

      // Read the first feature to validate format
      const result = await source.read();
      if (result.done) {
        throw new Error('Shapefile is empty');
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get metadata about the Shapefile
   */
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
      // Create array sources
      const shpSource = array(mainFile);
      const dbfSource = companionFiles?.['.dbf'] ? array(companionFiles['.dbf']) : undefined;

      // Open source
      const source = await read(shpSource, dbfSource);
      const firstFeature = await source.read();

      if (!firstFeature || firstFeature.done) {
        throw new Error('Invalid shapefile format or empty file');
      }

      const feature = firstFeature.value as Feature<Geometry, GeoJsonProperties>;
      const properties = Object.keys(feature.properties || {});
      const geometryType = feature.geometry?.type || 'Unknown';

      // Calculate bounds by reading all features
      let bounds: [number, number, number, number] | undefined;
      if (feature.geometry) {
        const coords = getCoordinates(feature.geometry);
        bounds = updateBounds(bounds, coords);
      }

      // Count remaining features and update bounds
      let featureCount = 1;
      while (true) {
        const result = await source.read();
        if (result.done) break;
        
        featureCount++;
        const feat = result.value as Feature<Geometry, GeoJsonProperties>;
        if (feat.geometry) {
          const coords = getCoordinates(feat.geometry);
          bounds = updateBounds(bounds, coords);
        }
      }

      return {
        featureCount,
        bounds,
        geometryTypes: [geometryType],
        properties,
        srid: undefined  // Shapefile doesn't store SRID in the file
      };
    } catch (error) {
      throw new InvalidFileFormatError('shapefile', 
        error instanceof Error ? error.message : 'Failed to read metadata'
      );
    }
  }
} 