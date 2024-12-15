import { GeoFeature, Point } from '../../../types/geo';

/**
 * Optimizes point features by reducing the number of points based on a tolerance value
 * @param features Array of GeoJSON features to optimize
 * @param tolerance Value between 0 and 100 determining how aggressively to reduce points
 * @returns Optimized array of features
 */
export function optimizePoints(features: GeoFeature[], tolerance: number): GeoFeature[] {
    if (tolerance <= 0) {
        return features;
    }

    // Only optimize Point features
    const pointFeatures = features.filter(
        (feature): feature is GeoFeature & { geometry: Point } => 
        feature.geometry.type === 'Point'
    );
    const otherFeatures = features.filter(feature => feature.geometry.type !== 'Point');

    const skipFactor = Math.max(1, Math.ceil((tolerance / 100) * pointFeatures.length));
    const simplifiedFeatures: GeoFeature[] = [];

    // Keep every nth point feature
    for (let i = 0; i < pointFeatures.length; i += skipFactor) {
        simplifiedFeatures.push(pointFeatures[i]);
    }

    // Add back all non-point features
    return [...simplifiedFeatures, ...otherFeatures];
}
