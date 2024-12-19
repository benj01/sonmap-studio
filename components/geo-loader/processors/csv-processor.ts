import { Feature, Point } from 'geojson';
import Papa, { ParseError, ParseResult, ParseConfig, ParseStepResult } from 'papaparse';
import { BaseProcessor, ProcessorOptions, AnalyzeResult, ProcessorResult } from './base-processor';
import { COORDINATE_SYSTEMS } from '../types/coordinates';
import { createPointGeometry } from '../utils/geometry-utils';

interface ColumnMapping {
  x: number;
  y: number;
  z?: number;
}

interface ParsedRow {
  [key: string]: string | number | null;
}

export class CsvProcessor extends BaseProcessor {
  private static readonly MAX_PREVIEW_POINTS = 1000;
  private static readonly COORDINATE_HEADERS = {
    x: ['x', 'lon', 'longitude', 'easting', 'east', 'e'],
    y: ['y', 'lat', 'latitude', 'northing', 'north', 'n'],
    z: ['z', 'height', 'elevation', 'h']
  };

  constructor(options: ProcessorOptions) {
    super(options);
  }

  async canProcess(file: File): Promise<boolean> {
    const extension = file.name.split('.').pop()?.toLowerCase();
    return ['csv', 'xyz', 'txt'].includes(extension || '');
  }

