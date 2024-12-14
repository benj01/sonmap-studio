// components/geo-loader/loaders/dxf.ts

import * as DxfParser from 'dxf-parser';
import { GeoFileLoader, LoaderOptions, LoaderResult, GeoFeature } from '../../../types/geo';
import { CoordinateTransformer, CoordinateSystem, COORDINATE_SYSTEMS } from '../utils/coordinate-systems';

export class DxfLoader implements GeoFileLoader {
  private parser: DxfParser;

  constructor() {
    this.parser = new DxfParser();
  }

  async canLoad(file: File): Promise<boolean> {
    return file.name.toLowerCase().endsWith('.dxf');
  }

  private async readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  async analyze(file: File) {
    try {
      const content = await this.readFileContent(file);
      const dxf = this.parser.parseSync(content);

      // Extract available layers
      const layers = Object.keys(dxf.tables.layer.layers);

      // Sample points to detect coordinate system
      const samplePoints = this.extractSamplePoints(dxf);
      const suggestedCRS = CoordinateTransformer.suggestCoordinateSystem(samplePoints);

      // Calculate bounds
      const bounds = this.calculateBounds(dxf);

      // Generate preview (simplified version of the data)
      const preview = this.generatePreview(dxf);

      return {
        layers,
        coordinateSystem: suggestedCRS,
        bounds,
        preview,
      };
    } catch (error) {
      console.error('DXF Analysis error:', error);
      throw new Error('Failed to analyze DXF file');
    }
  }

  async load(file: File, options: LoaderOptions): Promise<LoaderResult> {
    try {
      const content = await this.readFileContent(file);
      const dxf = this.parser.parseSync(content);

      // Create coordinate transformer if needed
      const transformer =
        options.coordinateSystem && options.targetSystem
          ? new CoordinateTransformer(options.coordinateSystem, options.targetSystem)
          : null;

      // Convert DXF entities to GeoFeatures
      const features = this.convertToGeoFeatures(dxf, options.selectedLayers, transformer);

      // Calculate bounds
      const bounds = transformer
        ? transformer.transformBounds(this.calculateBounds(dxf))
        : this.calculateBounds(dxf);

      // Gather statistics
      const statistics = this.calculateStatistics(features);

      return {
        features,
        bounds,
        layers: Object.keys(dxf.tables.layer.layers),
        coordinateSystem: options.coordinateSystem,
        statistics,
      };
    } catch (error) {
      console.error('DXF Loading error:', error);
      throw new Error('Failed to load DXF file');
    }
  }

  private extractSamplePoints(dxf: any): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = [];

    // Sample points from entities
    if (dxf.entities) {
      for (const entity of dxf.entities.slice(0, 10)) {
        if (entity.vertices) {
          points.push(...entity.vertices.map((v: any) => ({ x: v.x, y: v.y })));
        } else if (entity.position) {
          points.push({ x: entity.position.x, y: entity.position.y });
        }
      }
    }

    return points;
  }

  private calculateBounds(dxf: any) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    const updateBounds = (x: number, y: number) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };

    // Process all entities
    if (dxf.entities) {
      for (const entity of dxf.entities) {
        if (entity.vertices) {
          entity.vertices.forEach((v: any) => updateBounds(v.x, v.y));
        } else if (entity.position) {
          updateBounds(entity.position.x, entity.position.y);
        }
      }
    }

    return { minX, minY, maxX, maxY };
  }

  private convertToGeoFeatures(
    dxf: any,
    selectedLayers?: string[],
    transformer?: CoordinateTransformer
  ): GeoFeature[] {
    const features: GeoFeature[] = [];

    if (!dxf.entities) return features;

    for (const entity of dxf.entities) {
      // Skip if entity's layer is not selected
      if (selectedLayers && !selectedLayers.includes(entity.layer)) continue;

      const feature = this.entityToGeoFeature(entity, transformer);
      if (feature) features.push(feature);
    }

    return features;
  }

  private entityToGeoFeature(entity: any, transformer?: CoordinateTransformer): GeoFeature | null {
    let geometry: any = null;

    switch (entity.type) {
      case 'LINE':
        geometry = {
          type: 'LineString',
          coordinates: [
            this.transformPoint([entity.start.x, entity.start.y], transformer),
            this.transformPoint([entity.end.x, entity.end.y], transformer),
          ],
        };
        break;

      case 'POINT':
        geometry = {
          type: 'Point',
          coordinates: this.transformPoint([entity.position.x, entity.position.y], transformer),
        };
        break;

      case 'POLYLINE':
      case 'LWPOLYLINE':
        geometry = {
          type: 'LineString',
          coordinates: entity.vertices.map((v: any) =>
            this.transformPoint([v.x, v.y], transformer)
          ),
        };
        break;

      // Add more entity types as needed

      default:
        return null;
    }

    return {
      type: 'Feature',
      geometry,
      properties: {
        layer: entity.layer,
        type: entity.type,
        ...(entity.properties || {}),
      },
      layer: entity.layer,
    };
  }

  private transformPoint(
    point: [number, number],
    transformer?: CoordinateTransformer
  ): [number, number] {
    if (!transformer) return point;
    const transformed = transformer.transform({ x: point[0], y: point[1] });
    return [transformed.x, transformed.y];
  }

  private generatePreview(dxf: any): any {
    // Generate a simplified GeoJSON for preview
    // Include only a subset of features for performance
    const previewFeatures = this.convertToGeoFeatures(dxf).slice(0, 1000); // Limit to first 1000 features for preview

    return {
      type: 'FeatureCollection',
      features: previewFeatures,
    };
  }

  private calculateStatistics(features: GeoFeature[]) {
    const featureTypes: Record<string, number> = {};
    let pointCount = 0;

    features.forEach((feature) => {
      // Count feature types
      const type = feature.properties.type;
      featureTypes[type] = (featureTypes[type] || 0) + 1;

      // Count points
      if (feature.geometry.type === 'Point') {
        pointCount++;
      } else if (feature.geometry.type === 'LineString') {
        pointCount += feature.geometry.coordinates.length;
      }
    });

    return {
      pointCount,
      layerCount: new Set(features.map((f) => f.layer)).size,
      featureTypes,
    };
  }
}

export default new DxfLoader();
