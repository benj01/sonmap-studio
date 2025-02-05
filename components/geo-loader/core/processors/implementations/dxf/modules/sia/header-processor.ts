import { SiaHeader, SiaValidationResult, SiaErrorCode, SiaWarningCode, SiaValidationError, SiaValidationWarning } from '../../types/sia';

/**
 * Processor for SIA 2014 compliant DXF headers
 */
export class SiaHeaderProcessor {
  private static readonly REQUIRED_HEADER_FIELDS = [
    'OBJFILE',
    'PROJFILE',
    'FILE',
    'TEXTFILE',
    'DATEFILE',
    'VERFILE',
    'AGENTFILE',
    'VERSIA2014'
  ] as const;

  /**
   * Process DXF header variables and extract SIA metadata
   */
  static processHeader(headerVariables: Record<string, any>): SiaHeader {
    const header: Partial<SiaHeader> = {};
    const customKeys: Record<string, string[]> = {};

    // Process standard header fields
    for (const [key, value] of Object.entries(headerVariables)) {
      if (key.startsWith('$')) {
        const cleanKey = key.substring(1); // Remove $ prefix
        if (this.REQUIRED_HEADER_FIELDS.includes(cleanKey as any)) {
          header[cleanKey] = value.toString();
        }
        // Process custom key mappings
        else if (cleanKey.startsWith('KEY')) {
          const prefix = cleanKey.charAt(3); // Get the prefix letter (a-z)
          if (/^[a-z]$/.test(prefix)) {
            if (!customKeys[`KEY${prefix}`]) {
              customKeys[`KEY${prefix}`] = [];
            }
            customKeys[`KEY${prefix}`].push(value.toString());
          }
        }
      }
    }

    // Add custom keys to header
    Object.entries(customKeys).forEach(([key, values]) => {
      header[key as keyof SiaHeader] = values;
    });

    return header as SiaHeader;
  }

  /**
   * Validate SIA header according to standard requirements
   */
  static validateHeader(header: SiaHeader): SiaValidationResult {
    const errors: SiaValidationError[] = [];
    const warnings: SiaValidationWarning[] = [];

    // Check required fields
    this.REQUIRED_HEADER_FIELDS.forEach(field => {
      if (!header[field]) {
        errors.push({
          code: SiaErrorCode.MISSING_HEADER_FIELD,
          message: `Missing required header field: ${field}`,
          field
        });
      }
    });

    // Validate date format (YYYYMMDD)
    if (header.DATEFILE && !/^\d{8}$/.test(header.DATEFILE)) {
      errors.push({
        code: SiaErrorCode.INVALID_CONTENT,
        message: 'Date must be in YYYYMMDD format',
        field: 'DATEFILE',
        value: header.DATEFILE
      });
    }

    // Check for custom key mappings without corresponding layers
    Object.entries(header)
      .filter(([key]) => key.startsWith('KEY'))
      .forEach(([key, values]) => {
        if (!Array.isArray(values) || values.length === 0) {
          warnings.push({
            code: SiaWarningCode.CUSTOM_KEY_WITHOUT_MAPPING,
            message: `Custom key mapping ${key} has no values`,
            field: key
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
   * Create header variables for DXF file
   */
  static createHeaderVariables(header: SiaHeader): Record<string, string> {
    const variables: Record<string, string> = {};

    // Add standard fields
    this.REQUIRED_HEADER_FIELDS.forEach(field => {
      const value = header[field];
      if (value && typeof value === 'string') {
        variables[`$${field}`] = value;
      }
    });

    // Add custom key mappings
    Object.entries(header)
      .filter(([key]) => key.startsWith('KEY'))
      .forEach(([key, values]) => {
        if (Array.isArray(values)) {
          values.forEach((value, index) => {
            variables[`$${key}_${index + 1}`] = value;
          });
        }
      });

    return variables;
  }

  /**
   * Extract version information from header
   */
  static getSiaVersion(header: SiaHeader): string | null {
    return header.VERSIA2014 || null;
  }

  /**
   * Get custom key mappings for a specific prefix
   */
  static getCustomKeyMappings(header: SiaHeader, prefix: string): string[] {
    const key = `KEY${prefix}` as keyof SiaHeader;
    const value = header[key];
    return Array.isArray(value) ? value : [];
  }
} 