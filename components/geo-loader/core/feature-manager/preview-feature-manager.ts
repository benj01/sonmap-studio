import { Feature, FeatureCollection, Geometry, Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon } from 'geojson';
import type { PreviewOptions, PreviewCollectionResult } from '../../preview/types';
import { Bounds } from './bounds';
import { GeoFeature } from '../../types/geo-feature';
import { COORDINATE_SYSTEMS } from '../../types/coordinates';

const DEFAULT_MAX_FEATURES = 5000;

type SupportedGeometry = Point | LineString | Polygon | MultiPoint | MultiLineString | MultiPolygon;

export class PreviewFeatureManager {
  private featureBounds: Map<GeoFeature, Bounds> = new Map();
  private options: PreviewOptions;

  constructor(options: PreviewOptions = {}) {
    this.options = {
      enableCaching: options.enableCaching ?? true,
      smartSampling: options.smartSampling ?? true,
      maxFeatures: options.maxFeatures ?? DEFAULT_MAX_FEATURES
    };
  }

  private isValidGeometry(geometry: Geometry | null): geometry is SupportedGeometry {
    if (!geometry) return false;
    return ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'].includes(geometry.type);
  }

  private async processFeatures(features: GeoFeature[]): Promise<PreviewCollectionResult> {
    const points: Feature[] = [];
    const lines: Feature[] = [];
    const polygons: Feature[] = [];
    let totalCount = 0;

    for (const feature of features) {
      if (!this.isValidGeometry(feature.geometry)) continue;

      switch (feature.geometry.type) {
        case 'Point':
        case 'MultiPoint':
          points.push(feature);
          break;
        case 'LineString':
        case 'MultiLineString':
          lines.push(feature);
          break;
        case 'Polygon':
        case 'MultiPolygon':
          polygons.push(feature);
          break;
      }
      totalCount++;
    }

    return {
      points: { type: 'FeatureCollection', features: points },
      lines: { type: 'FeatureCollection', features: lines },
      polygons: { type: 'FeatureCollection', features: polygons },
      totalCount,
      bounds: {
        minX: -180,
        minY: -90,
        maxX: 180,
        maxY: 90
      },
      coordinateSystem: COORDINATE_SYSTEMS.WGS84,
      timestamp: Date.now()
    };
  }
}