import { createLogger } from '@/utils/logger';
import { GeoFeature } from '@/types/geo';
import { FeatureProcessor, ProcessingContext, ProcessingResult } from './types';
import { CoordinateTransformer } from './coordinate-transformer';
import { GeometryValidator } from './geometry-validator';
import { PropertyValidator } from './property-validator';

const logger = createLogger('FeatureProcessingPipeline');

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
          logger.warn('Feature processing stopped due to unrecoverable error', {
            featureId: feature.id,
            errors: processorResult.errors
          });
          break;
        }
      }

      result.feature = currentFeature;
    } catch (error: any) {
      result.isValid = false;
      result.errors.push(`Pipeline processing failed: ${error?.message || 'Unknown error'}`);
      logger.error('Pipeline processing failed', {
        error: error?.message || 'Unknown error',
        featureId: feature.id
      });
    }

    return result;
  }

  async processFeatures(features: GeoFeature[], context: ProcessingContext): Promise<ProcessingResult[]> {
    logger.info('Starting batch feature processing', {
      featureCount: features.length,
      context
    });

    const results = await Promise.all(
      features.map(async (feature) => {
        try {
          return await this.processFeature(feature, context);
        } catch (error: any) {
          logger.error('Feature processing failed', {
            error: error?.message || 'Unknown error',
            featureId: feature.id
          });
          return {
            feature,
            isValid: false,
            wasRepaired: false,
            warnings: [],
            errors: [`Processing failed: ${error?.message || 'Unknown error'}`]
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

    logger.info('Batch feature processing completed', { summary });
    return results;
  }
} 