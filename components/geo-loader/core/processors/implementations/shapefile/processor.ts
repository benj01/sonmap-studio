import { BaseGeoProcessor } from '../../base/processor';
import { GeoFileUpload, ProcessingOptions, ProcessingResult, ProcessingError, ProcessingErrorType } from '../../base/types';
import { StreamHandler } from '../../../io/stream-handler';
import { Feature } from 'geojson';
import * as shp from 'shapefile';
import { coordinateSystemManager } from '../../../coordinate-systems';
import { COORDINATE_SYSTEMS } from '../../../../types/coordinates';
import { DetectionResult } from '../../../coordinate-systems/detector';

/**
 * Processor for Shapefile format
 */
export class ShapefileProcessor extends BaseGeoProcessor {
  private readonly LOG_SOURCE = 'ShapefileProcessor';

  /**
   * Check if this processor can handle the given file upload
   */
  public canProcess(upload: GeoFileUpload): boolean {
    const isShapefile = upload.mainFile.type === 'application/x-shapefile';
    const hasRequiredCompanions = ['.dbf', '.shx'].every(ext => ext in upload.companions);

    this.logger.debug(this.LOG_SOURCE, 'Checking if processor can handle file', {
      fileName: upload.mainFile.name,
      type: upload.mainFile.type,
      companions: Object.keys(upload.companions),
      isShapefile,
      hasRequiredCompanions
    });

    return isShapefile && hasRequiredCompanions;
  }

  /**
   * Analyze file contents without full processing
   */
  public async analyze(upload: GeoFileUpload, options?: ProcessingOptions): Promise<ProcessingResult> {
    try {
      const context = this.initContext(upload, options);
      
      this.logger.debug(this.LOG_SOURCE, 'Analyzing shapefile', {
        fileName: upload.mainFile.name,
        size: upload.mainFile.size,
        companions: Object.keys(upload.companions)
      });

      // Read shapefile header
      const source = await shp.open(upload.mainFile.data);
      const header = await source.header as unknown as {
        bbox: [number, number, number, number];
        type: number;
        records: number;
      };

      // Read DBF fields
      const dbfFields = await this.readDBFFields(upload.companions['.dbf'].data);

      // Read projection from PRJ file
      const projection = upload.companions['.prj'] 
        ? await this.readProjection(upload.companions['.prj'].data)
        : undefined;

      // Detect coordinate system
      const detectionResult = await coordinateSystemManager.detect([], { prj: projection });

      const bounds = {
        minX: header.bbox[0],
        minY: header.bbox[1],
        maxX: header.bbox[2],
        maxY: header.bbox[3]
      };

      return {
        features: [],
        metadata: {
          fileName: upload.mainFile.name,
          fileSize: upload.mainFile.size,
          format: 'Shapefile',
          crs: detectionResult.system,
          layerCount: 1,
          featureCount: header.records,
          attributeSchema: this.createAttributeSchema(dbfFields),
          bounds
        },
        layerStructure: [{
          name: 'features',
          featureCount: header.records,
          geometryType: this.getShapeType(header.type),
          attributes: dbfFields.map(field => ({
            name: field.name,
            type: field.type,
            sample: null
          })),
          bounds
        }],
        warnings: []
      };
    } catch (error) {
      throw new ProcessingError(
        'Failed to analyze shapefile',
        ProcessingErrorType.PARSING_ERROR,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Sample a subset of features for preview
   */
  public async sample(upload: GeoFileUpload, options?: ProcessingOptions): Promise<ProcessingResult> {
    const context = this.initContext(upload, options);
    const sampleSize = options?.sampleSize || 1000;
    
    this.logger.debug(this.LOG_SOURCE, 'Sampling shapefile', {
      fileName: upload.mainFile.name,
      sampleSize
    });

    const features: Feature[] = [];
    const source = await shp.open(upload.mainFile.data);
    const total = (await source.header as any).records;
    const step = Math.max(1, Math.floor(total / sampleSize));

    let count = 0;
    let record: { value: Feature | null } | null;

    while ((record = await source.read() as any) !== null && features.length < sampleSize) {
      if (count % step === 0 && record.value) {
        features.push(record.value);
        context.progress({
          phase: 'sampling',
          processed: features.length,
          total: sampleSize,
          currentFile: upload.mainFile.name
        });
      }
      count++;
    }

    const metadata = await this.analyze(upload, options);
    const detectionResult = await coordinateSystemManager.detect(features, { 
      prj: upload.companions['.prj'] ? await this.readProjection(upload.companions['.prj'].data) : undefined 
    });

    return {
      ...metadata,
      features,
      metadata: {
        ...metadata.metadata,
        crs: detectionResult.system
      }
    };
  }

  /**
   * Process the entire file
   */
  public async process(upload: GeoFileUpload, options?: ProcessingOptions): Promise<ProcessingResult> {
    const context = this.initContext(upload, options);
    
    this.logger.debug(this.LOG_SOURCE, 'Processing shapefile', {
      fileName: upload.mainFile.name,
      options
    });

    try {
      const features: Feature[] = [];
      const source = await shp.open(upload.mainFile.data);
      const total = (await source.header as any).records;
      let processed = 0;

      let record: { value: Feature | null } | null;
      while ((record = await source.read() as any) !== null) {
        if (record.value) {
          features.push(record.value);
          processed++;
          
          context.progress({
            phase: 'processing',
            processed,
            total,
            currentFile: upload.mainFile.name
          });
        }
      }

      const metadata = await this.analyze(upload, options);
      const detectionResult = await coordinateSystemManager.detect(features, { 
        prj: upload.companions['.prj'] ? await this.readProjection(upload.companions['.prj'].data) : undefined 
      });

      return {
        ...metadata,
        features,
        metadata: {
          ...metadata.metadata,
          crs: detectionResult.system
        }
      };
    } catch (error) {
      throw new ProcessingError(
        'Failed to process shapefile',
        ProcessingErrorType.PARSING_ERROR,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Read fields from DBF file
   */
  private async readDBFFields(data: ArrayBuffer): Promise<Array<{
    name: string;
    type: string;
    length: number;
    decimals?: number;
  }>> {
    try {
      const dbf = await shp.open(data) as any;
      return dbf.fields;
    } catch (error) {
      throw new ProcessingError(
        'Failed to read DBF fields',
        ProcessingErrorType.PARSING_ERROR,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Read projection from PRJ file
   */
  private async readProjection(data: ArrayBuffer): Promise<string | undefined> {
    try {
      const text = new TextDecoder().decode(data);
      return text.trim();
    } catch (error) {
      this.logger.warn(this.LOG_SOURCE, 'Failed to read PRJ file', {
        error: error instanceof Error ? error.message : String(error)
      });
      return undefined;
    }
  }

  /**
   * Create attribute schema from DBF fields
   */
  private createAttributeSchema(fields: Array<{ name: string; type: string }>): Record<string, string> {
    const schema: Record<string, string> = {};
    for (const field of fields) {
      schema[field.name] = field.type;
    }
    return schema;
  }

  /**
   * Convert shapefile type number to string
   */
  private getShapeType(type: number): string {
    const types: Record<number, string> = {
      0: 'Null',
      1: 'Point',
      3: 'Polyline',
      5: 'Polygon',
      8: 'MultiPoint',
      11: 'PointZ',
      13: 'PolylineZ',
      15: 'PolygonZ',
      18: 'MultiPointZ',
      21: 'PointM',
      23: 'PolylineM',
      25: 'PolygonM',
      28: 'MultiPointM',
      31: 'MultiPatch'
    };
    return types[type] || 'Unknown';
  }
}
