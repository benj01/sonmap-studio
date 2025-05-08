import type { FullDataset } from '@/types/geo-import';
import simplify from '@turf/simplify';
import kinks from '@turf/kinks';
import buffer from '@turf/buffer';
import type { Feature, Geometry, Polygon, MultiPolygon } from 'geojson';
import { dbLogger } from '@/utils/logging/dbLogger';

const DEFAULT_CONFIG: Required<PreviewConfig> = {
  maxFeatures: 500,
  simplificationTolerance: 0.0001,
  randomSampling: true,
  chunkSize: 100
};

const SOURCE = 'PreviewGenerator';

interface ValidationResult {
  hasIssues: boolean;
  issues: string[];
}

// Local type definitions for preview generation
export interface PreviewConfig {
  maxFeatures: number;
  simplificationTolerance: number;
  randomSampling: boolean;
  chunkSize: number;
}

export interface PreviewFeature {
  id: number;
  previewId: number;
  originalFeatureIndex: number;
  geometry: Geometry;
  properties: Record<string, unknown> & {
    wasRepaired: boolean;
    wasCleaned: boolean;
    validation?: ValidationResult;
  };
}

export interface PreviewDataset {
  sourceFile: string;
  features: PreviewFeature[];
  metadata: {
    featureCount: number;
    bounds?: [number, number, number, number];
    geometryTypes: string[];
    properties: string[];
    srid?: number;
    validationSummary?: {
      featuresWithIssues: number;
      totalFeatures: number;
    };
  };
}

/**
 * Validates and repairs a polygon geometry with timeout protection
 */
export async function validateAndRepairGeometry(geometry: Geometry): Promise<{ 
  geometry: Geometry | null; 
  wasRepaired: boolean;
  wasCleaned: boolean;
  error?: string;
}> {
  // Skip validation for non-polygon geometries
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
    return { geometry, wasRepaired: false, wasCleaned: false };
  }

  // Check geometry complexity
  const pointCount = geometry.type === 'Polygon' 
    ? geometry.coordinates.reduce((sum, ring) => sum + ring.length, 0)
    : geometry.coordinates.reduce((sum, poly) => sum + poly.reduce((s, ring) => s + ring.length, 0), 0);

  // Skip validation for very complex geometries (more than 1000 points)
  if (pointCount > 1000) {
    await dbLogger.warn('Skipping validation for complex geometry', { pointCount }, { source: SOURCE });
    return { geometry, wasRepaired: false, wasCleaned: false };
  }

  try {
    const feature: Feature<Polygon | MultiPolygon> = {
      type: 'Feature',
      geometry: geometry as Polygon | MultiPolygon,
      properties: {}
    };

    // First clean duplicate vertices with a small tolerance
    let cleaned = feature;
    let wasCleaned = false;

    try {
      // Function to clean near-duplicate points within a tolerance
      const cleanWithTolerance = (coords: number[][]): number[][] => {
        const tolerance = 0.0000002; // About 2cm in degrees at Swiss latitude
        const result: number[][] = [];
        let lastPoint: number[] | null = null;

        for (const point of coords) {
          if (!lastPoint) {
            result.push(point);
            lastPoint = point;
            continue;
          }

          // Check if point is too close to last point
          const dx = point[0] - lastPoint[0];
          const dy = point[1] - lastPoint[1];
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance > tolerance) {
            result.push(point);
            lastPoint = point;
          }
        }

        // Ensure the ring is closed
        if (result.length > 0 && result[0].length === 2) {
          result.push([...result[0]]);
        }

        return result;
      };

      // Clean each ring of the polygon
      if (geometry.type === 'Polygon') {
        const cleanedCoords = geometry.coordinates.map(ring => cleanWithTolerance(ring));
        cleaned = {
          ...feature,
          geometry: {
            type: 'Polygon',
            coordinates: cleanedCoords
          }
        };
      } else {
        const cleanedCoords = geometry.coordinates.map(poly => 
          poly.map(ring => cleanWithTolerance(ring))
        );
        cleaned = {
          ...feature,
          geometry: {
            type: 'MultiPolygon',
            coordinates: cleanedCoords
          }
        };
      }

      // Check if cleaning made any changes
      wasCleaned = JSON.stringify(cleaned.geometry) !== JSON.stringify(feature.geometry);
      
      if (wasCleaned) {
        await dbLogger.info('Cleaned duplicate/near-duplicate vertices from geometry', {}, { source: SOURCE });
      }
    } catch (error) {
      await dbLogger.warn('Failed to clean vertices', { error }, { source: SOURCE });
      cleaned = feature;
    }

    // Check for self-intersections with timeout protection
    let intersections: GeoJSON.FeatureCollection;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout checking for self-intersections')), 1000);
      });
      
      const kinksPromise = Promise.resolve(kinks(cleaned.geometry));
      intersections = await Promise.race([timeoutPromise, kinksPromise]);
    } catch (error) {
      await dbLogger.warn('Failed or timed out checking for self-intersections', { error }, { source: SOURCE });
      return { 
        geometry: cleaned.geometry,
        wasRepaired: false,
        wasCleaned
      };
    }
    
    if (intersections.features.length > 0) {
      await dbLogger.info('Found self-intersections in geometry', {
        intersectionCount: intersections.features.length
      }, { source: SOURCE });

      try {
        // Try to repair using buffer with a small value
        const buffered = buffer(cleaned, 0.00002, { units: 'degrees' });
        if (!buffered) {
          return { 
            geometry: null, 
            wasRepaired: false,
            wasCleaned,
            error: 'Failed to repair self-intersecting polygon' 
          };
        }

        return { 
          geometry: buffered.geometry as Geometry, 
          wasRepaired: true,
          wasCleaned 
        };
      } catch (error) {
        await dbLogger.warn('Failed to repair geometry', { error }, { source: SOURCE });
        return { 
          geometry: cleaned.geometry,
          wasRepaired: false,
          wasCleaned
        };
      }
    }

    return { 
      geometry: cleaned.geometry, 
      wasRepaired: false,
      wasCleaned
    };

  } catch (error) {
    await dbLogger.warn('Failed to validate/repair geometry', { error }, { source: SOURCE });
    return { 
      geometry: null, 
      wasRepaired: false,
      wasCleaned: false
    };
  }
}

