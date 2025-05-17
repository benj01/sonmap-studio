import { dbLogger } from '@/utils/logging/dbLogger';
import { GeoFeature } from '@/types/geo';
import { FeatureProcessor, ProcessingContext, ProcessingResult } from './types';
import { CoordinateTransformer } from './coordinate-transformer';
import { GeometryValidator } from './geometry-validator';
import { PropertyValidator } from './property-validator';

export class FeatureProcessingPipeline {
  private processors: FeatureProcessor[];

  constructor() {
    // Initialize processors in the desired order
    this.processors = [
      new CoordinateTransformer(),
      new GeometryValidator(),
      new PropertyValidator()
    ];
  }

  async processFeature(feature: GeoFeature, context: ProcessingContext): Promise<ProcessingResult> {
    let currentFeature = { ...feature };
    const result: ProcessingResult = {
      feature: currentFeature,
      isValid: true,
      wasRepaired: false,
      warnings: [],
      errors: []
    };

    try {
      for (const processor of this.processors) {
        const processorResult = await processor.process(currentFeature, context);
        
        // Accumulate warnings and errors
        result.warnings.push(...processorResult.warnings);
        result.errors.push(...processorResult.errors);
        
        // Update validity and repair status
        result.isValid = result.isValid && processorResult.isValid;
        result.wasRepaired = result.wasRepaired || processorResult.wasRepaired;

        // Update feature for next processor
        currentFeature = processorResult.feature;

        // Stop processing if feature is invalid and not repaired
        if (!processorResult.isValid && !processorResult.wasRepaired) {
          await dbLogger.warn('Feature processing stopped due to unrecoverable error', {
            featureId: feature.id,
            errors: processorResult.errors
          }, { source: 'FeatureProcessingPipeline', featureId: feature.id });
          break;
        }
      }

      result.feature = currentFeature;
    } catch (error: unknown) {
      result.isValid = false;
      const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown error';
      result.errors.push(`Pipeline processing failed: ${errorMessage}`);
      await dbLogger.error('Pipeline processing failed', {
        error: errorMessage,
        featureId: feature.id
      }, { source: 'FeatureProcessingPipeline', featureId: feature.id });
    }

    return result;
  }

  async processFeatures(features: GeoFeature[], context: ProcessingContext): Promise<ProcessingResult[]> {
    await dbLogger.info('Starting batch feature processing', {
      featureCount: features.length,
      context
    }, { source: 'FeatureProcessingPipeline' });

    const results = await Promise.all(
      features.map(async (feature) => {
        try {
          return await this.processFeature(feature, context);
        } catch (error: unknown) {
          const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown error';
          await dbLogger.error('Feature processing failed', {
            error: errorMessage,
            featureId: feature.id
          }, { source: 'FeatureProcessingPipeline', featureId: feature.id });
          return {
            feature,
            isValid: false,
            wasRepaired: false,
            warnings: [],
            errors: [`Processing failed: ${errorMessage}`]
          };
        }
      })
    );

    const summary = {
      total: features.length,
      valid: results.filter(r => r.isValid).length,
      repaired: results.filter(r => r.wasRepaired).length,
      failed: results.filter(r => !r.isValid && !r.wasRepaired).length
    };

    await dbLogger.info('Batch feature processing completed', { summary }, { source: 'FeatureProcessingPipeline', total: summary.total });
    return results;
  }
}

function isErrorWithMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
} 