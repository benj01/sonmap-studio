import { GeoFeature, Point } from '../../../../types/geo';

/**
 * Optimizes point features by reducing the number of points based on a tolerance value.
 * Used for improving performance when displaying large point datasets.
 * 
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

/**
 * Configuration options for feature optimization
 */
export interface OptimizationOptions {
    /** Value between 0 and 100 determining how aggressively to reduce points */
    pointTolerance?: number;
    /** Minimum distance between points (in coordinate units) */
    minDistance?: number;
    /** Maximum number of features to process at once */
    batchSize?: number;
}

/**
 * Enhanced optimization function with additional options and streaming support
 */
export async function* optimizeFeaturesStream(
    features: AsyncIterable<GeoFeature> | Iterable<GeoFeature>,
    options: OptimizationOptions = {}
): AsyncGenerator<GeoFeature> {
    const {
        pointTolerance = 0,
        minDistance = 0,
        batchSize = 1000
    } = options;

    let batch: GeoFeature[] = [];
    
    for await (const feature of features) {
        batch.push(feature);
        
        if (batch.length >= batchSize) {
            // Process and yield the batch
            const optimized = optimizePoints(batch, pointTolerance);
            for (const feat of optimized) {
                yield feat;
            }
            batch = [];
        }
    }

    // Process any remaining features
    if (batch.length > 0) {
        const optimized = optimizePoints(batch, pointTolerance);
        for (const feat of optimized) {
            yield feat;
        }
    }
}
