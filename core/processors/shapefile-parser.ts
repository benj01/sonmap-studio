import { BaseGeoDataParser, ParserOptions, ParserProgressEvent, InvalidFileFormatError } from './base-parser';
import { FullDataset, GeoFeature } from '@/types/geo-import';
import { read } from 'shapefile';
import array from 'array-source';
import type { Feature, FeatureCollection, Geometry, GeoJsonProperties, Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon } from 'geojson';
import proj4 from 'proj4';

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

      // Validate companion files
      if (!companionFiles || !companionFiles['.dbf']) {
        throw new InvalidFileFormatError('shapefile', 'Missing required .dbf file');
      }

      // Try to read projection from .prj file
      if (companionFiles && companionFiles['.prj']) {
        try {
          const prjContent = new TextDecoder().decode(companionFiles['.prj']);
          this.srid = this.parsePrjFile(prjContent);
          
          this.reportProgress(onProgress, {
            phase: 'parsing',
            progress: 5,
            message: `Detected coordinate system: EPSG:${this.srid}`
          });
        } catch (error) {
          console.warn('Failed to parse .prj file:', error);
        }
      }

      // Parse shapefile
      const features: GeoFeature[] = [];
      let featuresProcessed = 0;
      let metadata = {
        featureCount: 0,
        geometryTypes: new Set<string>(),
        properties: [] as string[],
        srid: this.srid
      };

      // Create array sources
      const shpSource = array(mainFile);
      const dbfSource = array(companionFiles['.dbf']);

      // Read features
      const source = await read(shpSource, dbfSource);
      const collection: FeatureCollection = {
        type: 'FeatureCollection',
        features: []
      };

      // Count total features for progress reporting
      let totalFeatures = 0;
      const countSource = await read(array(mainFile), array(companionFiles['.dbf']));
      while (true) {
        const result = await countSource.read();
        if (result.done) break;
        totalFeatures++;
      }

      this.reportProgress(onProgress, {
        phase: 'parsing',
        progress: 10,
        message: `Found ${totalFeatures} features`
      });

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
        if (onProgress && featuresProcessed % Math.max(1, Math.floor(totalFeatures / 100)) === 0) {
          this.reportProgress(onProgress, {
            phase: 'parsing',
            progress: 10 + (featuresProcessed / totalFeatures * 90),
            message: `Parsed ${featuresProcessed} of ${totalFeatures} features`,
            featuresProcessed,
            totalFeatures
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
          bounds,
          srid: this.srid
        }
      };

      this.reportProgress(onProgress, {
        phase: 'processing',
        progress: 100,
        message: `Successfully parsed ${featuresProcessed} features`,
        featuresProcessed,
        totalFeatures
      });

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

      // Validate feature structure
      const feature = result.value as Feature<Geometry, GeoJsonProperties>;
      if (!feature || !feature.geometry) {
        throw new Error('Invalid feature structure');
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

      // Try to read projection from .prj file
      let srid: number | undefined;
      if (companionFiles && companionFiles['.prj']) {
        try {
          const prjContent = new TextDecoder().decode(companionFiles['.prj']);
          srid = this.parsePrjFile(prjContent);
        } catch (error) {
          console.warn('Failed to parse .prj file:', error);
        }
      }

      return {
        featureCount,
        bounds,
        geometryTypes: [geometryType],
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
      console.warn('Failed to parse PRJ file:', error);
      return undefined;
    }
  }
} 