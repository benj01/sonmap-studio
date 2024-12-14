// components/geo-loader/loaders/dxf.ts

import DxfParser from 'dxf-parser';

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

  private safeParseSync(content: string): any {
    try {
      const dxf = this.parser.parseSync(content);
      if (!dxf) {
        throw new Error('DXF parsing resulted in null or undefined');
      }
      return dxf;
    } catch (error) {
      console.error('DXF parsing error:', error);
      throw new Error(`Failed to parse DXF content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async analyze(file: File) {
    try {
      const content = await this.readFileContent(file);
      const dxf = this.safeParseSync(content);

      // Extract available layers with safe access
      let layers: string[] = [];
      try {
        if (dxf.tables?.layer?.layers) {
          const layerTable = dxf.tables.layer.layers;
          // Ensure we're dealing with an object that has properties
          if (typeof layerTable === 'object' && layerTable !== null) {
            layers = Object.keys(layerTable);
          }
        }
      } catch (error) {
        console.warn('Error extracting layers from layer table:', error);
      }

      // If no layers found in table, try to extract from entities
      if (layers.length === 0 && Array.isArray(dxf.entities)) {
        const layerSet = new Set<string>();
        dxf.entities.forEach((entity: any) => {
          if (entity && typeof entity.layer === 'string') {
            layerSet.add(entity.layer);
          }
        });
        layers = Array.from(layerSet);
      }

      // If still no layers found, add default layer
      if (layers.length === 0) {
        layers = ['0'];  // DXF default layer
      }

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
      throw new Error(`Failed to analyze DXF file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async load(file: File, options: LoaderOptions): Promise<LoaderResult> {
    try {
      const content = await this.readFileContent(file);
      const dxf = this.safeParseSync(content);

      // Create coordinate transformer if needed
      let transformer: CoordinateTransformer | undefined = undefined;
      if (options.coordinateSystem && options.targetSystem) {
        transformer = new CoordinateTransformer(options.coordinateSystem, options.targetSystem);
      }

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
        layers: options.selectedLayers || [],
        coordinateSystem: options.coordinateSystem,
        statistics,
      };
    } catch (error) {
      console.error('DXF Loading error:', error);
      throw new Error(`Failed to load DXF file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private extractSamplePoints(dxf: any): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = [];

    try {
      // Safely check if entities exists and is an array
      if (Array.isArray(dxf.entities)) {
        for (const entity of dxf.entities.slice(0, 10)) {
          if (Array.isArray(entity.vertices)) {
            points.push(...entity.vertices
              .filter((v: any) => typeof v.x === 'number' && typeof v.y === 'number')
              .map((v: any) => ({ x: v.x, y: v.y })));
          } else if (entity.position && typeof entity.position.x === 'number' && typeof entity.position.y === 'number') {
            points.push({ x: entity.position.x, y: entity.position.y });
          }
        }
      }
    } catch (error) {
      console.warn('Error extracting sample points:', error);
    }

    return points;
  }

  private calculateBounds(dxf: any) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    const updateBounds = (x: number, y: number) => {
      if (typeof x === 'number' && typeof y === 'number') {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    };

    try {
      // Process all entities
      if (Array.isArray(dxf.entities)) {
        for (const entity of dxf.entities) {
          if (Array.isArray(entity.vertices)) {
            entity.vertices.forEach((v: any) => {
              if (v && typeof v.x === 'number' && typeof v.y === 'number') {
                updateBounds(v.x, v.y);
              }
            });
          } else if (entity.position && typeof entity.position.x === 'number' && typeof entity.position.y === 'number') {
            updateBounds(entity.position.x, entity.position.y);
          }
        }
      }
    } catch (error) {
      console.warn('Error calculating bounds:', error);
    }

    return { minX, minY, maxX, maxY };
  }

  private convertToGeoFeatures(
    dxf: any,
    selectedLayers?: string[],
    transformer?: CoordinateTransformer
  ): GeoFeature[] {
    const features: GeoFeature[] = [];

    if (!Array.isArray(dxf.entities)) return features;

    for (const entity of dxf.entities) {
      // Skip if entity's layer is not selected
      if (selectedLayers && !selectedLayers.includes(entity.layer)) continue;

      const feature = this.entityToGeoFeature(entity, transformer);
      if (feature) features.push(feature);
    }

    return features;
  }

  private entityToGeoFeature(entity: any, transformer?: CoordinateTransformer): GeoFeature | null {
    if (!entity || typeof entity.type !== 'string') return null;

    let geometry: any = null;

    try {
      switch (entity.type) {
        case 'LINE':
          if (entity.start?.x != null && entity.start?.y != null && 
              entity.end?.x != null && entity.end?.y != null) {
            geometry = {
              type: 'LineString',
              coordinates: [
                this.transformPoint([entity.start.x, entity.start.y], transformer),
                this.transformPoint([entity.end.x, entity.end.y], transformer),
              ],
            };
          }
          break;

        case 'POINT':
          if (entity.position?.x != null && entity.position?.y != null) {
            geometry = {
              type: 'Point',
              coordinates: this.transformPoint([entity.position.x, entity.position.y], transformer),
            };
          }
          break;

        case 'POLYLINE':
        case 'LWPOLYLINE':
          if (Array.isArray(entity.vertices)) {
            const validVertices = entity.vertices
              .filter((v: any) => v?.x != null && v?.y != null)
              .map((v: any) => this.transformPoint([v.x, v.y], transformer));

            if (validVertices.length >= 2) {
              geometry = {
                type: 'LineString',
                coordinates: validVertices,
              };
            }
          }
          break;

        default:
          return null;
      }

      if (!geometry) return null;

      return {
        type: 'Feature',
        geometry,
        properties: {
          layer: typeof entity.layer === 'string' ? entity.layer : '0',
          type: entity.type,
          ...(entity.properties || {}),
        },
        layer: typeof entity.layer === 'string' ? entity.layer : '0',
      };
    } catch (error) {
      console.warn('Error converting entity to GeoFeature:', error);
      return null;
    }
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
    try {
      // Generate a simplified GeoJSON for preview
      // Include only a subset of features for performance
      const previewFeatures = this.convertToGeoFeatures(dxf).slice(0, 1000); // Limit to first 1000 features for preview

      return {
        type: 'FeatureCollection',
        features: previewFeatures,
      };
    } catch (error) {
      console.warn('Error generating preview:', error);
      return {
        type: 'FeatureCollection',
        features: [],
      };
    }
  }

  private calculateStatistics(features: GeoFeature[]) {
    const featureTypes: Record<string, number> = {};
    let pointCount = 0;

    features.forEach((feature) => {
      try {
        // Count feature types
        const type = feature.properties?.type;
        if (typeof type === 'string') {
          featureTypes[type] = (featureTypes[type] || 0) + 1;
        }

        // Count points
        if (feature.geometry.type === 'Point') {
          pointCount++;
        } else if (feature.geometry.type === 'LineString' && Array.isArray(feature.geometry.coordinates)) {
          pointCount += feature.geometry.coordinates.length;
        }
      } catch (error) {
        console.warn('Error calculating statistics for feature:', error);
      }
    });

    return {
      pointCount,
      layerCount: new Set(features.map((f) => f.layer).filter(Boolean)).size,
      featureTypes,
    };
  }
}

export default new DxfLoader();
