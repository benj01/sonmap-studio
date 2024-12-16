import { GeoFileLoader, LoaderOptions, LoaderResult, GeoFeature, AnalyzeResult } from '../../../types/geo';
import { CoordinateTransformer } from '../utils/coordinate-utils';
import { COORDINATE_SYSTEMS } from '../utils/coordinate-systems';
import { createDxfParser } from '../utils/dxf-parser';

const PREVIEW_CHUNK_SIZE = 1000;

class DxfLoader implements GeoFileLoader {
  private parser = createDxfParser();

  async canLoad(file: File): Promise<boolean> {
    return file.name.toLowerCase().endsWith('.dxf');
  }

  private async readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file content'));
      reader.readAsText(file);
    });
  }

  async analyze(file: File): Promise<AnalyzeResult> {
    try {
      const content = await this.readFileContent(file);
      const dxf = this.parser.parse(content);
      const expandedEntities = this.parser.expandBlockReferences(dxf);
      
      // Collect sample points for coordinate system detection
      const samplePoints = expandedEntities
        .filter(entity => entity.type === 'POINT')
        .slice(0, 5)
        .map(entity => ({
          x: (entity as any).position.x,
          y: (entity as any).position.y
        }));

      // Default to WGS84 if no clear pattern is detected
      const coordinateSystem = COORDINATE_SYSTEMS.WGS84;

      // Calculate bounds from all entities
      const bounds = this.calculateBounds(expandedEntities);

      // Generate preview features
      const previewFeatures: GeoFeature[] = [];
      for (const entity of expandedEntities) {
        const feature = this.parser.entityToGeoFeature(entity);
        if (feature) {
          previewFeatures.push(feature);
          if (previewFeatures.length >= PREVIEW_CHUNK_SIZE) break;
        }
      }

      return {
        layers: this.parser.getLayers(),
        coordinateSystem,
        bounds,
        preview: {
          type: 'FeatureCollection',
          features: previewFeatures
        }
      };
    } catch (err) {
      const error = err as Error;
      console.error('DXF analysis error:', error);
      throw new Error(error.message || 'Failed to analyze DXF file');
    }
  }

  private calculateBounds(entities: any[]): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    const updateBounds = (x: number, y: number) => {
      if (isFinite(x) && isFinite(y)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    };

    entities.forEach(entity => {
      switch (entity.type) {
        case 'POINT':
          updateBounds(entity.position.x, entity.position.y);
          break;
        case 'LINE':
          updateBounds(entity.start.x, entity.start.y);
          updateBounds(entity.end.x, entity.end.y);
          break;
        case 'POLYLINE':
        case 'LWPOLYLINE':
          entity.vertices.forEach((v: any) => updateBounds(v.x, v.y));
          break;
        case 'CIRCLE':
        case 'ARC':
          updateBounds(entity.center.x - entity.radius, entity.center.y - entity.radius);
          updateBounds(entity.center.x + entity.radius, entity.center.y + entity.radius);
          break;
        case 'ELLIPSE':
          // Approximate bounds with center and major axis
          const majorLength = Math.sqrt(
            entity.majorAxis.x * entity.majorAxis.x + 
            entity.majorAxis.y * entity.majorAxis.y
          );
          updateBounds(
            entity.center.x - majorLength,
            entity.center.y - majorLength * entity.minorAxisRatio
          );
          updateBounds(
            entity.center.x + majorLength,
            entity.center.y + majorLength * entity.minorAxisRatio
          );
          break;
      }
    });

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return { minX: -180, minY: -90, maxX: 180, maxY: 90 };
    }

    return { minX, minY, maxX, maxY };
  }

  async load(file: File, options: LoaderOptions): Promise<LoaderResult> {
    try {
      const content = await this.readFileContent(file);
      const dxf = this.parser.parse(content);
      const expandedEntities = this.parser.expandBlockReferences(dxf);
      
      const selectedLayers = options.selectedLayers || [];
      const sourceSystem = options.coordinateSystem || COORDINATE_SYSTEMS.WGS84;
      
      let transformer: CoordinateTransformer | null = null;
      if (sourceSystem !== COORDINATE_SYSTEMS.WGS84) {
        transformer = new CoordinateTransformer(sourceSystem, COORDINATE_SYSTEMS.WGS84);
      }

      const features: GeoFeature[] = [];
      const featureTypes: Record<string, number> = {};

      for (const entity of expandedEntities) {
        // Skip entities not in selected layers
        if (selectedLayers.length > 0 && !selectedLayers.includes(entity.layer || '0')) {
          continue;
        }

        const feature = this.parser.entityToGeoFeature(entity);
        if (feature) {
          features.push(feature);
          
          // Count feature types
          const type = feature.geometry.type;
          featureTypes[type] = (featureTypes[type] || 0) + 1;
        }
      }

      // Calculate bounds
      let bounds = this.calculateBounds(expandedEntities);

      // Transform bounds if needed
      if (transformer) {
        bounds = transformer.transformBounds(bounds);
      }

      const layers = this.parser.getLayers();

      return {
        features,
        bounds,
        layers,
        coordinateSystem: COORDINATE_SYSTEMS.WGS84,
        statistics: {
          pointCount: features.length,
          layerCount: layers.length,
          featureTypes
        }
      };
    } catch (err) {
      const error = err as Error;
      console.error('DXF loading error:', error);
      throw new Error(error.message || 'Failed to load DXF file');
    }
  }
}

export default new DxfLoader();
