import { Feature, Point } from 'geojson';
import { StreamProcessor, ProcessingContext, StreamProcessorOptions } from '../core/stream-processor';
import { FeatureManager } from '../core/feature-manager';
import { geoErrorManager } from '../core/error-manager';
import { ErrorSeverity } from '../../../types/errors';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../types/coordinates';
import { AnalyzeResult } from '../processors/base-processor';

interface ColumnMapping {
  x: number;
  y: number;
  z?: number;
  [key: string]: number | undefined;
}

interface ParsedRow {
  [key: string]: unknown;
}

export class StreamingCsvProcessor extends StreamProcessor {
  private readonly COORDINATE_HEADERS = {
    x: ['x', 'longitude', 'lon', 'east', 'easting', 'rechtswert', 'e'],
    y: ['y', 'latitude', 'lat', 'north', 'northing', 'hochwert', 'n'],
    z: ['z', 'height', 'elevation', 'alt', 'altitude', 'h']
  };

  private headers: string[] = [];
  private delimiter: string = ',';
  private columnMapping: ColumnMapping | null = null;
  private featureManager: FeatureManager;
  private decoder: TextDecoder;
  private partialLine: string = '';

  constructor(options: StreamProcessorOptions = {}) {
    super(options);
    this.featureManager = new FeatureManager({
      chunkSize: 1000,
      maxMemoryMB: options.maxMemoryMB,
      monitorMemory: options.monitorMemory
    });
    this.decoder = new TextDecoder('utf-8');
  }

  async canProcess(file: File): Promise<boolean> {
    const extension = file.name.toLowerCase().split('.').pop();
    return ['csv', 'xyz', 'txt'].includes(extension || '');
  }

  protected createReadStream(file: File): ReadableStream<Buffer> {
    return file.stream() as ReadableStream<Buffer>;
  }

  private detectDelimiter(line: string): string {
    const delimiters = [',', ';', '\t', ' '];
    const counts = delimiters.map(d => ({
      delimiter: d,
      count: line.split(d).length
    }));
    
    const bestDelimiter = counts.reduce((a, b) => 
      a.count > b.count ? a : b
    );

    if (bestDelimiter.count <= 1) {
      geoErrorManager.addError(
        'csv_processor',
        'DELIMITER_DETECTION_FAILED',
        'Could not detect delimiter, using comma as default',
        ErrorSeverity.WARNING,
        { line, counts }
      );
      return ',';
    }

    return bestDelimiter.delimiter;
  }

  private detectColumnMapping(headers: string[]): ColumnMapping {
    const mapping: ColumnMapping = { x: 0, y: 1 };
    const normalizedHeaders = headers.map(h => h.toLowerCase().trim());

    // First try exact matches
    normalizedHeaders.forEach((header, index) => {
      if (this.COORDINATE_HEADERS.x.includes(header)) mapping.x = index;
      if (this.COORDINATE_HEADERS.y.includes(header)) mapping.y = index;
      if (this.COORDINATE_HEADERS.z.includes(header)) mapping.z = index;
    });

    // Then try partial matches
    if (mapping.x === 0 && mapping.y === 1) {
      normalizedHeaders.forEach((header, index) => {
        if (this.COORDINATE_HEADERS.x.some(h => header.includes(h))) mapping.x = index;
        if (this.COORDINATE_HEADERS.y.some(h => header.includes(h))) mapping.y = index;
        if (this.COORDINATE_HEADERS.z.some(h => header.includes(h))) mapping.z = index;
      });
    }

    if (mapping.x === mapping.y) {
      geoErrorManager.addError(
        'csv_processor',
        'INVALID_COLUMN_MAPPING',
        'Could not detect distinct X and Y columns',
        ErrorSeverity.ERROR,
        { headers: normalizedHeaders, mapping }
      );
      throw new Error('Could not detect distinct X and Y columns');
    }

    return mapping;
  }

  private parseRow(line: string): ParsedRow {
    const values = line.split(this.delimiter).map(v => v.trim());
    const row: ParsedRow = {};
    
    this.headers.forEach((header, index) => {
      const value = values[index];
      if (value !== undefined) {
        // Try to convert to number if possible
        const num = Number(value);
        row[header] = isNaN(num) ? value : num;
      }
    });

    return row;
  }

