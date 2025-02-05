import {
  SiaLayer,
  SiaLayerKey,
  SiaValidationResult,
  SiaValidationError,
  SiaValidationWarning,
  SiaErrorCode,
  SiaWarningCode,
  SIA_PREFIXES,
  SiaPrefix
} from '../../types/sia';

/**
 * Validator for SIA 2014 layer names and structures
 */
export class SiaValidator {
  private static readonly LAYER_KEY_PATTERN = /^_([a-z])_([^_]+)$/;
  private static readonly MANDATORY_PREFIXES = [SIA_PREFIXES.AGENT, SIA_PREFIXES.ELEMENT, SIA_PREFIXES.PRESENTATION];
  private static readonly HIERARCHICAL_CODE_PATTERN = /^[A-Z]\d{2}(\d{2})?$/;

  /**
   * Validates a complete layer name according to SIA 2014 standard
   */
  static validateLayerName(layerName: string): SiaValidationResult {
    const errors: SiaValidationError[] = [];
    const warnings: SiaValidationWarning[] = [];

    // Split layer name into components
    const components = layerName.split('_').filter(Boolean);
    
    // Check if we have at least the mandatory fields
    if (components.length < 6) { // 6 because each field needs prefix and content (_a_content)
      errors.push({
        code: SiaErrorCode.INVALID_LAYER_FORMAT,
        message: 'Layer name does not contain minimum required fields',
        value: layerName
      });
      return { isValid: false, errors, warnings };
    }

    // Parse and validate each component
    const layer: Partial<SiaLayer> = {};
    let currentPrefix: string | null = null;

    for (let i = 0; i < components.length; i += 2) {
      const prefix = components[i];
      const content = components[i + 1];

      if (!prefix || !content) {
        errors.push({
          code: SiaErrorCode.INVALID_LAYER_FORMAT,
          message: `Invalid layer component at position ${i}`,
          value: `${prefix}_${content}`
        });
        continue;
      }

      const validationResult = this.validateLayerComponent(prefix, content);
      errors.push(...validationResult.errors);
      warnings.push(...validationResult.warnings);

      // Store the component in the layer object
      const layerKey: SiaLayerKey = { prefix, content };
      switch (prefix) {
        case SIA_PREFIXES.AGENT:
          layer.agent = layerKey;
          break;
        case SIA_PREFIXES.ELEMENT:
          layer.element = layerKey;
          break;
        case SIA_PREFIXES.PRESENTATION:
          layer.presentation = layerKey;
          break;
        case SIA_PREFIXES.SCALE:
          layer.scale = layerKey;
          break;
        case SIA_PREFIXES.PHASE:
          layer.phase = layerKey;
          break;
        case SIA_PREFIXES.STATUS:
          layer.status = layerKey;
          break;
        case SIA_PREFIXES.LOCATION:
          layer.location = layerKey;
          break;
        case SIA_PREFIXES.PROJECTION:
          layer.projection = layerKey;
          break;
        default:
          if (!layer.freeTyping) layer.freeTyping = [];
          layer.freeTyping.push(layerKey);
      }
    }

    // Validate mandatory fields
    this.MANDATORY_PREFIXES.forEach(prefix => {
      if (!layer[this.prefixToKey(prefix)]) {
        errors.push({
          code: SiaErrorCode.MISSING_MANDATORY_FIELD,
          message: `Missing mandatory field: ${prefix}`,
          field: prefix
        });
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Parses a layer name into a SiaLayer object
   */
  static parseSiaLayer(layerName: string): SiaLayer | null {
    const validation = this.validateLayerName(layerName);
    if (!validation.isValid) {
      return null;
    }

    const components = layerName.split('_').filter(Boolean);
    const layer: Partial<SiaLayer> = {};

    for (let i = 0; i < components.length; i += 2) {
      const prefix = components[i];
      const content = components[i + 1];

      if (!prefix || !content) continue;

      const layerKey: SiaLayerKey = { prefix, content };
      switch (prefix) {
        case SIA_PREFIXES.AGENT:
          layer.agent = layerKey;
          break;
        case SIA_PREFIXES.ELEMENT:
          layer.element = layerKey;
          break;
        case SIA_PREFIXES.PRESENTATION:
          layer.presentation = layerKey;
          break;
        case SIA_PREFIXES.SCALE:
          layer.scale = layerKey;
          break;
        case SIA_PREFIXES.PHASE:
          layer.phase = layerKey;
          break;
        case SIA_PREFIXES.STATUS:
          layer.status = layerKey;
          break;
        case SIA_PREFIXES.LOCATION:
          layer.location = layerKey;
          break;
        case SIA_PREFIXES.PROJECTION:
          layer.projection = layerKey;
          break;
        default:
          if (!layer.freeTyping) layer.freeTyping = [];
          layer.freeTyping.push(layerKey);
      }
    }

    return layer as SiaLayer;
  }

  /**
   * Validates a single layer component (prefix and content)
   */
  private static validateLayerComponent(
    prefix: string,
    content: string
  ): SiaValidationResult {
    const errors: SiaValidationError[] = [];
    const warnings: SiaValidationWarning[] = [];

    // Validate prefix
    if (!/^[a-z]$/.test(prefix)) {
      errors.push({
        code: SiaErrorCode.INVALID_PREFIX,
        message: 'Prefix must be a single lowercase letter',
        field: 'prefix',
        value: prefix
      });
    }

    // Validate content
    if (!content || content.includes('_')) {
      errors.push({
        code: SiaErrorCode.INVALID_CONTENT,
        message: 'Content cannot be empty or contain underscores',
        field: 'content',
        value: content
      });
    }

    // Check for hierarchical code format if it's an element code
    if (prefix === SIA_PREFIXES.ELEMENT && !this.HIERARCHICAL_CODE_PATTERN.test(content)) {
      errors.push({
        code: SiaErrorCode.INVALID_HIERARCHICAL_CODE,
        message: 'Element code must follow hierarchical format (e.g., C0201)',
        field: 'content',
        value: content
      });
    }

    // Add warning for non-standard prefixes
    if (!Object.values(SIA_PREFIXES).includes(prefix as SiaPrefix)) {
      warnings.push({
        code: SiaWarningCode.NON_STANDARD_PREFIX,
        message: 'Non-standard prefix used',
        field: 'prefix',
        value: prefix
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validates a hierarchical element code
   */
  static validateHierarchicalCode(code: string): boolean {
    return this.HIERARCHICAL_CODE_PATTERN.test(code);
  }

  /**
   * Converts a prefix to its corresponding key in the SiaLayer interface
   */
  private static prefixToKey(prefix: string): keyof SiaLayer {
    switch (prefix) {
      case SIA_PREFIXES.AGENT: return 'agent';
      case SIA_PREFIXES.ELEMENT: return 'element';
      case SIA_PREFIXES.PRESENTATION: return 'presentation';
      case SIA_PREFIXES.SCALE: return 'scale';
      case SIA_PREFIXES.PHASE: return 'phase';
      case SIA_PREFIXES.STATUS: return 'status';
      case SIA_PREFIXES.LOCATION: return 'location';
      case SIA_PREFIXES.PROJECTION: return 'projection';
      default: return 'freeTyping';
    }
  }
} 