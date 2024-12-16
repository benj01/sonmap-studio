// components/geo-loader/loaders/csv-xyz.ts

import Papa from 'papaparse';
import { GeoFileLoader, LoaderOptions, LoaderResult, GeoFeature, GeoFeatureCollection, AnalyzeResult } from '../../../types/geo';
import { createTransformer, suggestCoordinateSystem } from '../utils/coordinate-utils';
import { COORDINATE_SYSTEMS } from '../utils/coordinate-systems';
import { createPointGeometry, createFeature } from '../utils/geometry-utils';
import _ from 'lodash';

interface ColumnMapping {
  x: number;
  y: number;
  z?: number;
  [key: string]: number | undefined;
}

interface PointData {
  x: number;
  y: number;
  z: number | undefined;
}

export class CsvXyzLoader implements GeoFileLoader {
  async canLoad(file: File): Promise<boolean> {
    const ext = file.name.toLowerCase();
    return ext.endsWith('.csv') || ext.endsWith('.xyz') || ext.endsWith('.txt');
  }

  private async readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  private detectDelimiter(firstLine: string): string {
    const delimiters = [',', ';', '\t', ' '];
    const counts = delimiters.map(d => ({
      delimiter: d,
      count: firstLine.split(d).length,
    }));

    // Choose the delimiter that creates the most columns
    const bestDelimiter = _.maxBy(counts, 'count');
    return bestDelimiter?.delimiter || ',';
  }

  private detectColumnMapping(headers: string[]): ColumnMapping {
    const mapping: ColumnMapping = { x: 0, y: 1 };

    headers.forEach((header, index) => {
      const lowerHeader = header.toLowerCase().trim();

      if (['x', 'longitude', 'lon', 'east', 'easting'].some(h => lowerHeader.includes(h))) {
        mapping.x = index;
      } else if (['y', 'latitude', 'lat', 'north', 'northing'].some(h => lowerHeader.includes(h))) {
        mapping.y = index;
      } else if (['z', 'height', 'elevation', 'alt', 'altitude'].some(h => lowerHeader.includes(h))) {
        mapping.z = index;
      }
    });

    return mapping;
  }

  private createPointFeature(point: PointData): GeoFeature {
    const geometry = createPointGeometry(point.x, point.y, isNaN(point.z) ? undefined : point.z);
    const properties = {};
    if (point.z !== undefined && !isNaN(point.z)) {
      properties['z'] = point.z;
    }
    return createFeature(geometry, properties);
  }

  async analyze(file: File): Promise<AnalyzeResult> {
    try {
      const content = await this.readFileContent(file);
      const lines = content.split('\n');
      const firstLine = lines[0];

      const delimiter = this.detectDelimiter(firstLine);
      const sampleSize = Math.min(1000, lines.length);
      const sampleContent = lines.slice(0, sampleSize).join('\n');

      const parseResult = Papa.parse(sampleContent, {
        delimiter,
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
      });

      const headers = parseResult.meta.fields || [];
      const columnMapping = this.detectColumnMapping(headers);

      const samplePoints = parseResult.data
        .map((row: any): PointData => ({
          x: Number(row[headers[columnMapping.x]]),
          y: Number(row[headers[columnMapping.y]]),
          z: columnMapping.z !== undefined ? Number(row[headers[columnMapping.z]]) : undefined,
        }))
        .filter(point => !isNaN(point.x) && !isNaN(point.y));

      const suggestedCRS = suggestCoordinateSystem(samplePoints);
      const bounds = this.calculateBounds(samplePoints);

      const preview: GeoFeatureCollection = {
        type: 'FeatureCollection',
        features: samplePoints.map(point => this.createPointFeature(point)),
      };

      return {
        layers: ['default'], // Point clouds have a single default layer
        coordinateSystem: suggestedCRS,
        bounds,
        preview,
      };
    } catch (error) {
      console.error('CSV/XYZ Analysis error:', error);
      throw new Error('Failed to analyze file');
    }
  }

  async load(file: File, options: LoaderOptions): Promise<LoaderResult> {
    try {
      const content = await this.readFileContent(file);

      const parseResult = Papa.parse(content, {
        delimiter: options.delimiter || this.detectDelimiter(content.split('\n')[0]),
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
      });

      const headers = parseResult.meta.fields || [];
      const columnMapping = this.detectColumnMapping(headers);

      // Extract raw points
      let points = parseResult.data
        .map((row: any): PointData => ({
          x: Number(row[headers[columnMapping.x]]),
          y: Number(row[headers[columnMapping.y]]),
          z: columnMapping.z !== undefined ? Number(row[headers[columnMapping.z]]) : undefined,
        }))
        .filter(point => !isNaN(point.x) && !isNaN(point.y));

      let sourceSystem = options.coordinateSystem;
      if (!sourceSystem) {
        // If no system specified, suggest from sample points
        sourceSystem = suggestCoordinateSystem(points);
      }

      let transformer: ReturnType<typeof createTransformer> | undefined;
      if (sourceSystem && options.targetSystem && sourceSystem !== options.targetSystem) {
        transformer = createTransformer(sourceSystem, options.targetSystem);
      }

      if (transformer) {
        points = points.map(point => {
          const transformed = transformer.transform({ x: point.x, y: point.y, z: point.z });
          return { ...transformed };
        });
      }

      if (options.simplificationTolerance) {
        points = this.simplifyPoints(points, options.simplificationTolerance);
      }

      const features = points.map(point => this.createPointFeature(point));
      const bounds = this.calculateBounds(points);

      return {
        features,
        bounds,
        layers: ['default'], // Point clouds have a single default layer
        statistics: {
          pointCount: features.length,
          featureTypes: { Point: features.length },
        },
        coordinateSystem: options.targetSystem || sourceSystem || COORDINATE_SYSTEMS.WGS84,
      };
    } catch (error) {
      console.error('CSV/XYZ Loading error:', error);
      throw new Error('Failed to load file');
    }
  }

  private calculateBounds(points: PointData[]) {
    if (points.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
    return {
      minX: Math.min(...points.map(p => p.x)),
      minY: Math.min(...points.map(p => p.y)),
      maxX: Math.max(...points.map(p => p.x)),
      maxY: Math.max(...points.map(p => p.y)),
    };
  }

  private simplifyPoints(points: PointData[], tolerance: number): PointData[] {
    return _.sampleSize(points, Math.ceil(points.length * (1 - tolerance / 100)));
  }
}

export default new CsvXyzLoader();
