// components/geo-loader/loaders/shapefile.ts

import shapefile from 'shapefile';
import { GeoFileLoader, LoaderOptions, LoaderResult, GeoFeature } from '../../../types/geo';
import { CoordinateTransformer } from '../utils/coordinate-systems';

export class ShapefileLoader implements GeoFileLoader {
  async canLoad(file: File): Promise<boolean> {
    return file.name.toLowerCase().endsWith('.shp');
  }

  private async readShapefileContent(shpFile: File, dbfFile?: File) {
    // Convert File to ArrayBuffer for shapefile-js
    const shpBuffer = await shpFile.arrayBuffer();
    const dbfBuffer = dbfFile ? await dbfFile.arrayBuffer() : undefined;

    return shapefile.read(shpBuffer, dbfBuffer);
  }

  private findDBFFile(shpFile: File): Promise<File | undefined> {
    // Get the corresponding .dbf file from the same directory
    const dbfName = shpFile.name.replace(/\.shp$/i, '.dbf');
    // This would need to be implemented based on your file handling system
    // For now, return undefined
    return Promise.resolve(undefined);
  }

  async analyze(file: File) {
    try {
      const dbfFile = await this.findDBFFile(file);
      const geojson = await this.readShapefileContent(file, dbfFile);

      // Sample some features for coordinate system detection
      const samplePoints = this.extractSamplePoints(geojson);
      const suggestedCRS = CoordinateTransformer.suggestCoordinateSystem(samplePoints);

      // Calculate bounds
      const bounds = this.calculateBounds(geojson);

      // Generate preview
      const preview = this.generatePreview(geojson);

      // Extract available layers (in shapefiles, usually only one)
      const layers = ['default'];

      return {
        layers,
        coordinateSystem: suggestedCRS,
        bounds,
        preview,
        properties: this.analyzeProperties(geojson)
      };
    } catch (error) {
      console.error('Shapefile Analysis error:', error);
      throw new Error('Failed to analyze Shapefile');
    }
  }

  async load(file: File, options: LoaderOptions): Promise<LoaderResult> {
    try {
      const dbfFile = await this.findDBFFile(file);
      const geojson = await this.readShapefileContent(file, dbfFile);

      // Create coordinate transformer if needed
      const transformer = options.coordinateSystem && options.targetSystem ? 
        new CoordinateTransformer(options.coordinateSystem, options.targetSystem) :
        null;

      // Transform coordinates if needed
      const features = this.transformFeatures(geojson.features, transformer);

      // Calculate bounds
      const bounds = transformer ? 
        transformer.transformBounds(this.calculateBounds(geojson)) :
        this.calculateBounds(geojson);

      // Calculate statistics
      const statistics = this.calculateStatistics(features);

      return {
        features,
        bounds,
        layers: ['default'], // Shapefiles typically have one layer
        coordinateSystem: options.coordinateSystem,
        statistics
      };
    } catch (error) {
      console.error('Shapefile Loading error:', error);
      throw new Error('Failed to load Shapefile');
    }
  }

  private extractSamplePoints(geojson: any): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = [];
    
    // Take sample points from features
    for (const feature of geojson.features.slice(0, 10)) {
      if (feature.geometry.type === 'Point') {
        points.push({
          x: feature.geometry.coordinates[0],
          y: feature.geometry.coordinates[1]
        });
      } else if (feature.geometry.type === 'LineString' || 
                 feature.geometry.type === 'Polygon') {
        points.push({
          x: feature.geometry.coordinates[0][0],
          y: feature.geometry.coordinates[0][1]
        });
      }
    }

    return points;
  }

  private calculateBounds(geojson: any) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    const updateBounds = (coords: number[]) => {
      minX = Math.min(minX, coords[0]);
      minY = Math.min(minY, coords[1]);
      maxX = Math.max(maxX, coords[0]);
      maxY = Math.max(maxY, coords[1]);
    };

    for (const feature of geojson.features) {
      const coords = feature.geometry.coordinates;
      
      switch (feature.geometry.type) {
        case 'Point':
          updateBounds(coords);
          break;
        case 'LineString':
          coords.forEach(updateBounds);
          break;
        case 'Polygon':
          coords[0].forEach(updateBounds); // outer ring only
          break;
        // Add more geometry types as needed
      }
    }

    return { minX, minY, maxX, maxY };
  }

  private transformFeatures(features: any[], transformer?: CoordinateTransformer): GeoFeature[] {
    if (!transformer) return features;

    return features.map(feature => {
      const transformedFeature = { ...feature };
      
      switch (feature.geometry.type) {
        case 'Point':
          const transformed = transformer.transform({
            x: feature.geometry.coordinates[0],
            y: feature.geometry.coordinates[1]
          });
          transformedFeature.geometry.coordinates = [transformed.x, transformed.y];
          break;
        
        case 'LineString':
          transformedFeature.geometry.coordinates = feature.geometry.coordinates.map(
            (coord: number[]) => {
              const transformed = transformer.transform({ x: coord[0], y: coord[1] });
              return [transformed.x, transformed.y];
            }
          );
          break;
        
        case 'Polygon':
          transformedFeature.geometry.coordinates = feature.geometry.coordinates.map(
            (ring: number[][]) => ring.map((coord: number[]) => {
              const transformed = transformer.transform({ x: coord[0], y: coord[1] });
              return [transformed.x, transformed.y];
            })
          );
          break;
        // Add more geometry types as needed
      }

      return transformedFeature;
    });
  }

  private generatePreview(geojson: any) {
    // Take first 1000 features for preview
    return {
      type: 'FeatureCollection',
      features: geojson.features.slice(0, 1000)
    };
  }

  private analyzeProperties(geojson: any) {
    if (!geojson.features || geojson.features.length === 0) {
      return {};
    }

    // Get property names from first feature
    const propertyNames = Object.keys(geojson.features[0].properties || {});

    // Analyze property types and sample values
    const propertyInfo = propertyNames.map(name => {
      const values = geojson.features
        .slice(0, 100)
        .map((f: any) => f.properties[name]);
      
      const type = this.detectPropertyType(values);
      const sampleValues = [...new Set(values)].slice(0, 5);

      return {
        name,
        type,
        sampleValues
      };
    });

    return {
      propertyNames,
      propertyInfo
    };
  }

  private detectPropertyType(values: any[]): string {
    const nonNullValues = values.filter(v => v !== null && v !== undefined);
    if (nonNullValues.length === 0) return 'unknown';

    if (nonNullValues.every(v => typeof v === 'number')) return 'number';
    if (nonNullValues.every(v => typeof v === 'boolean')) return 'boolean';
    if (nonNullValues.every(v => !isNaN(Date.parse(v)))) return 'date';
    return 'string';
  }

  private calculateStatistics(features: GeoFeature[]) {
    const featureTypes: Record<string, number> = {};
    let pointCount = 0;
    let vertexCount = 0;

    features.forEach(feature => {
      const type = feature.geometry.type;
      featureTypes[type] = (featureTypes[type] || 0) + 1;

      switch (type) {
        case 'Point':
          pointCount++;
          vertexCount++;
          break;
        case 'LineString':
          vertexCount += feature.geometry.coordinates.length;
          break;
        case 'Polygon':
          vertexCount += feature.geometry.coordinates[0].length;
          break;
      }
    });

    return {
      featureCount: features.length,
      pointCount,
      vertexCount,
      featureTypes
    };
  }
}

export default new ShapefileLoader();