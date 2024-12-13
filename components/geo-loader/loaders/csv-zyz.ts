// components/geo-loader/loaders/csv-xyz.ts

import Papa from 'papaparse';
import { GeoFileLoader, LoaderOptions, LoaderResult, GeoFeature } from '../../../types/geo';
import { CoordinateTransformer, COORDINATE_SYSTEMS } from '../utils/coordinate-systems';
import _ from 'lodash';

interface ColumnMapping {
  x: number;
  y: number;
  z?: number;
  [key: string]: number | undefined;
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
      count: firstLine.split(d).length
    }));
    
    // Choose delimiter that creates the most columns
    const bestDelimiter = _.maxBy(counts, 'count');
    return bestDelimiter?.delimiter || ',';
  }

  private detectColumnMapping(headers: string[]): ColumnMapping {
    const mapping: ColumnMapping = { x: 0, y: 1 };
    
    // Try to identify coordinate columns
    headers.forEach((header, index) => {
      const lowerHeader = header.toLowerCase().trim();
      
      if (['x', 'longitude', 'lon', 'east', 'easting'].some(h => lowerHeader.includes(h))) {
        mapping.x = index;
      }
      else if (['y', 'latitude', 'lat', 'north', 'northing'].some(h => lowerHeader.includes(h))) {
        mapping.y = index;
      }
      else if (['z', 'height', 'elevation', 'alt', 'altitude'].some(h => lowerHeader.includes(h))) {
        mapping.z = index;
      }
    });

    return mapping;
  }

  async analyze(file: File) {
    try {
      const content = await this.readFileContent(file);
      const lines = content.split('\n');
      const firstLine = lines[0];
      
      // Detect delimiter
      const delimiter = this.detectDelimiter(firstLine);
      
      // Parse a sample of the file
      const sampleSize = Math.min(1000, lines.length);
      const sampleContent = lines.slice(0, sampleSize).join('\n');
      
      const parseResult = Papa.parse(sampleContent, {
        delimiter,
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true
      });

      // Detect column structure
      const headers = parseResult.meta.fields || [];
      const columnMapping = this.detectColumnMapping(headers);

      // Extract sample points for coordinate system detection
      const samplePoints = parseResult.data
        .map((row: any) => ({
          x: Number(row[headers[columnMapping.x]]),
          y: Number(row[headers[columnMapping.y]]),
          z: columnMapping.z !== undefined ? Number(row[headers[columnMapping.z]]) : undefined
        }))
        .filter(point => !isNaN(point.x) && !isNaN(point.y));

      // Detect coordinate system
      const suggestedCRS = CoordinateTransformer.suggestCoordinateSystem(samplePoints);

      // Calculate bounds
      const bounds = this.calculateBounds(samplePoints);

      // Generate preview
      const preview = this.generatePreview(samplePoints);

      return {
        columnMapping,
        headers,
        delimiter,
        coordinateSystem: suggestedCRS,
        bounds,
        preview
      };
    } catch (error) {
      console.error('CSV/XYZ Analysis error:', error);
      throw new Error('Failed to analyze file');
    }
  }

  async load(file: File, options: LoaderOptions): Promise<LoaderResult> {
    try {
      const content = await this.readFileContent(file);
      
      // Parse the entire file
      const parseResult = Papa.parse(content, {
        delimiter: options.delimiter,
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        transform: (value) => value.trim(),
        transformHeader: (header) => header.trim()
      });

      const headers = parseResult.meta.fields || [];
      const columnMapping = this.detectColumnMapping(headers);

      // Create coordinate transformer if needed
      const transformer = options.coordinateSystem && options.targetSystem ? 
        new CoordinateTransformer(options.coordinateSystem, options.targetSystem) :
        null;

      // Convert rows to features
      const features = this.convertToGeoFeatures(parseResult.data, headers, columnMapping, transformer);

      // Calculate bounds
      const points = features.map(f => ({
        x: f.geometry.coordinates[0],
        y: f.geometry.coordinates[1],
        z: f.geometry.coordinates[2]
      }));
      const bounds = this.calculateBounds(points);

      // Calculate statistics
      const statistics = {
        pointCount: features.length,
        featureTypes: { 'Point': features.length }
      };

      return {
        features,
        bounds,
        statistics,
        coordinateSystem: options.coordinateSystem
      };
    } catch (error) {
      console.error('CSV/XYZ Loading error:', error);
      throw new Error('Failed to load file');
    }
  }

  private calculateBounds(points: Array<{ x: number; y: number }>) {
    return {
      minX: Math.min(...points.map(p => p.x)),
      minY: Math.min(...points.map(p => p.y)),
      maxX: Math.max(...points.map(p => p.x)),
      maxY: Math.max(...points.map(p => p.y))
    };
  }

  private convertToGeoFeatures(
    data: any[],
    headers: string[],
    columnMapping: ColumnMapping,
    transformer?: CoordinateTransformer
  ): GeoFeature[] {
    return data.map(row => {
      const x = Number(row[headers[columnMapping.x]]);
      const y = Number(row[headers[columnMapping.y]]);
      const z = columnMapping.z !== undefined ? Number(row[headers[columnMapping.z]]) : undefined;

      let coordinates: number[] = [x, y];
      if (z !== undefined && !isNaN(z)) {
        coordinates.push(z);
      }

      if (transformer) {
        const transformed = transformer.transform({ x, y, z });
        coordinates = [transformed.x, transformed.y];
        if (transformed.z !== undefined) {
          coordinates.push(transformed.z);
        }
      }

      // Create properties object from all columns except coordinates
      const properties: { [key: string]: any } = {};
      headers.forEach((header, index) => {
        if (index !== columnMapping.x && 
            index !== columnMapping.y && 
            index !== columnMapping.z) {
          properties[header] = row[header];
        }
      });

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates
        },
        properties
      };
    });
  }

  private generatePreview(points: Array<{ x: number; y: number; z?: number }>) {
    // Take a sample of points for preview
    const samplePoints = points.slice(0, 1000).map(point => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: point.z !== undefined ? 
          [point.x, point.y, point.z] : 
          [point.x, point.y]
      },
      properties: { z: point.z }
    }));

    return {
      type: 'FeatureCollection',
      features: samplePoints
    };
  }
}

export default new CsvXyzLoader();