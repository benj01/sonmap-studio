import DxfParser from 'dxf-parser';
import { GeoFileLoader, LoaderOptions, LoaderResult, GeoFeature } from '../../../types/geo';
import { CoordinateTransformer, CoordinateSystem, COORDINATE_SYSTEMS } from '../utils/coordinate-systems';

// Extend DxfParser to handle the boolean parsing issue
class CustomDxfParser extends DxfParser {
  constructor() {
    super();
    // Override the parseBoolean method with more robust DXF handling and debugging
    (this as any).parseBoolean = (str: string | number | boolean): boolean => {
      console.log('parseBoolean called with:', { value: str, type: typeof str });

      // Validate input type
      if (str === undefined || str === null) {
      console.warn('Received null or undefined for boolean parsing');
      return false;
      }

      // Handle direct boolean values
      if (typeof str === 'boolean') return str;

      // Handle numeric values - in DXF, any non-zero is true
      if (typeof str === 'number') return str !== 0;

      // Handle string values with enhanced DXF support
      if (typeof str === 'string') {
      const normalized = str.toLowerCase().trim();

      // Standard boolean strings
      if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
      if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;

      // DXF-specific case: interpret any numeric string as a boolean
      const num = parseFloat(normalized);
      if (!isNaN(num)) {
        // Log the DXF-specific handling for debugging
        console.log(`Interpreting numeric string "${str}" as boolean: ${num > 0}`);
        return num > 0;
      }

      // Log a warning for unhandled cases
      console.warn(`Unexpected string input for parseBoolean: "${str}"`);
      return false;
      }

      // Log a warning for unhandled types
      console.warn(`Unhandled parseBoolean input: "${str}"`);
      return false;
    };
    
    
  }
}

export class DxfLoader implements GeoFileLoader {
  private parser: CustomDxfParser;

  constructor() {
    this.parser = new CustomDxfParser();
  }

  async canLoad(file: File): Promise<boolean> {
    return file.name.toLowerCase().endsWith('.dxf');
  }