  private async readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => {
        this.reportError('FILE_READ_ERROR', 'Failed to read file content', { fileName: file.name });
        reject(new Error('Failed to read file content'));
      };
      reader.readAsText(file);
    });
  }

  private detectDelimiter(firstLine: string): string {
    const delimiters = [',', ';', '\t', '|'];
    const counts = delimiters.map(d => ({
      delimiter: d,
      count: (firstLine.match(new RegExp(d, 'g')) || []).length
    }));
    
    const maxCount = Math.max(...counts.map(c => c.count));
    const detected = counts.find(c => c.count === maxCount);
    
    if (!detected || maxCount === 0) {
      this.reportWarning('DELIMITER_DETECTION', 'Could not detect delimiter, defaulting to comma', { firstLine });
      return ',';
    }
    
    return detected.delimiter;
  }

  private detectColumnMapping(headers: string[]): ColumnMapping | null {
    const findColumn = (candidates: string[]): number => {
      // Try exact matches first
      const exactMatch = headers.findIndex(h => 
        candidates.includes(h.toLowerCase().trim())
      );
      if (exactMatch !== -1) return exactMatch;

      // Try partial matches
      const partialMatch = headers.findIndex(h => 
        candidates.some(c => h.toLowerCase().includes(c))
      );
      if (partialMatch !== -1) {
        this.reportWarning('COLUMN_MAPPING', `Using partial match for column: ${headers[partialMatch]}`, 
          { header: headers[partialMatch], candidates });
      }
      return partialMatch;
    };

    const x = findColumn(CsvProcessor.COORDINATE_HEADERS.x);
    const y = findColumn(CsvProcessor.COORDINATE_HEADERS.y);
    const z = findColumn(CsvProcessor.COORDINATE_HEADERS.z);

    if (x === -1 || y === -1) {
      this.reportError('COLUMN_MAPPING', 'Could not find X and Y coordinate columns', { headers });
      return null;
    }

    return { x, y, ...(z !== -1 ? { z } : {}) };
  }

  private createPointFeature(row: ParsedRow, mapping: ColumnMapping, headers: string[]): Feature<Point> | null {
    const x = Number(row[headers[mapping.x]]);
    const y = Number(row[headers[mapping.y]]);
    const z = mapping.z !== undefined ? Number(row[headers[mapping.z]]) : undefined;

    if (isNaN(x) || isNaN(y)) {
      this.reportWarning('INVALID_COORDINATES', 'Invalid coordinate values', { row, x, y });
      return null;
    }

    try {
      const geometry = createPointGeometry(x, y, z);
      const properties: Record<string, any> = {};
      
      // Add all other columns as properties
      headers.forEach((header, i) => {
        if (i !== mapping.x && i !== mapping.y && i !== mapping.z) {
          properties[header] = row[header];
        }
      });

      return {
        type: 'Feature',
        geometry,
        properties
      };
    } catch (error) {
      this.reportError('GEOMETRY_CREATION', 'Failed to create point geometry', { x, y, z, error });
      return null;
    }
  }

  async analyze(file: File): Promise<AnalyzeResult> {
    try {
      const content = await this.readFileContent(file);
      const lines = content.split('\n');
      if (lines.length === 0) {
        this.reportError('EMPTY_FILE', 'File is empty');
        throw new Error('File is empty');
      }

      const delimiter = this.detectDelimiter(lines[0]);
      const parseResult = Papa.parse<ParsedRow>(content, {
        header: true,
        delimiter,
        preview: CsvProcessor.MAX_PREVIEW_POINTS,
        skipEmptyLines: true
      });

      if (parseResult.errors.length > 0) {
        parseResult.errors.forEach(error => {
          this.reportWarning('PARSE_ERROR', error.message, { row: error.row });
        });
      }

      const headers = parseResult.meta.fields || [];
      const mapping = this.detectColumnMapping(headers);
      if (!mapping) {
        throw new Error('Could not detect coordinate columns');
      }

      const features: Feature<Point>[] = [];
      parseResult.data.forEach((row: ParsedRow) => {
        const feature = this.createPointFeature(row, mapping, headers);
        if (feature) {
          features.push(feature);
        }
      });

      if (features.length === 0) {
        this.reportError('NO_FEATURES', 'No valid features found in file');
        throw new Error('No valid features found in file');
      }

      return {
        layers: ['points'],
        coordinateSystem: this.options.coordinateSystem || COORDINATE_SYSTEMS.WGS84,
        preview: {
          type: 'FeatureCollection',
          features
        }
      };
    } catch (error) {
      this.reportError('ANALYSIS_FAILED', 'CSV analysis failed', { error });
      throw error;
    }
  }

  async process(file: File): Promise<ProcessorResult> {
    try {
      const content = await this.readFileContent(file);
      const delimiter = this.detectDelimiter(content.split('\n')[0]);
      
      const features: Feature<Point>[] = [];
      let headers: string[] = [];
      let mapping: ColumnMapping | null = null;
      let processedRows = 0;
      let totalRows = 0;

      const stats = this.createDefaultStats();

      await new Promise<void>((resolve, reject) => {
        try {
          Papa.parse<ParsedRow>(content, {
            header: true,
            delimiter,
            skipEmptyLines: true,
            step: (results: ParseStepResult<ParsedRow>) => {
              if (!mapping && results.meta.fields) {
                headers = results.meta.fields;
                mapping = this.detectColumnMapping(headers);
                if (!mapping) {
                  throw new Error('Could not detect coordinate columns');
                }
              }

              if (mapping) {
                const feature = this.createPointFeature(results.data, mapping, headers);
                if (feature) {
                  features.push(feature);
                  stats.featureCount++;
                  stats.featureTypes['Point'] = (stats.featureTypes['Point'] || 0) + 1;
                }
              }

              processedRows++;
              this.emitProgress(processedRows / totalRows);
            },
            complete: () => resolve(),
            error: (error: Error) => {
              this.reportError('PARSE_ERROR', error.message);
              reject(error);
            }
          });
        } catch (error) {
          reject(error);
        }
      });

      if (features.length === 0) {
        this.reportError('NO_FEATURES', 'No valid features found in file');
        throw new Error('No valid features found in file');
      }

      // Calculate bounds
      const bounds = features.reduce((acc, feature) => {
        const coords = feature.geometry.coordinates;
        return {
          minX: Math.min(acc.minX, coords[0]),
          minY: Math.min(acc.minY, coords[1]),
          maxX: Math.max(acc.maxX, coords[0]),
          maxY: Math.max(acc.maxY, coords[1])
        };
      }, {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
      });

      return {
        features: {
          type: 'FeatureCollection',
          features
        },
        bounds,
        layers: ['points'],
        coordinateSystem: this.options.coordinateSystem || COORDINATE_SYSTEMS.WGS84,
        statistics: stats
      };
    } catch (error) {
      this.reportError('PROCESSING_FAILED', 'CSV processing failed', { error });
      throw error;
    }
  }
}