  private createPointFeature(row: ParsedRow): Feature<Point> | null {
    if (!this.columnMapping) return null;

    const x = Number(row[this.headers[this.columnMapping.x]]);
    const y = Number(row[this.headers[this.columnMapping.y]]);
    const z = this.columnMapping.z !== undefined ? 
      Number(row[this.headers[this.columnMapping.z]]) : undefined;

    if (!isFinite(x) || !isFinite(y)) {
      geoErrorManager.addError(
        'csv_processor',
        'INVALID_COORDINATES',
        'Invalid coordinate values',
        ErrorSeverity.WARNING,
        { row, x, y }
      );
      return null;
    }

    const properties: Record<string, unknown> = {};
    this.headers.forEach((header, index) => {
      if (index !== this.columnMapping!.x && 
          index !== this.columnMapping!.y && 
          index !== this.columnMapping!.z) {
        properties[header] = row[header];
      }
    });

    if (z !== undefined && isFinite(z)) {
      properties.elevation = z;
    }

    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: z !== undefined && isFinite(z) ? [x, y, z] : [x, y]
      },
      properties
    };
  }

  protected async processChunk(chunk: Buffer, context: ProcessingContext): Promise<Feature[]> {
    const text = this.decoder.decode(chunk, { stream: true });
    const lines = (this.partialLine + text).split('\n');
    this.partialLine = lines.pop() || '';

    const features: Feature[] = [];

    // Process header if not done yet
    if (!this.headers.length && lines.length > 0) {
      const headerLine = lines.shift()!;
      this.delimiter = this.detectDelimiter(headerLine);
      this.headers = headerLine.split(this.delimiter).map(h => h.trim());
      this.columnMapping = this.detectColumnMapping(this.headers);
    }

    // Process data lines
    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const row = this.parseRow(line);
        const feature = this.createPointFeature(row);
        if (feature) {
          features.push(feature);
        }
      } catch (error) {
        geoErrorManager.addError(
          'csv_processor',
          'ROW_PROCESSING_ERROR',
          `Failed to process row: ${error instanceof Error ? error.message : String(error)}`,
          ErrorSeverity.WARNING,
          { line, error: error instanceof Error ? error.message : String(error) }
        );
      }
    }

    return features;
  }

  public async analyze(file: File): Promise<AnalyzeResult> {
    const MAX_PREVIEW_POINTS = 1000;
    const previewFeatures: Feature[] = [];
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    try {
      // Process first chunk to detect structure
      const reader = this.createReadStream(file).getReader();
      const { value: firstChunk } = await reader.read();
      
      if (!firstChunk) {
        throw new Error('File is empty');
      }

      // Process initial chunk
      const features = await this.processChunk(firstChunk, this.context);
      
      // Add features to preview and update bounds
      for (const feature of features) {
        if (previewFeatures.length >= MAX_PREVIEW_POINTS) break;
        
        previewFeatures.push(feature);
        
        if (feature.geometry.type === 'Point') {
          const [x, y] = feature.geometry.coordinates;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }

      // Try to detect coordinate system based on value ranges
      let detectedSystem = this.detectCoordinateSystem(minX, minY, maxX, maxY);

      return {
        layers: ['points'],
        coordinateSystem: detectedSystem || this.options.coordinateSystem || COORDINATE_SYSTEMS.WGS84,
        bounds: isFinite(minX) ? { minX, minY, maxX, maxY } : undefined,
        preview: {
          type: 'FeatureCollection',
          features: previewFeatures
        }
      };

    } catch (error) {
      geoErrorManager.addError(
        'csv_processor',
        'ANALYSIS_ERROR',
        `Failed to analyze file: ${error instanceof Error ? error.message : String(error)}`,
        ErrorSeverity.ERROR,
        { 
          file: file.name,
          error: error instanceof Error ? error.message : String(error)
        }
      );
      throw error;
    }
  }

  private detectCoordinateSystem(minX: number, minY: number, maxX: number, maxY: number): CoordinateSystem | undefined {
    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return undefined;
    }

    // Check for WGS84 ranges
    if (minX >= -180 && maxX <= 180 && minY >= -90 && maxY <= 90) {
      return COORDINATE_SYSTEMS.WGS84;
    }

    // Check for Swiss LV95 ranges
    if (minX >= 2485000 && maxX <= 2835000 && minY >= 1075000 && maxY <= 1295000) {
      return COORDINATE_SYSTEMS.SWISS_LV95;
    }

    // Check for Swiss LV03 ranges
    if (minX >= 485000 && maxX <= 835000 && minY >= 75000 && maxY <= 295000) {
      return COORDINATE_SYSTEMS.SWISS_LV03;
    }

    return undefined;
  }
}
