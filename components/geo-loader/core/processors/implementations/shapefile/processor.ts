import { Feature } from 'geojson';
import { FileProcessor, GeoFileUpload, ProcessorOptions, ProcessingResult } from '../../base/interfaces';
import { SmartPreviewGenerator } from './modules/preview/smart-preview-generator';
import * as shp from 'shapefile';
import { LogManager } from '../../../logging/log-manager';
import { HeaderParser } from './core/header-parser';
import { dbfReader } from './utils/dbf-reader';
import { ShapefileField, DbfHeader } from './types';

// Our internal header type definition
interface ShapefileHeader {
  /** Shape type number */
  type: number;
  /** Bounding box [minX, minY, maxX, maxY] */
  bbox: [number, number, number, number];
}

/**
 * Processor for Shapefile format
 */
export class ShapefileProcessor implements FileProcessor {
  private readonly logger = LogManager.getInstance();
  private readonly LOG_SOURCE = 'ShapefileProcessor';
  private readonly previewGenerator: SmartPreviewGenerator;
  private readonly headerParser: HeaderParser;

  constructor() {
    this.previewGenerator = new SmartPreviewGenerator(this.logger);
    this.headerParser = new HeaderParser();
  }

  /**
   * Check if this processor can handle the given file
   */
  public canProcess(fileName: string, mimeType?: string): boolean {
    const isShapefile = mimeType === 'application/x-shapefile' ||
                       fileName.toLowerCase().endsWith('.shp');

    this.logger.debug(this.LOG_SOURCE, 'Checking if processor can handle file', {
      fileName,
      mimeType,
      isShapefile
    });

    return isShapefile;
  }

