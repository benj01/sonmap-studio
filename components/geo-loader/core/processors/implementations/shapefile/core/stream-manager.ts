import { Feature } from 'geojson';
import { 
  ShapefileRecord,
  ShapefileParseOptions,
  ShapefileHeader
} from '../types';
import { ValidationError } from '../../../../errors/types';
import { FileHandler } from './file-handler';
import { HeaderParser } from './header-parser';
import { RecordParser } from './record-parser';
import { GeometryConverter } from './geometry-converter';

/**
 * Manages shapefile record streaming and feature conversion
 */
export class StreamManager {
  private fileHandler: FileHandler;
  private headerParser: HeaderParser;
  private recordParser: RecordParser;
  private geometryConverter: GeometryConverter;

  constructor(
    fileHandler: FileHandler,
    headerParser: HeaderParser,
    recordParser: RecordParser,
    geometryConverter: GeometryConverter
  ) {
    this.fileHandler = fileHandler;
    this.headerParser = headerParser;
    this.recordParser = recordParser;
    this.geometryConverter = geometryConverter;
  }

  /**
   * Parse shapefile records into features
   */
  async parseFeatures(
    file: File,
    options: ShapefileParseOptions = {}
  ): Promise<Feature[]> {
    try {
      // Read and parse header
      const buffer = await this.fileHandler.readFileBuffer(file);
      const header = await this.headerParser.parseHeader(buffer);
      
      // Parse records into features
      const features: Feature[] = [];
      for await (const record of this.streamRecords(buffer, header, options)) {
        features.push(this.geometryConverter.recordToFeature({
          ...record,
          attributes: record.attributes || { recordNumber: record.header.recordNumber }
        }));
      }
      
      return features;
    } catch (error) {
      throw new ValidationError(
        `Failed to parse shapefile: ${error instanceof Error ? error.message : String(error)}`,
        'SHAPEFILE_PARSE_ERROR',
        undefined,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Stream records from buffer
   */
  async *streamRecords(
    buffer: ArrayBuffer,
    header: ShapefileHeader,
    options: ShapefileParseOptions = {}
  ): AsyncGenerator<ShapefileRecord, void, undefined> {
    try {
      // Stream records through record parser
      for await (const record of this.recordParser.parseRecords(buffer, header.fileLength, options)) {
        yield record;
      }
    } catch (error) {
      throw new ValidationError(
        `Error streaming records: ${error instanceof Error ? error.message : String(error)}`,
        'SHAPEFILE_PARSE_ERROR'
      );
    }
  }

  /**
   * Stream features from buffer
   */
  async *streamFeatures(
    buffer: ArrayBuffer,
    header: ShapefileHeader,
    options: ShapefileParseOptions = {}
  ): AsyncGenerator<Feature, void, undefined> {
    try {
      // Stream records and convert to features
      for await (const record of this.streamRecords(buffer, header, options)) {
        yield this.geometryConverter.recordToFeature({
          ...record,
          attributes: record.attributes || { recordNumber: record.header.recordNumber }
        });
      }
    } catch (error) {
      throw new ValidationError(
        `Error streaming features: ${error instanceof Error ? error.message : String(error)}`,
        'SHAPEFILE_PARSE_ERROR'
      );
    }
  }

  /**
   * Stream features from file
   */
  async *streamFeaturesFromFile(
    file: File,
    options: ShapefileParseOptions = {}
  ): AsyncGenerator<Feature, void, undefined> {
    try {
      // Read and parse header
      const buffer = await this.fileHandler.readFileBuffer(file);
      const header = await this.headerParser.parseHeader(buffer);
      
      // Stream features
      yield* this.streamFeatures(buffer, header, options);
    } catch (error) {
      throw new ValidationError(
        `Error streaming features from file: ${error instanceof Error ? error.message : String(error)}`,
        'SHAPEFILE_PARSE_ERROR',
        undefined,
        { fileName: file.name }
      );
    }
  }

  /**
   * Process features in batches
   */
  async processBatches(
    file: File,
    batchSize: number,
    callback: (features: Feature[]) => Promise<void>,
    options: ShapefileParseOptions = {}
  ): Promise<void> {
    let batch: Feature[] = [];
    
    try {
      for await (const feature of this.streamFeaturesFromFile(file, options)) {
        batch.push(feature);
        
        if (batch.length >= batchSize) {
          await callback(batch);
          batch = [];
        }
      }
      
      // Process remaining features
      if (batch.length > 0) {
        await callback(batch);
      }
    } catch (error) {
      throw new ValidationError(
        `Error processing batches: ${error instanceof Error ? error.message : String(error)}`,
        'SHAPEFILE_PARSE_ERROR',
        undefined,
        { fileName: file.name }
      );
    }
  }
}
