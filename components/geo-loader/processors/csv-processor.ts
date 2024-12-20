import { BaseProcessor, ProcessorOptions, AnalyzeResult, ProcessorResult } from './base-processor';
import { COORDINATE_SYSTEMS } from '../types/coordinates';
import { Feature, Point } from 'geojson';
import Papa from 'papaparse';
import _ from 'lodash';
import { ParseError, ValidationError } from '../utils/errors';

/**
 * Mapping of column indices to coordinate axes
 */
interface ColumnMapping {
  /** Index of X coordinate column */
  x: number;
  /** Index of Y coordinate column */
  y: number;
  /** Optional index of Z coordinate column */
  z?: number;
  /** Additional column mappings */
  [key: string]: number | undefined;
}

/**
 * Structure of a parsed CSV row
 */
interface ParsedRow {
  [key: string]: unknown;
}

/**
 * Processor for CSV, XYZ, and TXT files containing point data
 */
export class CsvProcessor extends BaseProcessor {
  private readonly MAX_PREVIEW_POINTS = 1000;
  private readonly COORDINATE_HEADERS = {
    x: ['x', 'longitude', 'lon', 'east', 'easting', 'rechtswert', 'e'],
    y: ['y', 'latitude', 'lat', 'north', 'northing', 'hochwert', 'n'],
    z: ['z', 'height', 'elevation', 'alt', 'altitude', 'h']
  };

  constructor(options: ProcessorOptions = {}) {
    super(options);
  }

  async canProcess(file: File): Promise<boolean> {
    const extension = file.name.toLowerCase().split('.').pop();
    return ['csv', 'xyz', 'txt'].includes(extension || '');
  }

  private async readFileContent(file: File): Promise<string> {
    try {
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
      });
    } catch (error) {
      throw new ParseError(
        `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
        'csv',
        file.name,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private detectDelimiter(firstLine: string): string {
    const delimiters = [',', ';', '\t', ' '];
    const counts = delimiters.map(d => ({
      delimiter: d,
      count: firstLine.split(d).length
    }));
    
    const bestDelimiter = _.maxBy(counts, 'count');
    if (!bestDelimiter) {
      this.errorReporter.addWarning(
        'Could not detect delimiter, using comma as default',
        'CSV_DELIMITER_DETECTION',
        { firstLine }
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

    // Log the detected mapping
    this.errorReporter.addInfo(
      'Detected column mapping',
      'CSV_COLUMN_MAPPING',
      { 
        mapping,
        headers: normalizedHeaders,
        exactMatch: mapping.x !== 0 || mapping.y !== 1
      }
    );

    return mapping;
  }

  private createPointFeature(
    row: ParsedRow, 
    mapping: ColumnMapping, 
    headers: string[]
  ): Feature<Point> | null {
    const x = Number(row[headers[mapping.x]]);
    const y = Number(row[headers[mapping.y]]);
    const z = mapping.z !== undefined ? Number(row[headers[mapping.z]]) : undefined;

    if (!isFinite(x) || !isFinite(y)) {
      this.errorReporter.addWarning(
        'Invalid coordinate values',
        'INVALID_COORDINATES',
        { row, x, y, headers: [headers[mapping.x], headers[mapping.y]] }
      );
      return null;
    }

    const properties: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (index !== mapping.x && index !== mapping.y && index !== mapping.z) {
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

  async analyze(file: File): Promise<AnalyzeResult> {
    try {
      const content = await this.readFileContent(file);
      const lines = content.split('\n');
      const delimiter = this.detectDelimiter(lines[0]);

      const parseResult = await new Promise<Papa.ParseResult<ParsedRow>>((resolve, reject) => {
        Papa.parse(content, {
          delimiter,
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          preview: this.MAX_PREVIEW_POINTS,
          complete: resolve,
          error: reject
        });
      });

      const headers = parseResult.meta.fields || [];
      const mapping = this.detectColumnMapping(headers);

      if (mapping.x === mapping.y) {
        throw new ValidationError(
          'Could not detect distinct X and Y columns',
          'csv_columns',
          undefined,
          { headers, mapping }
        );
      }

      const previewFeatures: Feature[] = [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      parseResult.data.forEach((row, index) => {
        const feature = this.createPointFeature(row, mapping, headers);
        if (feature) {
          previewFeatures.push(feature);
          const [x, y] = feature.geometry.coordinates;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
        this.emitProgress(index / parseResult.data.length);
      });

      if (previewFeatures.length === 0) {
        throw new ValidationError(
          'No valid coordinates found in file',
          'csv_data',
          undefined,
          { rowCount: parseResult.data.length }
        );
      }

      return {
        layers: ['points'],
        coordinateSystem: this.options.coordinateSystem || COORDINATE_SYSTEMS.SWISS_LV95,
        bounds: { minX, minY, maxX, maxY },
        preview: {
          type: 'FeatureCollection',
          features: previewFeatures
        }
      };

    } catch (error) {
      if (error instanceof ValidationError || error instanceof ParseError) {
        throw error;
      }
      throw new ParseError(
        `CSV analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        'csv',
        file.name,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async process(file: File): Promise<ProcessorResult> {
    try {
      const content = await this.readFileContent(file);
      const delimiter = this.detectDelimiter(content.split('\n')[0]);
      const statistics = this.createDefaultStats();

      const parseResult = await new Promise<Papa.ParseResult<ParsedRow>>((resolve, reject) => {
        Papa.parse(content, {
          delimiter,
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: resolve,
          error: reject,
          step: (results, parser) => {
            this.emitProgress(results.meta.cursor / content.length);
          }
        });
      });

      const headers = parseResult.meta.fields || [];
      const mapping = this.detectColumnMapping(headers);

      if (mapping.x === mapping.y) {
        throw new ValidationError(
          'Could not detect distinct X and Y columns',
          'csv_columns',
          undefined,
          { headers, mapping }
        );
      }

      const features: Feature[] = [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      parseResult.data.forEach(row => {
        const feature = this.createPointFeature(row, mapping, headers);
        if (feature) {
          features.push(feature);
          const [x, y] = feature.geometry.coordinates;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          this.updateStats(statistics, 'Point');
        } else {
          this.recordError(
            statistics,
            'invalid_coordinates',
            'CSV_INVALID_COORDINATES',
            'Invalid coordinate values',
            { row, headers: [headers[mapping.x], headers[mapping.y]] }
          );
        }
      });

      if (features.length === 0) {
        throw new ValidationError(
          'No valid coordinates found in file',
          'csv_data',
          undefined,
          { rowCount: parseResult.data.length }
        );
      }

      statistics.layerCount = 1;

      return {
        features: {
          type: 'FeatureCollection',
          features
        },
        bounds: { minX, minY, maxX, maxY },
        layers: ['points'],
        coordinateSystem: this.options.coordinateSystem || COORDINATE_SYSTEMS.SWISS_LV95,
        statistics
      };

    } catch (error) {
      if (error instanceof ValidationError || error instanceof ParseError) {
        throw error;
      }
      throw new ParseError(
        `CSV processing failed: ${error instanceof Error ? error.message : String(error)}`,
        'csv',
        file.name,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }
}
