// components/geo-loader/preview/feature-sampler.ts

import { Feature } from 'geojson';

interface SamplingOptions {
  maxFeatures?: number;
  preserveBoundaries?: boolean;
  preserveWarnings?: boolean;
  minDistance?: number;
}

export class FeatureSampler {
  private options: Required<SamplingOptions>;

  constructor(options: SamplingOptions = {}) {
    this.options = {
      maxFeatures: 5000,
      preserveBoundaries: true,
      preserveWarnings: true,
      minDistance: 0,
      ...options
    };
  }

  sampleFeatures(features: Feature[], layerKey?: string): Feature[] {
    if (features.length <= this.options.maxFeatures) {
      return features;
    }

    const sampled: Feature[] = [];
    const preserved: Feature[] = [];

    // First, preserve features with warnings if needed
    if (this.options.preserveWarnings) {
      features.forEach(feature => {
        if (feature.properties?.hasWarning) {
          preserved.push(feature);
        }
      });
    }

    // Then, preserve boundary features if needed
    if (this.options.preserveBoundaries) {
      const bounds = this.calculateBounds(features);
      features.forEach(feature => {
        if (this.isOnBoundary(feature, bounds)) {
          preserved.push(feature);
        }
      });
    }

    // Calculate how many regular features we can include
    const remainingSlots = this.options.maxFeatures - preserved.length;
    if (remainingSlots <= 0) {
      return preserved;
    }

    // Sample remaining features
    const regularFeatures = features.filter(f => !preserved.includes(f));
    const samplingInterval = Math.max(1, Math.floor(regularFeatures.length / remainingSlots));
    
    for (let i = 0; i < regularFeatures.length; i += samplingInterval) {
      sampled.push(regularFeatures[i]);
    }

    // Combine preserved and sampled features
    return [...preserved, ...sampled];
  }

  private calculateBounds(features: Feature[]): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    features.forEach(feature => {
      const bbox = feature.bbox;
      if (bbox) {
        minX = Math.min(minX, bbox[0]);
        minY = Math.min(minY, bbox[1]);
        maxX = Math.max(maxX, bbox[2]);
        maxY = Math.max(maxY, bbox[3]);
      }
    });

    return { minX, minY, maxX, maxY };
  }

  private isOnBoundary(feature: Feature, bounds: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
    const bbox = feature.bbox;
    if (!bbox) return false;

    const tolerance = 0.001 * Math.max(
      bounds.maxX - bounds.minX,
      bounds.maxY - bounds.minY
    );

    return (
      Math.abs(bbox[0] - bounds.minX) < tolerance ||
      Math.abs(bbox[1] - bounds.minY) < tolerance ||
      Math.abs(bbox[2] - bounds.maxX) < tolerance ||
      Math.abs(bbox[3] - bounds.maxY) < tolerance
    );
  }
}

export function createFeatureSampler(options?: SamplingOptions): FeatureSampler {
  return new FeatureSampler(options);
}