/**
 * Validates a geometry and returns any issues found
 */
async function validateGeometry(geometry: Geometry): Promise<ValidationResult> {
  const issues: string[] = [];
  
  // Check for self-intersections in polygons
  if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
    const feature: Feature<Polygon | MultiPolygon> = {
      type: 'Feature',
      geometry: geometry as Polygon | MultiPolygon,
      properties: {}
    };
    
    try {
      const intersections = kinks(feature);
      if (intersections.features.length > 0) {
        issues.push(`Has ${intersections.features.length} self-intersection${intersections.features.length > 1 ? 's' : ''}`);
      }
    } catch (error) {
      await dbLogger.warn('Failed to check for self-intersections', { error }, { source: SOURCE });
      issues.push('Failed to validate geometry');
    }
  }

  // Check for degenerate geometries
  if (geometry.type === 'Polygon') {
    const exteriorRing = geometry.coordinates[0];
    if (exteriorRing.length < 4) {
      issues.push('Polygon has less than 3 points');
    }
  } else if (geometry.type === 'MultiPolygon') {
    geometry.coordinates.forEach((polygon, i) => {
      if (polygon[0].length < 4) {
        issues.push(`Part ${i + 1} has less than 3 points`);
      }
    });
  }

  return {
    hasIssues: issues.length > 0,
    issues
  };
}

/**
 * Simplifies a GeoJSON geometry using the Douglas-Peucker algorithm
 */
async function simplifyGeometry(geometry: Geometry, tolerance: number): Promise<Geometry> {
  try {
    const feature: Feature = {
      type: 'Feature',
      geometry,
      properties: {}
    };
    
    const simplified = simplify(feature, { tolerance });
    return simplified.geometry;
  } catch (error) {
    await dbLogger.warn('Failed to simplify geometry', { error, geometryType: geometry.type }, { source: SOURCE });
    return geometry;
  }
}

/**
 * Samples features from a dataset
 */
async function sampleFeatures(features: Feature[], maxFeatures: number, random: boolean): Promise<Feature[]> {
  if (features.length <= maxFeatures) {
    await dbLogger.info('No sampling needed, feature count within limit', {
      featureCount: features.length,
      maxFeatures
    }, { source: SOURCE });
    return features;
  }

  await dbLogger.info('Sampling features', {
    totalFeatures: features.length,
    targetCount: maxFeatures,
    method: random ? 'random' : 'systematic'
  }, { source: SOURCE });

  let sampledFeatures: Feature[];
  if (random) {
    // Random sampling
    const indices = new Set<number>();
    while (indices.size < maxFeatures) {
      indices.add(Math.floor(Math.random() * features.length));
    }
    sampledFeatures = Array.from(indices).map(i => features[i]);
  } else {
    // Systematic sampling
    const step = Math.ceil(features.length / maxFeatures);
    sampledFeatures = features.filter((_, i) => i % step === 0);
  }

  await dbLogger.info('Sampling complete', {
    sampledCount: sampledFeatures.length,
    reductionRatio: (sampledFeatures.length / features.length).toFixed(2)
  }, { source: SOURCE });

  return sampledFeatures;
}

/**
 * Process features in chunks to avoid blocking the UI
 */
