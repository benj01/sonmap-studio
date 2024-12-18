// components/geo-loader/processors/csv-processor.ts

import { BaseProcessor, ProcessorOptions, AnalyzeResult, ProcessorResult } from './base-processor';
import { COORDINATE_SYSTEMS } from '../types/coordinates';
import { Feature, Point } from 'geojson';
import Papa from 'papaparse';
import _ from 'lodash';

interface ColumnMapping {
  x: number;
  y: number;
  z?: number;
  [key: string]: number | undefined;
}

interface ParsedRow {
  [key: string]: any;
}

export class CsvProcessor extends BaseProcessor {
  private MAX_PREVIEW_POINTS = 1000;
  private COORDINATE_HEADERS = {
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
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  private detectDelimiter(firstLine: string): string {
    const delimiters = [',', ';', '\t', ' '];
    const counts = delimiters.map(d => ({
      delimiter: d,
      count: firstLine.split(d).length
    }));
    
    const bestDelimiter = _.maxBy(counts, 'count');
    return bestDelimiter?.delimiter || ',';
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
      return null;
    }

    const properties: Record<string, any> = {};
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
        throw new Error('Could not detect distinct X and Y columns');
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
        throw new Error('No valid coordinates found in file');
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
      throw new Error(
        `CSV analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
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
        throw new Error('Could not detect distinct X and Y columns');
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
          this.recordError(statistics, 'invalid_coordinates', 'Invalid coordinate values');
        }
      });

      if (features.length === 0) {
        throw new Error('No valid coordinates found in file');
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
      throw new Error(
        `CSV processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
