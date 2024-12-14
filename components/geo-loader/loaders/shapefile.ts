// components/geo-loader/loaders/shapefile.ts

import * as shapefile from 'shapefile';
import { GeoFileLoader, LoaderOptions, LoaderResult, GeoFeature, GeoFeatureCollection } from '../../../types/geo';
import { CoordinateTransformer } from '../utils/coordinate-systems';

class ShapefileLoader implements GeoFileLoader {
  async canLoad(file: File): Promise<boolean> {
    return file.name.toLowerCase().endsWith('.shp');
  }

  async analyze(file: File) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const source = await shapefile.open(arrayBuffer);
      const header = await source.header;
      
      // Extract layers (in shapefiles, there's typically one layer)
      const layers = ['default'];

      // Calculate bounds
      const bounds = {
        minX: header.bbox[0],
        minY: header.bbox[1],
        maxX: header.bbox[2],
        maxY: header.bbox[3]
      };

      // Generate preview with a sample of features
      const preview: GeoFeatureCollection = {
        type: 'FeatureCollection',
        features: []
      };

      // Read a sample of features for preview
      let count = 0;
      let feature;
      while (count < 100 && (feature = await source.read())) {
        preview.features.push(feature.value as GeoFeature);
        count++;
      }

      return {
        layers,
        coordinateSystem: 'EPSG:4326', // Shapefiles typically use WGS84
        bounds,
        preview
      };
    } catch (error) {
      console.error('Shapefile analysis error:', error);
      throw new Error('Failed to analyze shapefile');
    }
  }

  async load(file: File, options: LoaderOptions): Promise<LoaderResult> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const source = await shapefile.open(arrayBuffer);
      const features: GeoFeature[] = [];
      const featureTypes: Record<string, number> = {};

      // Read all features
      let feature;
      while ((feature = await source.read())) {
        const geoFeature = feature.value as GeoFeature;
        features.push(geoFeature);

        // Count feature types
        const type = geoFeature.geometry.type;
        featureTypes[type] = (featureTypes[type] || 0) + 1;
      }

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
          featureTypes
        }
      };
    } catch (error) {
      console.error('Shapefile loading error:', error);
      throw new Error('Failed to load shapefile');
    }
  }

  private calculateBounds(features: GeoFeature[]): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    features.forEach(feature => {
      const coords = feature.geometry.coordinates;
      if (feature.geometry.type === 'Point' && Array.isArray(coords) && coords.length >= 2) {
        const x = coords[0] as number;
        const y = coords[1] as number;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      } else if (feature.geometry.type === 'LineString' && Array.isArray(coords)) {
        coords.forEach(coord => {
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
        coords.forEach(ring => {
          if (Array.isArray(ring)) {
            ring.forEach(coord => {
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
    });

    return { minX, minY, maxX, maxY };
  }
}

export default new ShapefileLoader();