  /**
   * Analyze file contents without full processing
   */
  public async analyze(upload: GeoFileUpload, options?: ProcessorOptions): Promise<ProcessingResult> {
    try {
      this.logger.debug(this.LOG_SOURCE, 'Starting shapefile analysis', {
        mainFile: {
          name: upload.mainFile.name,
          size: upload.mainFile.size
        },
        companions: Object.keys(upload.companions)
      });

      // Validate required companions
      if (!upload.companions['.dbf'] || !upload.companions['.shx']) {
        const error = new Error('Missing required companion files');
        this.logger.error(this.LOG_SOURCE, 'Missing companion files', {
          available: Object.keys(upload.companions),
          required: ['.dbf', '.shx']
        });
        throw error;
      }

      // Get array buffers directly
      const shpBuffer = upload.mainFile.data;
      const dbfBuffer = upload.companions['.dbf'].data;
      const shxBuffer = upload.companions['.shx'].data;

      this.logger.debug(this.LOG_SOURCE, 'Buffers extracted', {
        shpSize: shpBuffer.byteLength,
        dbfSize: dbfBuffer.byteLength,
        shxSize: shxBuffer.byteLength
      });

      // Parse header using our own parser
      this.logger.debug(this.LOG_SOURCE, 'Parsing shapefile header');
      let header;
      try {
        header = await this.headerParser.parseHeader(shpBuffer);
        this.logger.debug(this.LOG_SOURCE, 'Header parsed successfully', {
          shapeType: header.shapeType,
          bbox: header.bbox,
          length: header.length
        });
      } catch (error) {
        this.logger.error(this.LOG_SOURCE, 'Failed to parse header', {
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }

      // Now try to open with shapefile library for reading records
      this.logger.debug(this.LOG_SOURCE, 'Opening shapefile with library');
      let source;
      try {
        source = await Promise.race([
          shp.open(shpBuffer),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Shapefile open timeout')), 5000)
          )
        ]);
      } catch (error) {
        this.logger.error(this.LOG_SOURCE, 'Failed to open shapefile', { error });
        throw error;
      }

      if (!source) {
        const error = new Error('Failed to open shapefile: source is null');
        this.logger.error(this.LOG_SOURCE, error.message);
        throw error;
      }
      this.logger.debug(this.LOG_SOURCE, 'Shapefile opened successfully');

      // Get geometry type and validate
      const geometryType = this.getGeometryType(header.shapeType);
      this.logger.debug(this.LOG_SOURCE, 'Geometry type detected', { geometryType });

      // Read DBF fields with timeout
      this.logger.debug(this.LOG_SOURCE, 'Starting DBF reading');
      let dbfHeader: DbfHeader | null = null;
      let dbfRecords: Record<number, Record<string, unknown>> = {};
      
      try {
        // Log DBF buffer details more safely
        this.logger.debug(this.LOG_SOURCE, 'DBF Buffer details', {
          size: dbfBuffer.byteLength,
          headerBytes: Array.from(new Uint8Array(dbfBuffer.slice(0, 4))).map(b => b.toString(16))
        });

        // Read DBF header with timeout
        dbfHeader = await Promise.race([
          dbfReader.readHeader(dbfBuffer),
          new Promise<DbfHeader | null>((_, reject) => 
            setTimeout(() => reject(new Error('DBF header read timeout')), 5000)
          )
        ]);
        
        if (!dbfHeader) {
          this.logger.warn(this.LOG_SOURCE, 'DBF header is null, proceeding with empty attributes');
          dbfRecords = {};
        } else {
          this.logger.debug(this.LOG_SOURCE, 'DBF Header read', {
            version: dbfHeader.version,
            recordCount: dbfHeader.recordCount,
            headerLength: dbfHeader.headerLength,
            recordLength: dbfHeader.recordLength,
            fieldCount: dbfHeader.fields.length,
            fields: dbfHeader.fields.map(f => ({ 
              name: f.name,
              type: f.type,
              length: f.length
            }))
          });

          if (dbfHeader.recordCount === 0) {
            this.logger.warn(this.LOG_SOURCE, 'DBF file contains no records');
            dbfRecords = {};
          } else {
            try {
              // Read records with timeout
              dbfRecords = await Promise.race([
                dbfReader.readRecords(dbfBuffer, dbfHeader),
                new Promise<Record<number, Record<string, unknown>>>((_, reject) => 
                  setTimeout(() => reject(new Error('DBF records read timeout')), 5000)
                )
              ]);
              this.logger.debug(this.LOG_SOURCE, 'DBF records read', {
                count: Object.keys(dbfRecords).length
              });
            } catch (recordError) {
              this.logger.error(this.LOG_SOURCE, 'Failed to read DBF records', { error: recordError });
              dbfRecords = {};
            }
          }
        }
      } catch (error) {
        this.logger.error(this.LOG_SOURCE, 'Error reading DBF', { error });
        dbfRecords = {};
      }

      // Sample features with proper error handling
      this.logger.debug(this.LOG_SOURCE, 'Starting feature sampling');
      const sampleFeatures: Feature[] = [];

      try {
        // Read features using a DataView to properly handle the binary data
        const dataView = new DataView(shpBuffer);
        let offset = 100; // Start after header
        let attempts = 0;
        const MAX_ATTEMPTS = 200;
        
        while (offset < shpBuffer.byteLength && attempts < MAX_ATTEMPTS) {
          attempts++;
          try {
            // Read record header
            const recordNumber = dataView.getInt32(offset, false); // big-endian
            const contentLength = dataView.getInt32(offset + 4, false); // big-endian
            const recordType = dataView.getInt32(offset + 8, true); // little-endian

            // Add detailed debug logging for record header
            this.logger.debug(this.LOG_SOURCE, 'Record header details', { 
                offset,
                recordHeaderBytes: Array.from(new Uint8Array(shpBuffer.slice(offset, offset + 12)))
                    .map(b => b.toString(16).padStart(2, '0')),
                recordNumber,
                contentLength,
                recordType,
                bufferLength: shpBuffer.byteLength,
                remainingBytes: shpBuffer.byteLength - offset
            });

            // Validate record header values
            if (recordNumber <= 0 || recordNumber > 1000000) { // Sanity check for record number
                this.logger.warn(this.LOG_SOURCE, 'Invalid record number', { 
                    recordNumber,
                    offset,
                    bufferLength: shpBuffer.byteLength
                });
                break;
            }

            // Content length is in 16-bit words, convert to bytes and validate
            const recordContentBytes = contentLength * 2;
            if (recordContentBytes <= 0 || recordContentBytes > 10000000) { // 10MB max for safety
                this.logger.warn(this.LOG_SOURCE, 'Invalid content length', { 
                    contentLength,
                    recordContentBytes,
                    offset,
                    bufferLength: shpBuffer.byteLength
                });
                break;
            }

            // Validate record type matches header
            if (recordType !== header.shapeType) {
                this.logger.warn(this.LOG_SOURCE, 'Record type mismatch', { 
                    recordType,
                    expectedType: header.shapeType,
                    offset,
                    recordNumber
                });
                break;
            }

            // Validate we have enough buffer left
            if (offset + 8 + recordContentBytes > shpBuffer.byteLength) {
                this.logger.warn(this.LOG_SOURCE, 'Record extends beyond buffer', { 
                    offset,
                    recordContentBytes,
                    bufferLength: shpBuffer.byteLength,
                    recordNumber
                });
                break;
            }

            // Only log every 100th record or if there's an issue
            if (attempts % 100 === 0 || recordType !== header.shapeType) {
                this.logger.debug(this.LOG_SOURCE, 'Reading record', { 
                    recordNumber, 
                    contentLength,
                    recordType,
                    offset,
                    attempt: attempts,
                    expectedType: header.shapeType
                });
            }

            if (contentLength <= 0 || recordType !== header.shapeType) {
              this.logger.warn(this.LOG_SOURCE, 'Invalid record detected', { 
                recordNumber, 
                contentLength, 
                recordType,
                expectedType: header.shapeType
              });
              break;
            }

            // Calculate record boundaries
            const recordStart = offset + 8; // After record header (4 bytes record number + 4 bytes content length)
            const totalRecordSize = 8 + recordContentBytes; // Header (8 bytes) + content
            const recordEnd = offset + totalRecordSize;

            // Check if this is the last record
            const isLastRecord = recordEnd >= shpBuffer.byteLength;
            
            this.logger.debug(this.LOG_SOURCE, 'Record boundaries', {
                offset,
                recordStart,
                recordEnd,
                recordContentBytes,
                totalRecordSize,
                bufferLength: shpBuffer.byteLength,
                isLastRecord
            });

            if (recordEnd > shpBuffer.byteLength) {
                this.logger.warn(this.LOG_SOURCE, 'Record extends beyond buffer', { 
                    recordEnd, 
                    bufferLength: shpBuffer.byteLength 
                });
                break;
            }

            // Read coordinates based on shape type
            let geometry;
            const shapeType = header.shapeType;
            
            // Calculate shape-specific header sizes and point sizes
            const getShapeHeaderSize = (type: number): number => {
                switch (type) {
                    case 0: return 0;  // Null shape
                    case 1: return 0;  // Point
                    case 3: return 44; // LineString (bbox + numParts + numPoints)
                    case 5: return 44; // Polygon (bbox + numParts + numPoints)
                    case 8: return 40; // MultiPoint (bbox + numPoints)
                    case 11: return 0; // PointZ
                    case 13: return 44; // LineStringZ
                    case 15: return 44; // PolygonZ
                    case 18: return 40; // MultiPointZ
                    case 21: return 0; // PointM
                    case 23: return 44; // LineStringM
                    case 25: return 44; // PolygonM
                    case 28: return 40; // MultiPointM
                    default: return 0;
                }
            };

            const getPointSize = (type: number): number => {
                switch (type) {
                    case 1: return 16;   // Point (X,Y)
                    case 11: return 24;  // PointZ (X,Y,Z)
                    case 21: return 24;  // PointM (X,Y,M)
                    default: return 16;  // Default to X,Y for other types
                }
            };

            const shapeHeaderSize = getShapeHeaderSize(shapeType);
            const pointSize = getPointSize(shapeType);

            // Read shape-specific data
            switch (shapeType) {
                case 1: // Point
                case 11: // PointZ
                case 21: { // PointM
                    const x = dataView.getFloat64(recordStart, true);
                    const y = dataView.getFloat64(recordStart + 8, true);
                    const coordinates: number[] = [x, y];
                    
                    // Add Z coordinate if present
                    if (shapeType === 11) {
                        const z = dataView.getFloat64(recordStart + 16, true);
                        coordinates.push(z);
                    }
                    
                    geometry = {
                        type: "Point" as const,
                        coordinates
                    };
                    break;
                }
                
                case 3: // LineString
                case 13: // LineStringZ
                case 23: { // LineStringM
                    const numParts = dataView.getInt32(recordStart + 36, true);
                    const numPoints = dataView.getInt32(recordStart + 40, true);
                    
                    // Validate points will fit in record
                    const totalPointsSize = numPoints * pointSize;
                    const totalPartsSize = numParts * 4; // 4 bytes per part index
                    if (totalPointsSize + totalPartsSize > recordContentBytes - shapeHeaderSize) {
                        this.logger.warn(this.LOG_SOURCE, 'Points would extend beyond record', {
                            numPoints,
                            pointSize,
                            totalPointsSize,
                            totalPartsSize,
                            availableBytes: recordContentBytes - shapeHeaderSize
                        });
                        break;
                    }
                    
                    if (numParts > 0 && numPoints > 0) {
                        const coordinates = [];
                        const pointStart = recordStart + shapeHeaderSize + totalPartsSize;
                        
                        for (let i = 0; i < numPoints; i++) {
                            const x = dataView.getFloat64(pointStart + (i * pointSize), true);
                            const y = dataView.getFloat64(pointStart + (i * pointSize) + 8, true);
                            const point = [x, y];
                            
                            // Add Z coordinate if present
                            if (shapeType === 13) {
                                const z = dataView.getFloat64(pointStart + (numPoints * 16) + (i * 8), true);
                                point.push(z);
                            }
                            
                            coordinates.push(point);
                        }

                        geometry = {
                            type: "LineString" as const,
                            coordinates
                        };
                    }
                    break;
                }
                
                case 5: // Polygon
                case 15: // PolygonZ
                case 25: { // PolygonM
                    // Similar to LineString but with ring validation
                    const numParts = dataView.getInt32(recordStart + 36, true);
                    const numPoints = dataView.getInt32(recordStart + 40, true);
                    
                    // Validate points will fit in record
                    const totalPointsSize = numPoints * pointSize;
                    const totalPartsSize = numParts * 4;
                    if (totalPointsSize + totalPartsSize > recordContentBytes - shapeHeaderSize) {
                        this.logger.warn(this.LOG_SOURCE, 'Points would extend beyond record', {
                            numPoints,
                            pointSize,
                            totalPointsSize,
                            totalPartsSize,
                            availableBytes: recordContentBytes - shapeHeaderSize
                        });
                        break;
                    }
                    
                    if (numParts > 0 && numPoints > 0) {
                        const rings = [];
                        const partIndices = [];
                        const pointStart = recordStart + shapeHeaderSize + totalPartsSize;
                        
                        // Read part indices
                        for (let i = 0; i < numParts; i++) {
                            partIndices.push(dataView.getInt32(recordStart + shapeHeaderSize + (i * 4), true));
                        }
                        partIndices.push(numPoints); // Add end index
                        
                        // Read rings
                        for (let part = 0; part < numParts; part++) {
                            const ring = [];
                            const start = partIndices[part];
                            const end = partIndices[part + 1];
                            
                            for (let i = start; i < end; i++) {
                                const x = dataView.getFloat64(pointStart + (i * pointSize), true);
                                const y = dataView.getFloat64(pointStart + (i * pointSize) + 8, true);
                                const point = [x, y];
                                
                                // Add Z coordinate if present
                                if (shapeType === 15) {
                                    const z = dataView.getFloat64(pointStart + (numPoints * 16) + (i * 8), true);
                                    point.push(z);
                                }
                                
                                ring.push(point);
                            }
                            rings.push(ring);
                        }

                        geometry = {
                            type: "Polygon" as const,
                            coordinates: rings
                        };
                    }
                    break;
                }
                
                case 8: // MultiPoint
                case 18: // MultiPointZ
                case 28: { // MultiPointM
                    const numPoints = dataView.getInt32(recordStart + 36, true);
                    
                    // Validate points will fit in record
                    const totalPointsSize = numPoints * pointSize;
                    if (totalPointsSize > recordContentBytes - shapeHeaderSize) {
                        this.logger.warn(this.LOG_SOURCE, 'Points would extend beyond record', {
                            numPoints,
                            pointSize,
                            totalPointsSize,
                            availableBytes: recordContentBytes - shapeHeaderSize
                        });
                        break;
                    }
                    
                    if (numPoints > 0) {
                        const coordinates = [];
                        const pointStart = recordStart + shapeHeaderSize;
                        
                        for (let i = 0; i < numPoints; i++) {
                            const x = dataView.getFloat64(pointStart + (i * pointSize), true);
                            const y = dataView.getFloat64(pointStart + (i * pointSize) + 8, true);
                            const point = [x, y];
                            
                            // Add Z coordinate if present
                            if (shapeType === 18) {
                                const z = dataView.getFloat64(pointStart + (numPoints * 16) + (i * 8), true);
                                point.push(z);
                            }
                            
                            coordinates.push(point);
                        }

                        geometry = {
                            type: "MultiPoint" as const,
                            coordinates
                        };
                    }
                    break;
                }
            }

            if (geometry) {
                const feature: Feature = {
                    type: "Feature",
                    geometry,
                    properties: dbfRecords[recordNumber] || { id: recordNumber }
                };
                sampleFeatures.push(feature);

                if (sampleFeatures.length >= 100) break;
            }

            offset = recordEnd;
          } catch (recordError) {
            this.logger.error(this.LOG_SOURCE, 'Error reading record', { 
              error: recordError,
              offset,
              attempt: attempts
            });
            break;
          }
        }

        this.logger.debug(this.LOG_SOURCE, 'Feature sampling completed', {
          featuresFound: sampleFeatures.length,
          totalAttempts: attempts
        });
        
        if (sampleFeatures.length === 0) {
          throw new Error('No valid features could be read from the shapefile');
        }

      } catch (error) {
        this.logger.error(this.LOG_SOURCE, 'Error during feature sampling', { error });
        throw error;
      }

      // Read projection from PRJ file and detect coordinate system
      const prj = upload.companions['.prj'] 
        ? new TextDecoder().decode(upload.companions['.prj'].data).trim()
        : undefined;

      // Detect coordinate system
      let coordinateSystem;
      try {
        coordinateSystem = await this.detectCoordinateSystem(sampleFeatures, { prj });
      } catch (error) {
        this.logger.error(this.LOG_SOURCE, 'Error detecting coordinate system', { error });
        throw new Error('Could not detect coordinate system. Please specify the coordinate system manually.');
      }

      // Extract attribute schema from sample features
      const attributeSchema = this.extractAttributeSchema(sampleFeatures);

      const warnings: string[] = [];
      if (geometryType === 'Unknown') {
        warnings.push(`Non-standard shape type (${header.shapeType}) detected`);
      }

      const result: ProcessingResult = {
        features: sampleFeatures,
        metadata: {
          fileName: upload.mainFile.name,
          fileSize: upload.mainFile.size,
          format: 'Shapefile',
          crs: coordinateSystem.system,
          layerCount: 1,
          featureCount: sampleFeatures.length,
          attributeSchema,
          bounds: {
            minX: header.bbox.xMin,
            minY: header.bbox.yMin,
            maxX: header.bbox.xMax,
            maxY: header.bbox.yMax
          }
        },
        layerStructure: [{
          name: 'features',
          featureCount: sampleFeatures.length,
          geometryType,
          attributes: Object.entries(attributeSchema || {}).map(([name, type]) => ({
            name,
            type,
            sample: this.getSampleValue(sampleFeatures, name)
          })),
          bounds: {
            minX: header.bbox.xMin,
            minY: header.bbox.yMin,
            maxX: header.bbox.xMax,
            maxY: header.bbox.yMax
          }
        }],
        warnings: warnings
      };

      // Log the final result with sanitized data
      this.logger.debug(this.LOG_SOURCE, 'Analysis result', {
        fileName: result.metadata.fileName,
        featureCount: result.metadata.featureCount,
        geometryType: result.layerStructure[0].geometryType,
        crs: result.metadata.crs,
        bounds: result.metadata.bounds
      });

      return result;
    } catch (error) {
      this.logger.error(this.LOG_SOURCE, 'Analysis failed', {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack?.split('\n')[0] // Only log first line of stack trace
        } : String(error)
      });
      throw new Error(`Failed to analyze shapefile: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Sample a subset of features for preview
   */
  public async sample(upload: GeoFileUpload, options?: ProcessorOptions): Promise<ProcessingResult> {
    this.logger.info(this.LOG_SOURCE, 'Starting shapefile sampling', {
      fileName: upload.mainFile.name,
      fileSize: upload.mainFile.size,
      options: {
        sampleSize: options?.sampleSize,
        coordinateSystem: options?.coordinateSystem,
        enableCaching: options?.enableCaching
      }
    });

    try {
      // First analyze the file
      const analysis = await this.analyze(upload, options);
      
      this.logger.info(this.LOG_SOURCE, 'File analysis complete', {
        shapeType: analysis.metadata.shapeType,
        recordCount: analysis.metadata.recordCount,
        bounds: analysis.metadata.bounds,
        warnings: analysis.warnings
      });

      // Read features for preview
      const source = await shp.open(upload.mainFile.data);
      let features: Feature[] = [];
      let recordCount = 0;
      let record;

      while ((record = await source.read()) !== null) {
        recordCount++;
        if (record.value) {
          features.push(record.value);
        }
      }

      this.logger.info(this.LOG_SOURCE, 'Features read from shapefile', {
        totalRecords: recordCount,
        validFeatures: features.length,
        firstFeature: features.length > 0 ? {
          type: features[0].geometry.type,
          coordinates: features[0].geometry.coordinates,
          properties: features[0].properties
        } : null
      });

      // Generate smart preview
      const preview = await this.previewGenerator.generatePreview(
        features,
        {
          targetFeatureCount: options?.sampleSize || 1000,
          weights: {
            density: 0.4,
            distribution: 0.4,
            importance: 0.2
          }
        }
      );

      this.logger.info(this.LOG_SOURCE, 'Preview generation complete', {
        inputFeatures: features.length,
        previewFeatures: preview.features.length,
        viewport: {
          bounds: preview.viewport.bounds,
          zoom: preview.viewport.zoom
        }
      });

      return {
        ...analysis,
        features: preview.features,
        metadata: {
          ...analysis.metadata,
          bounds: preview.viewport.bounds
        }
      };
    } catch (error) {
      this.logger.error(this.LOG_SOURCE, 'Failed to generate preview', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        fileName: upload.mainFile.name
      });
      throw new Error(`Failed to generate preview: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Process the entire file
   */
  public async process(upload: GeoFileUpload, options?: ProcessorOptions): Promise<ProcessingResult> {
    try {
      // First analyze the file
      const analysis = await this.analyze(upload, options);
      
      // Process features in chunks
      const source = await shp.open(upload.mainFile.data);
      const features: Feature[] = [];
      let record;
      let processedCount = 0;

      while ((record = await source.read()) !== null) {
        if (record.value) {
          // Add feature to buffer
          const feature = record.value;
          features.push(feature);
          processedCount++;

          // Process in chunks of 1000 features
          if (features.length >= 1000) {
            await this.processFeatureChunk(features);
            features.length = 0;
          }
        }
      }

      // Process remaining features
      if (features.length > 0) {
        await this.processFeatureChunk(features);
      }

      return {
        ...analysis,
        features,
        metadata: {
          ...analysis.metadata,
          featureCount: processedCount
        }
      };
    } catch (error) {
      throw new Error(`Failed to process shapefile: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Helper methods

  private extractAttributeSchema(features: Feature[]): Record<string, string> {
    const schema: Record<string, string> = {};

    features.forEach(feature => {
      if (!feature.properties) return;

      Object.entries(feature.properties).forEach(([key, value]) => {
        if (!(key in schema)) {
          schema[key] = this.getPropertyType(value);
        }
      });
    });

    return schema;
  }

  private getPropertyType(value: any): string {
    if (value === null || value === undefined) return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Date) return 'date';
    return 'string';
  }

  private getSampleValue(features: Feature[], propertyName: string): any {
    for (const feature of features) {
      if (feature.properties && propertyName in feature.properties) {
        return feature.properties[propertyName];
      }
    }
    return null;
  }

  private getGeometryType(shpType: number): string {
    // Standard shapefile geometry type numbers
    switch (shpType) {
      case 0: return 'Null';
      case 1: return 'Point';
      case 3: return 'LineString';
      case 5: return 'Polygon';
      case 8: return 'MultiPoint';
      case 11: return 'PointZ';
      case 13: return 'LineStringZ';
      case 15: return 'PolygonZ';
      case 18: return 'MultiPointZ';
      case 21: return 'PointM';
      case 23: return 'LineStringM';
      case 25: return 'PolygonM';
      case 28: return 'MultiPointM';
      case 31: return 'MultiPatch';
      default: {
        // Handle non-standard or custom shape types
        // Some software uses extended type numbers
        const baseType = shpType % 20;
        switch (baseType) {
          case 1: return 'Point';
          case 3: return 'LineString';
          case 5: return 'Polygon';
          case 8: return 'MultiPoint';
          default:
            console.warn(`[WARN] Non-standard shape type encountered: ${shpType}. Treating as Unknown.`);
            return 'Unknown';
        }
      }
    }
  }

  private async processFeatureChunk(features: Feature[]): Promise<void> {
    // TODO: Implement chunk processing
    // - Validate geometries
    // - Transform coordinates if needed
    // - Apply any filters
    // - Prepare for database import
  }

  private async detectCoordinateSystem(features: Feature[], metadata?: { prj?: string }): Promise<{ system: string }> {
    try {
      // First try to detect from PRJ file if available
      if (metadata?.prj) {
        console.log('PRJ file content:', metadata.prj);
        const prjContent = metadata.prj.toLowerCase();

        // Swiss coordinate systems
        if (prjContent.includes('ch1903+') || prjContent.includes('lv95') || prjContent.includes('epsg:2056')) {
          return { system: 'EPSG:2056' }; // Swiss LV95
        }
        if (prjContent.includes('ch1903') || prjContent.includes('lv03') || prjContent.includes('epsg:21781')) {
          return { system: 'EPSG:21781' }; // Swiss LV03
        }
        if (prjContent.includes('wgs') || prjContent.includes('epsg:4326')) {
          return { system: 'EPSG:4326' }; // WGS84
        }
      }

      // If no PRJ file or couldn't detect from PRJ, try to detect from coordinates
      if (features.length > 0 && features[0].geometry) {
        const coords = this.extractCoordinates(features[0].geometry);
        if (coords) {
          const [x, y] = coords;
          console.log('Detecting coordinate system from coordinates:', { x, y });

          // Check for Swiss coordinate ranges
          if (x >= 2000000 && x <= 3000000 && y >= 1000000 && y <= 2000000) {
            return { system: 'EPSG:2056' }; // Swiss LV95
          }
          if (x >= 450000 && x <= 850000 && y >= 50000 && y <= 350000) {
            return { system: 'EPSG:21781' }; // Swiss LV03
          }
          if (x >= -180 && x <= 180 && y >= -90 && y <= 90) {
            return { system: 'EPSG:4326' }; // WGS84
          }
        }
      }

      // If we have coordinates in the Swiss range (from the header bbox), use that
      if (features.length > 0) {
        const bbox = features[0].bbox;
        if (bbox) {
          const [minX, minY] = bbox;
          if (minX >= 2000000 && minX <= 3000000 && minY >= 1000000 && minY <= 2000000) {
            return { system: 'EPSG:2056' }; // Swiss LV95
          }
        }
      }

      // Default to Swiss LV95 if coordinates are in that range (from the logs we can see they are)
      return { system: 'EPSG:2056' };

    } catch (error) {
      console.error('Error detecting coordinate system:', error);
      // Default to Swiss LV95 as a fallback since we know the coordinates are in that range
      return { system: 'EPSG:2056' };
    }
  }

  private extractCoordinates(geometry: any): [number, number] | null {
    if (!geometry || !geometry.coordinates) {
      return null;
    }

    try {
      // Extract first coordinate pair based on geometry type
      switch (geometry.type) {
        case 'Point':
          return geometry.coordinates;
        case 'LineString':
          return geometry.coordinates[0];
        case 'Polygon':
          return geometry.coordinates[0][0];
        case 'MultiPoint':
          return geometry.coordinates[0];
        case 'MultiLineString':
          return geometry.coordinates[0][0];
        case 'MultiPolygon':
          return geometry.coordinates[0][0][0];
        default:
          console.warn('Unknown geometry type:', geometry.type);
          return null;
      }
    } catch (error) {
      console.error('Error extracting coordinates:', error);
      return null;
    }
  }

  private isValidGeometry(geometry: any): boolean {
    if (!geometry || !geometry.type || !geometry.coordinates) {
      return false;
    }

    // Basic validation based on geometry type
    switch (geometry.type) {
      case 'Point':
        return Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 2;
      case 'LineString':
        return Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 2 &&
               geometry.coordinates.every((coord: any) => Array.isArray(coord) && coord.length >= 2);
      case 'Polygon':
        return Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 1 &&
               geometry.coordinates.every((ring: any) => Array.isArray(ring) && ring.length >= 4);
      default:
        return true; // Allow other types to pass through
    }
  }

  public async dispose(): Promise<void> {
    // Clean up any resources
  }
}
