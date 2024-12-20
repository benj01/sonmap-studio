import { ErrorReporter, ValidationError, GeoLoaderError } from '../errors';

/**
 * DXF-specific error reporter that extends the base ErrorReporter with
 * methods for handling DXF entity errors and warnings.
 */
export class DxfErrorReporter extends ErrorReporter {
  /**
   * Add an error for a specific DXF entity
   * @param entityType The type of entity (e.g., 'LINE', 'CIRCLE')
   * @param handle The entity handle or identifier
   * @param message The error message
   * @param details Additional error details
   */
  addEntityError(
    entityType: string, 
    handle: string | undefined, 
    message: string,
    details?: Record<string, unknown>
  ): void {
    const error = new ValidationError(
      message,
      entityType,
      handle,
      {
        layer: details?.layer,
        ...details
      }
    );
    this.addError(
      `Entity ${entityType} (Handle: ${handle || 'unknown'}) - ${message}`,
      error.code,
      {
        entityType,
        handle,
        ...details
      }
    );
  }

  /**
   * Add a warning for a specific DXF entity
   * @param entityType The type of entity (e.g., 'LINE', 'CIRCLE')
   * @param handle The entity handle or identifier
   * @param message The warning message
   * @param details Additional warning details
   */
  addEntityWarning(
    entityType: string, 
    handle: string | undefined, 
    message: string,
    details?: Record<string, unknown>
  ): void {
    this.addWarning(
      `Entity ${entityType} (Handle: ${handle || 'unknown'}) - ${message}`,
      'DXF_ENTITY_WARNING',
      {
        entityType,
        handle,
        ...details
      }
    );
  }

  /**
   * Add a general DXF error not specific to an entity
   * @param message The error message
   * @param details Additional error details
   */
  addDxfError(message: string, details?: Record<string, unknown>): void {
    const error = new GeoLoaderError(message, 'DXF_ERROR', details);
    this.addError(message, error.code, details);
  }

  /**
   * Add a general DXF warning not specific to an entity
   * @param message The warning message
   * @param details Additional warning details
   */
  addDxfWarning(message: string, details?: Record<string, unknown>): void {
    this.addWarning(message, 'DXF_WARNING', details);
  }

  /**
   * Create a new DXF error reporter instance
   */
  static create(): DxfErrorReporter {
    return new DxfErrorReporter();
  }
}

/**
 * Create a new DXF error reporter instance
 */
export function createDxfErrorReporter(): DxfErrorReporter {
  return DxfErrorReporter.create();
}
