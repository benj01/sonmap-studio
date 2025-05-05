import { dbLogger } from '@/utils/logging/dbLogger';
import { GeoFeature } from '@/types/geo';
import {
  FeatureProcessor,
  ProcessingContext,
  ProcessingResult,
  PropertyValidator as PropertyValidatorConfig,
  PropertyValidationResult
} from './types';

export class PropertyValidator implements FeatureProcessor {
  async process(feature: GeoFeature, context: ProcessingContext): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      feature: { ...feature },
      isValid: true,
      wasRepaired: false,
      warnings: [],
      errors: []
    };

    if (!context.propertyValidation) {
      return result;
    }

    try {
      const validationResult = this.validateProperties(
        feature.properties,
        context.propertyValidation,
        context.propertyMapping
      );

      if (!validationResult.isValid) {
        result.isValid = false;
        result.errors.push(...validationResult.errors);
        result.warnings.push(...validationResult.warnings);

        if (validationResult.transformedProperties) {
          result.feature.properties = validationResult.transformedProperties;
          result.wasRepaired = true;
        }
      } else if (validationResult.transformedProperties) {
        // Apply transformed properties even if validation passed (for mapping)
        result.feature.properties = validationResult.transformedProperties;
        result.wasRepaired = true;
      }
    } catch (error: unknown) {
      result.isValid = false;
      const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown error';
      result.errors.push(`Property validation failed: ${errorMessage}`);
      await dbLogger.error('Property validation failed', {
        error: errorMessage,
        featureId: feature.id
      }, { featureId: feature.id });
    }

    return result;
  }

  private validateProperties(
    properties: Record<string, unknown>,
    validators: Record<string, PropertyValidatorConfig>,
    mapping?: Record<string, string>
  ): PropertyValidationResult {
    const result: PropertyValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      transformedProperties: { ...properties }
    };

    // Apply property mapping if provided
    if (mapping) {
      const mapped: Record<string, unknown> = {};
      for (const [oldKey, newKey] of Object.entries(mapping)) {
        if (oldKey in properties) {
          mapped[newKey] = properties[oldKey];
        }
      }
      result.transformedProperties = mapped;
    }

    // Validate properties
    const transformedProps = result.transformedProperties ?? {};
    for (const [key, validator] of Object.entries(validators)) {
      const value = transformedProps[key];

      // Check required fields
      if (validator.required && (value === undefined || value === null)) {
        result.isValid = false;
        result.errors.push(`Missing required property: ${key}`);
        continue;
      }

      // Skip validation for optional undefined fields
      if (value === undefined || value === null) {
        continue;
      }

      // Validate based on type
      switch (validator.type) {
        case 'string':
          if (typeof value !== 'string') {
            result.isValid = false;
            result.errors.push(`Property ${key} must be a string`);
            continue;
          }

          if (validator.minLength !== undefined && value.length < validator.minLength) {
            result.isValid = false;
            result.errors.push(`Property ${key} must be at least ${validator.minLength} characters long`);
          }

          if (validator.maxLength !== undefined && value.length > validator.maxLength) {
            result.isValid = false;
            result.errors.push(`Property ${key} must be at most ${validator.maxLength} characters long`);
          }

          if (validator.pattern && !new RegExp(validator.pattern).test(value)) {
            result.isValid = false;
            result.errors.push(`Property ${key} must match pattern: ${validator.pattern}`);
          }
          break;

        case 'number':
          if (typeof value !== 'number' || isNaN(value)) {
            result.isValid = false;
            result.errors.push(`Property ${key} must be a number`);
            continue;
          }

          if (validator.min !== undefined && value < validator.min) {
            result.isValid = false;
            result.errors.push(`Property ${key} must be greater than or equal to ${validator.min}`);
          }

          if (validator.max !== undefined && value > validator.max) {
            result.isValid = false;
            result.errors.push(`Property ${key} must be less than or equal to ${validator.max}`);
          }
          break;

        case 'boolean':
          if (typeof value !== 'boolean') {
            result.isValid = false;
            result.errors.push(`Property ${key} must be a boolean`);
          }
          break;

        case 'date': {
          const date = new Date(value);
          if (isNaN(date.getTime())) {
            result.isValid = false;
            result.errors.push(`Property ${key} must be a valid date`);
          }
          break;
        }
      }

      // Validate enum values
      if (validator.enum && !validator.enum.includes(value)) {
        result.isValid = false;
        result.errors.push(`Property ${key} must be one of: ${validator.enum.join(', ')}`);
      }
    }

    return result;
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