  private async readFileContent(file: File): Promise<string> {
    if (!file) {
      throw new Error('No file provided');
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result !== 'string') {
          reject(new Error('Failed to read file as text'));
          return;
        }
        // Validate file content
        if (result.trim().length === 0) {
          reject(new Error('DXF file is empty'));
          return;
        }
        // Basic DXF header validation
        if (!result.includes('$ACADVER') && !result.includes('SECTION')) {
          reject(new Error('File does not appear to be a valid DXF format'));
          return;
        }
        resolve(result);
      };
      reader.onerror = (e) => reject(new Error(`Failed to read file: ${e.target?.error?.message || 'Unknown error'}`));
      reader.readAsText(file);
    });
  }

  private safeParseSync(content: string): any {
    if (!content || typeof content !== 'string') {
      throw new Error('Invalid DXF content provided');
    }
  
    try {
      console.log('Attempting to parse DXF content...');
      const dxf = this.parser.parseSync(content);
      console.log('DXF parsing successful:', {
        hasEntities: !!dxf?.entities,
        entityCount: dxf?.entities?.length,
        hasHeader: !!dxf?.header,
      });
  
      if (!dxf) {
        throw new Error('DXF parsing resulted in null or undefined');
      }
  
      // Enhanced DXF structure validation
      if (!dxf.entities) {
        throw new Error('Invalid DXF structure: missing entities section');
      }
  
      if (!Array.isArray(dxf.entities)) {
        throw new Error('Invalid DXF structure: entities section is not an array');
      }
  
      // Log details of entities to identify problematic input
      dxf.entities.forEach((entity: any, index: number) => {
        console.log(`Entity ${index}:`, JSON.stringify(entity, null, 2));
      });
  
      return dxf;
    } catch (error) {
      console.error('DXF Parsing Error Details:', {
        error: error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error,
        contentLength: content.length,
        contentPreview: content.substring(0, 200),
      });
  
      throw error;
    }
  }
  

  async analyze(file: File) {
    if (!file) {
      throw new Error('No file provided for analysis');
    }

    try {
      console.log('Starting DXF analysis for file:', file.name);

      // Validate file size
      if (file.size === 0) {
        throw new Error('DXF file is empty');
      }

      const content = await this.readFileContent(file);

      // Additional content validation
      if (content.length < 100) {
        // Minimum size for a valid DXF
        throw new Error('DXF file appears to be truncated or corrupted');
      }

      console.log('File content read successfully, length:', content.length);

      const dxf = this.safeParseSync(content);
      console.log('DXF parsed successfully');

      // Extract available layers with enhanced error handling and validation
      let layers: string[] = [];
      try {
        if (dxf.tables?.layer?.layers) {
          const layerTable = dxf.tables.layer.layers;
          if (typeof layerTable === 'object' && layerTable !== null) {
            layers = Object.keys(layerTable).filter(
              (layer) => layer !== undefined && layer !== null && layer.trim() !== ''
            );
          }
        }
        console.log('Extracted layers:', layers);
      } catch (error) {
        console.warn('Error extracting layers from layer table:', error);
        // Continue execution to try alternative layer extraction
      }

      // If no layers found in table, try to extract from entities
      if (layers.length === 0 && Array.isArray(dxf.entities)) {
        const layerSet = new Set<string>();
        dxf.entities.forEach((entity: any) => {
          if (entity && typeof entity.layer === 'string' && entity.layer.trim() !== '') {
            layerSet.add(entity.layer);
          }
        });
        layers = Array.from(layerSet);
        console.log('Extracted layers from entities:', layers);
      }

      // If still no layers found, add default layer
      if (layers.length === 0) {
        layers = ['0']; // DXF default layer
        console.warn('No layers found in DXF file, using default layer "0"');
      }

      // Validate and extract sample points
      const samplePoints = this.extractSamplePoints(dxf);
      console.log('Extracted sample points:', samplePoints.length);

      if (samplePoints.length === 0) {
        console.warn('No valid points found for coordinate system detection');
      }

      // Validate coordinate values
      const hasInvalidCoordinates = samplePoints.some(
        (point) => !isFinite(point.x) || !isFinite(point.y)
      );
      if (hasInvalidCoordinates) {
        throw new Error('DXF file contains invalid coordinate values');
      }

      const suggestedCRS = CoordinateTransformer.suggestCoordinateSystem(samplePoints);
      console.log('Suggested coordinate system:', suggestedCRS);

      // Calculate and validate bounds
      const bounds = this.calculateBounds(dxf);
      console.log('Calculated bounds:', bounds);

      if (
        bounds.minX === Infinity ||
        bounds.minY === Infinity ||
        bounds.maxX === -Infinity ||
        bounds.maxY === -Infinity
      ) {
        throw new Error(
          'Could not calculate valid bounds from DXF content - file may be corrupted or contain invalid coordinates'
        );
      }

      // Generate and validate preview
      const preview = this.generatePreview(dxf);
      console.log('Generated preview features count:', preview.features.length);

      if (!preview.features || preview.features.length === 0) {
        console.warn('No previewable features found in DXF file');
      }

      return {
        layers,
        coordinateSystem: suggestedCRS,
        bounds,
        preview,
      };
    } catch (error) {
      console.error('DXF Analysis error:', error);
      throw new Error(`Failed to analyze DXF file: ${error.message}`);
    }
  }

  async load(file: File, options: LoaderOptions): Promise<LoaderResult> {
    if (!file) {
      throw new Error('No file provided for loading');
    }

    try {
      console.log('Starting DXF load with options:', options);

      const content = await this.readFileContent(file);
      const dxf = this.safeParseSync(content);

      // Create coordinate transformer if needed
      let transformer: CoordinateTransformer | undefined = undefined;
      if (options.coordinateSystem && options.targetSystem) {
        transformer = new CoordinateTransformer(options.coordinateSystem, options.targetSystem);
      }

      // Convert DXF entities to GeoFeatures
      const features = this.convertToGeoFeatures(dxf, options.selectedLayers, transformer);
      console.log('Converted features count:', features.length);

      if (features.length === 0) {
        console.warn('No valid features extracted from DXF file');
      }

      // Calculate bounds
      const bounds = transformer
        ? transformer.transformBounds(this.calculateBounds(dxf))
        : this.calculateBounds(dxf);

      // Gather statistics
      const statistics = this.calculateStatistics(features);
      console.log('Calculated statistics:', statistics);

      return {
        features,
        bounds,
        layers: options.selectedLayers || [],
        coordinateSystem: options.coordinateSystem,
        statistics,
      };
    } catch (error) {
      console.error('DXF Loading error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to load DXF file: ${errorMessage}. Please ensure the file is a valid DXF format and try again.`);
    }
  }

  private extractSamplePoints(dxf: any): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = [];

    try {
      if (!Array.isArray(dxf.entities)) {
        console.warn('No valid entities array found for sample point extraction');
        return points;
      }

      for (const entity of dxf.entities.slice(0, 10)) {
        if (Array.isArray(entity.vertices)) {
          points.push(
            ...entity.vertices
              .filter(
                (v: any) =>
                  v &&
                  typeof v.x === 'number' &&
                  !isNaN(v.x) &&
                  typeof v.y === 'number' &&
                  !isNaN(v.y)
              )
              .map((v: any) => ({ x: v.x, y: v.y }))
          );
        } else if (
          entity.position &&
          typeof entity.position.x === 'number' &&
          !isNaN(entity.position.x) &&
          typeof entity.position.y === 'number' &&
          !isNaN(entity.position.y)
        ) {
          points.push({ x: entity.position.x, y: entity.position.y });
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
      if (typeof x === 'number' && !isNaN(x) && typeof y === 'number' && !isNaN(y)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    };

    try {
      if (!Array.isArray(dxf.entities)) {
        console.warn('No valid entities array found for bounds calculation');
        return { minX, minY, maxX, maxY };
      }

      for (const entity of dxf.entities) {
        if (Array.isArray(entity.vertices)) {
          entity.vertices.forEach((v: any) => {
            if (v && typeof v.x === 'number' && typeof v.y === 'number') {
              updateBounds(v.x, v.y);
            }
          });
        } else if (
          entity.position &&
          typeof entity.position.x === 'number' &&
          typeof entity.position.y === 'number'
        ) {
          updateBounds(entity.position.x, entity.position.y);
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

    if (!Array.isArray(dxf.entities)) {
      console.warn('No valid entities array found for feature conversion');
      return features;
    }

    for (const entity of dxf.entities) {
      try {
        // Skip if entity's layer is not selected
        if (selectedLayers && !selectedLayers.includes(entity.layer)) continue;

        const feature = this.entityToGeoFeature(entity, transformer);
        if (feature) features.push(feature);
      } catch (error) {
        console.warn('Error converting entity to feature:', error);
        // Continue processing other entities
      }
    }

    return features;
  }

  private entityToGeoFeature(entity: any, transformer?: CoordinateTransformer): GeoFeature | null {
    if (!entity || typeof entity.type !== 'string') {
      return null;
    }

    let geometry: any = null;

    try {
      switch (entity.type.toUpperCase()) {
        case 'LINE':
          if (this.isValidPoint(entity.start) && this.isValidPoint(entity.end)) {
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
          if (this.isValidPoint(entity.position)) {
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
              .filter((v: any) => this.isValidPoint(v))
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

  private isValidPoint(point: any): boolean {
    return (
      point &&
      typeof point.x === 'number' &&
      !isNaN(point.x) &&
      typeof point.y === 'number' &&
      !isNaN(point.y)
    );
  }

  private transformPoint(
    point: [number, number],
    transformer?: CoordinateTransformer
  ): [number, number] {
    if (!transformer) return point;
    try {
      const transformed = transformer.transform({ x: point[0], y: point[1] });
      return [transformed.x, transformed.y];
    } catch (error) {
      console.warn('Error transforming point:', error);
      return point;
    }
  }

  private generatePreview(dxf: any): any {
    try {
      // Generate a simplified GeoJSON for preview
      // Include only a subset of features for performance
      const previewFeatures = this.convertToGeoFeatures(dxf).slice(0, 1000); // Limit to first 1000 features

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
        } else if (
          feature.geometry.type === 'LineString' &&
          Array.isArray(feature.geometry.coordinates)
        ) {
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