async function processChunks(
  features: Feature[],
  tolerance: number,
  chunkSize: number,
  onChunkProcessed?: (chunk: PreviewFeature[]) => void
): Promise<{ 
  features: PreviewFeature[];
  stats: { 
    processed: number;
    repaired: number;
    cleaned: number;
    failed: number;
    simplified: number;
    withIssues: number;
  };
}> {
  const chunks: Feature[][] = [];
  for (let i = 0; i < features.length; i += chunkSize) {
    chunks.push(features.slice(i, i + chunkSize));
  }

  const results: PreviewFeature[] = [];
  let repairedCount = 0;
  let cleanedCount = 0;
  let failedCount = 0;
  let simplifiedCount = 0;
  let issuesCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkResults = await Promise.all(chunk.map(async (feature, index) => {
      try {
        // First validate and repair if necessary
        const { geometry: repairedGeometry, wasRepaired, wasCleaned, error } = await validateAndRepairGeometry(feature.geometry);
        
        if (error || !repairedGeometry) {
          await dbLogger.warn('Geometry repair failed', { 
            featureId: feature.id, 
            error 
          }, { source: SOURCE });
          failedCount++;
          return null;
        }

        if (wasRepaired) {
          repairedCount++;
          await dbLogger.info('Geometry repaired', { featureId: feature.id }, { source: SOURCE });
        }

        if (wasCleaned) {
          cleanedCount++;
          await dbLogger.info('Geometry cleaned', { featureId: feature.id }, { source: SOURCE });
        }

        // Then simplify the repaired geometry
        const simplifiedGeometry = await simplifyGeometry(repairedGeometry, tolerance);
        if (JSON.stringify(simplifiedGeometry) !== JSON.stringify(repairedGeometry)) {
          simplifiedCount++;
        }
        
        // Validate the simplified geometry
        const validation = await validateGeometry(simplifiedGeometry);
        if (validation.hasIssues) {
          issuesCount++;
        }
        
        const processedFeature: PreviewFeature = {
          id: feature.id as number,
          previewId: i * chunkSize + index,
          originalFeatureIndex: feature.id as number,
          geometry: simplifiedGeometry,
          properties: {
            ...feature.properties || {},
            wasRepaired: wasRepaired || false,
            wasCleaned: wasCleaned || false,
            validation
          }
        };

        return processedFeature;
      } catch (error) {
        await dbLogger.warn('Failed to process feature', { featureId: feature.id, error }, { source: SOURCE });
        failedCount++;
        return null;
      }
    }));

    // Filter out null results from failed processing
    const validResults = chunkResults.filter((result): result is PreviewFeature => result !== null);
    results.push(...validResults);
    
    if (onChunkProcessed) {
      onChunkProcessed(validResults);
    }

    // Allow UI to update between chunks
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  await dbLogger.info('Chunk processing complete', {
    totalFeatures: features.length,
    processedFeatures: results.length,
    repairedCount,
    cleanedCount,
    failedCount,
    simplifiedCount,
    issuesCount
  }, { source: SOURCE });

  return {
    features: results,
    stats: {
      processed: results.length,
      repaired: repairedCount,
      cleaned: cleanedCount,
      failed: failedCount,
      simplified: simplifiedCount,
      withIssues: issuesCount
    }
  };
}

/**
 * Generates a preview dataset from a full dataset
 */
export async function generatePreview(
  dataset: FullDataset,
  config: Partial<PreviewConfig> = {},
  onProgress?: (features: PreviewFeature[]) => void
): Promise<PreviewDataset & { 
  stats?: { 
    processed: number; 
    repaired: number; 
    failed: number; 
    simplified: number;
    withIssues: number;
  }; 
}> {
  await dbLogger.info('Starting preview generation', {
    sourceDataset: {
      featureCount: dataset.features.length,
      geometryTypes: dataset.metadata?.geometryTypes,
      sourceFile: dataset.sourceFile
    },
    config
  }, { source: SOURCE });

  const finalConfig: Required<PreviewConfig> = {
    ...DEFAULT_CONFIG,
    ...config,
    simplificationTolerance: config.simplificationTolerance || DEFAULT_CONFIG.simplificationTolerance,
    maxFeatures: config.maxFeatures || DEFAULT_CONFIG.maxFeatures,
    randomSampling: config.randomSampling ?? DEFAULT_CONFIG.randomSampling,
    chunkSize: config.chunkSize || DEFAULT_CONFIG.chunkSize
  };

  await dbLogger.info('Using configuration', finalConfig, { source: SOURCE });

  // Sample features
  const sampledFeatures = await sampleFeatures(
    dataset.features.map(f => ({
      type: 'Feature' as const,
      geometry: f.geometry,
      properties: f.properties || {},
      id: f.id
    })),
    finalConfig.maxFeatures,
    finalConfig.randomSampling
  );

  // Process features in chunks
  const startTime = Date.now();
  const { features: previewFeatures, stats } = await processChunks(
    sampledFeatures,
    finalConfig.simplificationTolerance,
    finalConfig.chunkSize,
    onProgress
  );

  const processingTime = Date.now() - startTime;
  await dbLogger.info('Preview generation complete', {
    originalFeatures: dataset.features.length,
    previewFeatures: previewFeatures.length,
    processingTimeMs: processingTime,
    stats
  }, { source: SOURCE });

  return {
    sourceFile: dataset.sourceFile,
    features: previewFeatures,
    metadata: {
      ...dataset.metadata,
      featureCount: dataset.metadata?.featureCount || previewFeatures.length,
      bounds: dataset.metadata?.bounds,
      geometryTypes: dataset.metadata?.geometryTypes || [],
      properties: dataset.metadata?.properties || [],
      srid: dataset.metadata?.srid,
      validationSummary: {
        featuresWithIssues: stats.withIssues,
        totalFeatures: stats.processed
      }
    },
    stats
  };
} 