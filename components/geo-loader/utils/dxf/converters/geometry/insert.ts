import { Geometry, GeometryCollection } from 'geojson';
import { BaseGeometryConverter } from './base';
import { ErrorReporter } from '../../../errors';
import { DxfEntityBase, InsertEntity, isInsertEntity } from './types';
import { TransformUtils } from '../../transform';
import { geometryConverterRegistry } from './base';

/**
 * Converter for INSERT entities
 * Handles block references with transformations and array copies
 */
export class InsertGeometryConverter extends BaseGeometryConverter {
  canHandle(entityType: string): boolean {
    return entityType === 'INSERT';
  }

  convert(entity: DxfEntityBase, errorReporter: ErrorReporter): Geometry | null {
    if (!isInsertEntity(entity)) {
      return null;
    }

    const entityInfo = this.entityInfo(entity);

    // Validate position
    if (!this.validateCoordinates(entity.position, errorReporter, entityInfo, 'insert position')) {
      return null;
    }

    // Validate scales if present
    if (entity.xScale !== undefined && !this.validateNumber(entity.xScale, errorReporter, entityInfo, 'x scale', { nonZero: true })) {
      return null;
    }
    if (entity.yScale !== undefined && !this.validateNumber(entity.yScale, errorReporter, entityInfo, 'y scale', { nonZero: true })) {
      return null;
    }
    if (entity.zScale !== undefined && !this.validateNumber(entity.zScale, errorReporter, entityInfo, 'z scale', { nonZero: true })) {
      return null;
    }

    // Validate rotation if present
    if (entity.rotation !== undefined && !this.validateNumber(entity.rotation, errorReporter, entityInfo, 'rotation')) {
      return null;
    }

    // Validate array parameters if present
    if (entity.columnCount !== undefined && !this.validateNumber(entity.columnCount, errorReporter, entityInfo, 'column count', { min: 1 })) {
      return null;
    }
    if (entity.rowCount !== undefined && !this.validateNumber(entity.rowCount, errorReporter, entityInfo, 'row count', { min: 1 })) {
      return null;
    }
    if (entity.columnSpacing !== undefined && !this.validateNumber(entity.columnSpacing, errorReporter, entityInfo, 'column spacing')) {
      return null;
    }
    if (entity.rowSpacing !== undefined && !this.validateNumber(entity.rowSpacing, errorReporter, entityInfo, 'row spacing')) {
      return null;
    }

    // Create base transformation matrix for the insert
    const baseTransform = TransformUtils.combineTransformMatrices(
      TransformUtils.createTranslationMatrix(entity.position.x, entity.position.y, entity.position.z || 0),
      TransformUtils.combineTransformMatrices(
        TransformUtils.createRotationMatrix(entity.rotation || 0),
        TransformUtils.createScaleMatrix(
          entity.xScale || 1,
          entity.yScale || 1,
          entity.zScale || 1
        )
      )
    );

    // Calculate array parameters
    const cols = entity.columnCount || 1;
    const rows = entity.rowCount || 1;
    const colSpacing = entity.columnSpacing || 0;
    const rowSpacing = entity.rowSpacing || 0;

    // Create a collection of transformed geometries
    const geometries: Geometry[] = [];

    // Generate array copies
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // Calculate offset for this array element
        const offsetX = col * colSpacing;
        const offsetY = row * rowSpacing;

        // Create transform matrix for this array element
        const arrayTransform = TransformUtils.createTranslationMatrix(offsetX, offsetY, 0);

        // Combine base transform with array transform
        const finalTransform = TransformUtils.combineTransformMatrices(baseTransform, arrayTransform);

        // TODO: Get block entities and convert them using the final transform
        // This part would need integration with the block registry
        // For now, we'll just add a warning
        errorReporter.addWarning(
          'Block conversion not implemented yet',
          'BLOCK_CONVERSION_PENDING',
          {
            ...entityInfo,
            blockName: entity.name,
            transform: finalTransform
          }
        );
      }
    }

    // If we have multiple geometries, return a GeometryCollection
    if (geometries.length > 1) {
      return {
        type: 'GeometryCollection',
        geometries
      };
    }

    // If we have just one geometry, return it directly
    if (geometries.length === 1) {
      return geometries[0];
    }

    // If we have no geometries, return null
    return null;
  }
}
