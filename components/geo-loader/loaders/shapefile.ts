// components/geo-loader/loaders/shapefile.ts

import * as shapefile from 'shapefile';
import { GeoFileLoader, LoaderOptions, LoaderResult, GeoFeature, GeoFeatureCollection } from '../../../types/geo';
import { CoordinateTransformer } from '../utils/coordinate-systems';

class ShapefileLoader implements GeoFileLoader {
  async canLoad(file: File): Promise<boolean> {
    return file.name.toLowerCase().endsWith('.shp');
  }

  private async readFeatures(shpBuffer: ArrayBuffer, dbfBuffer: ArrayBuffer) {
    const features: GeoFeature[] = [];
    const source = await shapefile.open(shpBuffer);
    
    let feature;
    while ((feature = await source.read())) {
      features.push(feature.value as GeoFeature);
    }

    return features;
  }

  async analyze(file: File) {
    try {
      // Get related files from the custom property we set in FileItem
      const relatedFiles = (file as any).relatedFiles || {};
      if (!relatedFiles['.dbf']) {
        throw new Error('Missing required .dbf file for shapefile');
      }

      // Create array buffers for both .shp and .dbf files
      const shpBuffer = await file.arrayBuffer();
      const dbfBuffer = await relatedFiles['.dbf'].arrayBuffer();

      // Read features
      const features = await this.readFeatures(shpBuffer, dbfBuffer);

      // Extract layers (in shapefiles, there's typically one layer)
      const layers = ['default'];

      // Calculate bounds from features
      const bounds = this.calculateBounds(features);

      // Generate preview with a sample of features
      const preview: GeoFeatureCollection = {
        type: 'FeatureCollection',
        features: features.slice(0, 100),
      };

      return {
        layers,
        coordinateSystem: 'EPSG:4326', // Shapefiles typically use WGS84
        bounds,
        preview,
      };
    } catch (error) {
      console.error('Shapefile analysis error:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to analyze shapefile');
    }
  }

  async load(file: File, options: LoaderOptions): Promise<LoaderResult> {
    try {
      // Get related files from the custom property we set in FileItem
      const relatedFiles = (file as any).relatedFiles || {};
      if (!relatedFiles['.dbf']) {
        throw new Error('Missing required .dbf file for shapefile');
      }

      // Create array buffers for both .shp and .dbf files
      const shpBuffer = await file.arrayBuffer();
      const dbfBuffer = await relatedFiles['.dbf'].arrayBuffer();

      // Read all features
      const features = await this.readFeatures(shpBuffer, dbfBuffer);

      // Process features
      const featureTypes: Record<string, number> = {};
      features.forEach(feature => {
        // Optionally remove attributes based on `importAttributes`
        if (!options.importAttributes) {
          feature.properties = {};
        }

        // Count feature types
        const type = feature.geometry.type;
        featureTypes[type] = (featureTypes[type] || 0) + 1;
      });

      // Calculate bounds from all features
      const bounds = this.calculateBounds(features);

      return {
        features,
        bounds,
        layers: ['default'],
        coordinateSystem: options.coordinateSystem || 'EPSG:4326',
        statistics: {
          pointCount: features.length,
          layerCount: 1,
          featureTypes,
        },
      };
    } catch (error) {
      console.error('Shapefile loading error:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to load shapefile');
    }
  }

  private getFeatureBounds(feature: GeoFeature): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const coords = feature.geometry.coordinates;
    if (feature.geometry.type === 'Point' && Array.isArray(coords) && coords.length >= 2) {
      const x = coords[0] as number;
      const y = coords[1] as number;
      minX = maxX = x;
      minY = maxY = y;
    } else if (feature.geometry.type === 'LineString' && Array.isArray(coords)) {
      coords.forEach((coord) => {
        if (Array.isArray(coord) && coord.length >= 2) {
          const x = coord[0] as number;
          const y = coord[1] as number;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      });
    } else if (feature.geometry.type === 'Polygon' && Array.isArray(coords)) {
      coords.forEach((ring) => {
        if (Array.isArray(ring)) {
          ring.forEach((coord) => {
            if (Array.isArray(coord) && coord.length >= 2) {
              const x = coord[0] as number;
              const y = coord[1] as number;
              minX = Math.min(minX, x);
              minY = Math.min(minY, y);
              maxX = Math.max(maxX, x);
              maxY = Math.max(maxY, y);
            }
          });
        }
      });
    }

    return { minX, minY, maxX, maxY };
  }

  private calculateBounds(features: GeoFeature[]): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    features.forEach((feature) => {
      const bounds = this.getFeatureBounds(feature);
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    });

    return { minX, minY, maxX, maxY };
  }
}

export default new ShapefileLoader();
