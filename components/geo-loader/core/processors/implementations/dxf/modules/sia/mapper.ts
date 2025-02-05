import { SiaLayer, SiaHeader, SiaLayerKey, SiaValidationResult, SiaErrorCode, SiaWarningCode, SiaValidationError, SiaValidationWarning } from '../../types/sia';

/**
 * Interface for working structure mapping
 */
interface WorkingStructure {
  layerName: string;
  mappings: {
    [key: string]: string;
  };
}

/**
 * Interface for exchange structure mapping
 */
interface ExchangeStructure {
  layerName: string;
  siaLayer: SiaLayer;
}

/**
 * Handles mapping between working and exchange structures according to SIA 2014
 */
export class SiaMapper {
  private workingStructures: Map<string, WorkingStructure>;
  private exchangeStructures: Map<string, ExchangeStructure>;
  private header: SiaHeader | null;

  constructor() {
    this.workingStructures = new Map();
    this.exchangeStructures = new Map();
    this.header = null;
  }

  /**
   * Initialize mapper with SIA header information
   */
  setHeader(header: SiaHeader): void {
    this.header = header;
  }

  /**
   * Add a working structure mapping
   */
  addWorkingStructure(layerName: string, mappings: Record<string, string>): void {
    this.workingStructures.set(layerName, {
      layerName,
      mappings
    });
  }

  /**
   * Add an exchange structure mapping
   */
  addExchangeStructure(layerName: string, siaLayer: SiaLayer): void {
    this.exchangeStructures.set(layerName, {
      layerName,
      siaLayer
    });
  }

  /**
   * Convert a working structure layer name to exchange structure
   */
  mapToExchangeStructure(workingLayerName: string): string | null {
    const workingStructure = this.workingStructures.get(workingLayerName);
    if (!workingStructure) return null;

    // Build SIA layer components
    const components: string[] = [];
    const mappings = workingStructure.mappings;

    // Add mandatory fields
    if (mappings.agent) components.push(`_a_${mappings.agent}`);
    if (mappings.element) components.push(`_b_${mappings.element}`);
    if (mappings.presentation) components.push(`_c_${mappings.presentation}`);

    // Add optional fields
    if (mappings.scale) components.push(`_d_${mappings.scale}`);
    if (mappings.phase) components.push(`_e_${mappings.phase}`);
    if (mappings.status) components.push(`_f_${mappings.status}`);
    if (mappings.location) components.push(`_g_${mappings.location}`);
    if (mappings.projection) components.push(`_h_${mappings.projection}`);

    // Add any custom fields (i-z)
    Object.entries(mappings)
      .filter(([key]) => /^[i-z]$/.test(key))
      .forEach(([key, value]) => {
        components.push(`_${key}_${value}`);
      });

    return components.join('');
  }

  /**
   * Convert an exchange structure layer name to working structure
   */
  mapToWorkingStructure(exchangeLayerName: string): string | null {
    const exchangeStructure = this.exchangeStructures.get(exchangeLayerName);
    if (!exchangeStructure) return null;

    // Find matching working structure based on mappings
    for (const [workingName, workingStructure] of this.workingStructures) {
      const mappings = workingStructure.mappings;
      const siaLayer = exchangeStructure.siaLayer;

      // Check if all mappings match
      const matches = Object.entries(mappings).every(([key, value]) => {
        switch (key) {
          case 'agent':
            return siaLayer.agent.content === value;
          case 'element':
            return siaLayer.element.content === value;
          case 'presentation':
            return siaLayer.presentation.content === value;
          case 'scale':
            return siaLayer.scale?.content === value;
          case 'phase':
            return siaLayer.phase?.content === value;
          case 'status':
            return siaLayer.status?.content === value;
          case 'location':
            return siaLayer.location?.content === value;
          case 'projection':
            return siaLayer.projection?.content === value;
          default:
            if (/^[i-z]$/.test(key)) {
              return siaLayer.freeTyping?.some(ft => ft.prefix === key && ft.content === value);
            }
            return false;
        }
      });

      if (matches) return workingName;
    }

    return null;
  }

  /**
   * Validate working structure mappings against SIA requirements
   */
  validateWorkingStructure(workingStructure: WorkingStructure): SiaValidationResult {
    const errors: SiaValidationError[] = [];
    const warnings: SiaValidationWarning[] = [];

    // Check mandatory fields
    ['agent', 'element', 'presentation'].forEach(field => {
      if (!workingStructure.mappings[field]) {
        errors.push({
          code: SiaErrorCode.MISSING_MANDATORY_FIELD,
          message: `Missing mandatory field mapping: ${field}`,
          field
        });
      }
    });

    // Validate custom key mappings against header
    if (this.header) {
      Object.entries(workingStructure.mappings)
        .filter(([key]) => /^[a-z]$/.test(key))
        .forEach(([key, value]) => {
          const customKeys = this.header?.[`KEY${key}` as keyof SiaHeader];
          if (Array.isArray(customKeys) && !customKeys.includes(value)) {
            warnings.push({
              code: SiaWarningCode.CUSTOM_KEY_WITHOUT_MAPPING,
              message: `Value "${value}" not found in custom key mapping for ${key}`,
              field: key,
              value
            });
          }
        });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get all working structure mappings
   */
  getWorkingStructures(): WorkingStructure[] {
    return Array.from(this.workingStructures.values());
  }

  /**
   * Get all exchange structure mappings
   */
  getExchangeStructures(): ExchangeStructure[] {
    return Array.from(this.exchangeStructures.values());
  }

  /**
   * Clear all mappings
   */
  clear(): void {
    this.workingStructures.clear();
    this.exchangeStructures.clear();
    this.header = null;
  }
} 