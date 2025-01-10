import { Feature } from 'geojson';
import { 
  ShapefileParseOptions,
  ShapefileAnalyzeResult,
  ShapefileProcessorOptions
} from './types';
import { FileHandler } from './core/file-handler';
import { HeaderParser } from './core/header-parser';
import { RecordParser } from './core/record-parser';
import { GeometryConverter } from './core/geometry-converter';
import { ShapefileValidator } from './core/validator';
import { AnalysisManager } from './core/analysis-manager';
import { StreamManager } from './core/stream-manager';

/**
 * Handles Shapefile parsing with streaming support
 */
export class ShapefileParser {
  private fileHandler: FileHandler;
  private headerParser: HeaderParser;
  private recordParser: RecordParser;
  private geometryConverter: GeometryConverter;
  private validator: ShapefileValidator;
  private analysisManager: AnalysisManager;
  private streamManager: StreamManager;

  constructor(options: ShapefileProcessorOptions = {}) {
    // Initialize core components
    this.fileHandler = new FileHandler(options);
    this.headerParser = new HeaderParser();
    this.recordParser = new RecordParser();
    this.geometryConverter = new GeometryConverter();
    this.validator = new ShapefileValidator();

    // Initialize managers
    this.analysisManager = new AnalysisManager(
      this.fileHandler,
      this.headerParser,
      this.recordParser,
      this.validator
    );
    this.streamManager = new StreamManager(
      this.fileHandler,
      this.headerParser,
      this.recordParser,
      this.geometryConverter
    );
  }

  /**
   * Analyze shapefile structure including all component files
   */
  async analyzeStructure(
    file: File,
    options: {
      previewRecords?: number;
      parseDbf?: boolean;
    } = {}
  ): Promise<ShapefileAnalyzeResult> {
    return this.analysisManager.analyzeStructure(file, options);
  }

  /**
   * Parse shapefile records into features
   */
  async parseFeatures(
    file: File,
    options: ShapefileParseOptions = {}
  ): Promise<Feature[]> {
    return this.streamManager.parseFeatures(file, options);
  }

  /**
   * Stream features from file
   */
  async *streamFeatures(
    file: File,
    options: ShapefileParseOptions = {}
  ): AsyncGenerator<Feature, void, undefined> {
    yield* this.streamManager.streamFeaturesFromFile(file, options);
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
    await this.streamManager.processBatches(file, batchSize, callback, options);
  }
}
