import { CoordinateSystem, TransformOptions, TransformResult, TransformOperation } from './types';

/**
 * Handles coordinate system transformations
 */
export class CoordinateTransformer {
  private transformCache: Map<string, TransformOperation> = new Map();

  /**
   * Transform coordinates from one system to another
   */
  transform(
    coordinates: number[],
    from: CoordinateSystem,
    to: CoordinateSystem,
    options: TransformOptions = {}
  ): TransformResult {
    try {
      // Validate input coordinates if requested
      if (options.validate) {
        this.validateCoordinates(coordinates);
      }

      // Get or create transform operation
      const transformKey = `${from.id}->${to.id}`;
      let operation = this.transformCache.get(transformKey);
      
      if (!operation) {
        operation = this.createTransformOperation(from, to);
        this.transformCache.set(transformKey, operation);
      }

      // Perform transformation
      const result = operation.transform(coordinates);
      
      return {
        coordinates: result,
        success: true
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (options.onError) {
        options.onError(error instanceof Error ? error : new Error(errorMessage));
      }

      // If fallback is allowed and systems are compatible, try direct copy
      if (options.allowFallback && this.areSystemsCompatible(from, to)) {
        return {
          coordinates: [...coordinates],
          success: true,
          error: `Used fallback: ${errorMessage}`
        };
      }

      return {
        coordinates: coordinates,
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Create a transform operation between two coordinate systems
   */
  private createTransformOperation(from: CoordinateSystem, to: CoordinateSystem): TransformOperation {
    // For now, return identity transform
    // TODO: Implement actual coordinate transformation using proj4 or similar
    return {
      from,
      to,
      transform: (coords: number[]) => [...coords]
    };
  }

  /**
   * Check if two coordinate systems are compatible for direct coordinate copy
   */
  private areSystemsCompatible(from: CoordinateSystem, to: CoordinateSystem): boolean {
    // For now, only consider identical systems compatible
    // TODO: Implement more sophisticated compatibility checking
    return from.id === to.id;
  }

  /**
   * Validate coordinates
   */
  private validateCoordinates(coordinates: number[]): void {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      throw new Error('Invalid coordinates: must be array with at least 2 elements');
    }

    if (!coordinates.every(c => typeof c === 'number' && isFinite(c))) {
      throw new Error('Invalid coordinates: all elements must be finite numbers');
    }
  }

  /**
   * Clear transform cache
   */
  clearCache(): void {
    this.transformCache.clear();
  }
}
