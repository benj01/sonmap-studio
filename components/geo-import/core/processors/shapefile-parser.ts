import { BaseGeoDataParser, ParserOptions, ParserProgressEvent, InvalidFileFormatError } from './base-parser';
import { FullDataset, GeoFeature } from '@/types/geo-import';
import * as shp from 'shapefile';

/**
 * Parser for ESRI Shapefiles
 */
export class ShapefileParser extends BaseGeoDataParser {
  private shpReader?: shp.ShapefileReader;
  private dbfReader?: shp.DBFReader;

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
      // Validate companion files
      this.validateCompanionFiles(
        ['.shx', '.dbf'],
        companionFiles
      );

      // Initialize readers
      this.shpReader = await this.createShapefileReader(mainFile, companionFiles?.['.shx']);
      this.dbfReader = companionFiles?.['.dbf'] 
        ? await this.createDBFReader(companionFiles['.dbf'])
        : undefined;

      // Get metadata first
      const metadata = await this.getMetadata(mainFile, companionFiles);
      
      // Report start of parsing
      this.reportProgress(onProgress, {
        phase: 'parsing',
        progress: 0,
        message: 'Starting Shapefile parsing',
        totalFeatures: metadata.featureCount
      });

      const features: GeoFeature[] = [];
      let featuresProcessed = 0;

      // Read features
      while (true) {
        const result = await this.shpReader.read();
        if (result.done) break;

        const geometry = result.value.geometry;
        const properties = this.dbfReader 
          ? (await this.dbfReader.read()).value 
          : {};

        features.push({
          id: featuresProcessed,
          geometry,
          properties,
          originalIndex: featuresProcessed
        });

        featuresProcessed++;

        // Report progress
        if (onProgress && featuresProcessed % 100 === 0) {
          this.reportProgress(onProgress, {
            phase: 'parsing',
            progress: (featuresProcessed / metadata.featureCount) * 100,
            message: 'Parsing features',
            featuresProcessed,
            totalFeatures: metadata.featureCount
          });
        }

        // Check if we've reached the maximum features
        if (options?.maxFeatures && featuresProcessed >= options.maxFeatures) {
          break;
        }
      }

      // Create the full dataset
      const dataset: FullDataset = {
        sourceFile: 'shapefile',
        fileType: 'shp',
        features,
        metadata
      };

      return dataset;
    } catch (error) {
      if (error instanceof Error) {
        throw new InvalidFileFormatError('shapefile', error.message);
      }
      throw error;
    } finally {
      this.dispose();
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
      this.validateCompanionFiles(
        ['.shx', '.dbf'],
        companionFiles
      );

      // Try to create readers
      const shpReader = await this.createShapefileReader(mainFile, companionFiles?.['.shx']);
      const dbfReader = companionFiles?.['.dbf']
        ? await this.createDBFReader(companionFiles['.dbf'])
        : undefined;

      // Read the first feature to validate format
      const result = await shpReader.read();
      if (result.done) {
        throw new Error('Shapefile is empty');
      }

      // If we have a DBF, validate it matches
      if (dbfReader) {
        const dbfResult = await dbfReader.read();
        if (dbfResult.done) {
          throw new Error('DBF file is empty');
        }
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
      // Create temporary readers
      const shpReader = await this.createShapefileReader(mainFile, companionFiles?.['.shx']);
      const dbfReader = companionFiles?.['.dbf']
        ? await this.createDBFReader(companionFiles['.dbf'])
        : undefined;

      // Get header information
      const header = await shpReader.header;
      
      // Read first feature to determine geometry type
      const firstFeature = await shpReader.read();
      const geometryType = firstFeature.value?.geometry?.type || 'Unknown';

      // Get property names from DBF
      let properties: string[] = [];
      if (dbfReader) {
        const dbfHeader = await dbfReader.header;
        properties = dbfHeader.fields.map(f => f.name);
      }

      return {
        featureCount: header.length,
        bounds: [
          header.bbox[0],
          header.bbox[1],
          header.bbox[2],
          header.bbox[3]
        ],
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

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.shpReader) {
      this.shpReader.close();
      this.shpReader = undefined;
    }
    if (this.dbfReader) {
      this.dbfReader.close();
      this.dbfReader = undefined;
    }
  }

  /**
   * Create a Shapefile reader
   */
  private async createShapefileReader(
    shpData: ArrayBuffer,
    shxData?: ArrayBuffer
  ): Promise<shp.ShapefileReader> {
    return new shp.ShapefileReader(
      shpData,
      shxData,
      { encoding: 'utf-8' }
    );
  }

  /**
   * Create a DBF reader
   */
  private async createDBFReader(
    dbfData: ArrayBuffer
  ): Promise<shp.DBFReader> {
    return new shp.DBFReader(
      dbfData,
      { encoding: 'utf-8' }
    );
  }
} 