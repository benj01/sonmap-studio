import { 
  ShapefileAnalyzeResult,
  ShapefileStructure,
  ShapefileRecord,
  ShapefileHeader,
  DbfHeader
} from '../types';
import { ValidationError } from '../../../../errors/types';
import { FileHandler, ComponentFiles } from './file-handler';
import { HeaderParser } from './header-parser';
import { RecordParser } from './record-parser';
import { ShapefileValidator } from './validator';
import { dbfReader } from '../utils/dbf-reader';

/**
 * Manages shapefile structure analysis
 */
export class AnalysisManager {
  private fileHandler: FileHandler;
  private headerParser: HeaderParser;
  private recordParser: RecordParser;
  private validator: ShapefileValidator;

  constructor(
    fileHandler: FileHandler,
    headerParser: HeaderParser,
    recordParser: RecordParser,
    validator: ShapefileValidator
  ) {
    this.fileHandler = fileHandler;
    this.headerParser = headerParser;
    this.recordParser = recordParser;
    this.validator = validator;
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
    console.debug('[DEBUG] Starting shapefile analysis:', {
      fileName: file.name,
      fileSize: file.size,
      options
    });

    try {
      // Find and validate component files
      const components = await this.fileHandler.findComponentFiles(file);

      // Read and parse headers
      const { shapeHeader, dbfHeader } = await this.parseHeaders(file, components, options);

      // Create structure info
      const structure = this.createStructureInfo(shapeHeader, dbfHeader);

      // Get preview records
      const preview = await this.getPreviewRecords(
        file,
        shapeHeader,
        options.previewRecords || 100
      );

      // Check for issues
      const issues = this.validator.validateStructure(structure, components);

      return {
        structure,
        preview,
        issues
      };
    } catch (error) {
      throw new ValidationError(
        `Failed to analyze shapefile: ${error instanceof Error ? error.message : String(error)}`,
        'SHAPEFILE_ANALYSIS_ERROR',
        undefined,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Parse shapefile and DBF headers
   */
  private async parseHeaders(
    file: File,
    components: ComponentFiles,
    options: { parseDbf?: boolean } = {}
  ): Promise<{
    shapeHeader: ShapefileHeader;
    dbfHeader?: DbfHeader;
  }> {
    // Read main shapefile header
    const shpBuffer = await this.fileHandler.readFileBuffer(file);
    const shapeHeader = await this.headerParser.parseHeader(shpBuffer);

    // Read DBF header if available and requested
    let dbfHeader: DbfHeader | undefined;
    if (components.dbf && options.parseDbf) {
      const dbfBuffer = await this.fileHandler.readFileBuffer(components.dbf);
      dbfHeader = await dbfReader.readHeader(dbfBuffer);
    }

    return {
      shapeHeader,
      dbfHeader
    };
  }

  /**
   * Create structure info from headers
   */
  private createStructureInfo(
    shapeHeader: ShapefileHeader,
    dbfHeader?: DbfHeader
  ): ShapefileStructure {
    return {
      shapeHeader,
      dbfHeader,
      fields: dbfHeader?.fields || [],
      shapeType: shapeHeader.shapeType,
      recordCount: dbfHeader?.recordCount || 0
    };
  }

  /**
   * Get preview records
   */
  private async getPreviewRecords(
    file: File,
    header: ShapefileHeader,
    maxRecords: number
  ): Promise<ShapefileRecord[]> {
    const buffer = await this.fileHandler.readFileBuffer(file);
    const preview: ShapefileRecord[] = [];

    for await (const record of this.recordParser.parseRecords(buffer, header.fileLength, {
      maxRecords
    })) {
      preview.push(record);
    }

    return preview;
  }
}
