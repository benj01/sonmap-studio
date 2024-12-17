/**
 * Centralized error and warning collection for DXF parsing and validation
 */
export class ErrorCollector {
  private errors: string[] = [];
  private warnings: string[] = [];

  /**
   * Add an error with consistent formatting
   * @param entityType The type of entity (e.g., 'LINE', 'CIRCLE')
   * @param handle The entity handle or identifier
   * @param message The error message
   */
  addError(entityType: string, handle: string | undefined, message: string) {
    this.errors.push(`[ERROR]: Entity ${entityType} (Handle: ${handle || 'unknown'}) - ${message}`);
  }

  /**
   * Add a warning with consistent formatting
   * @param entityType The type of entity (e.g., 'LINE', 'CIRCLE')
   * @param handle The entity handle or identifier
   * @param message The warning message
   */
  addWarning(entityType: string, handle: string | undefined, message: string) {
    this.warnings.push(`[WARNING]: Entity ${entityType} (Handle: ${handle || 'unknown'}) - ${message}`);
  }

  /**
   * Add a general error not specific to an entity
   * @param message The error message
   */
  addGeneralError(message: string) {
    this.errors.push(`[ERROR]: ${message}`);
  }

  /**
   * Add a general warning not specific to an entity
   * @param message The warning message
   */
  addGeneralWarning(message: string) {
    this.warnings.push(`[WARNING]: ${message}`);
  }

  /**
   * Get all collected errors
   */
  getErrors(): string[] {
    return [...this.errors];
  }

  /**
   * Get all collected warnings
   */
  getWarnings(): string[] {
    return [...this.warnings];
  }

  /**
   * Check if there are any errors
   */
  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  /**
   * Check if there are any warnings
   */
  hasWarnings(): boolean {
    return this.warnings.length > 0;
  }

  /**
   * Clear all collected errors and warnings
   */
  clear() {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Get a summary of all errors and warnings
   */
  getSummary(): { errors: string[]; warnings: string[] } {
    return {
      errors: this.getErrors(),
      warnings: this.getWarnings()
    };
  }
}
