import { ShapeType, ShapefileStructure } from '../types';
import { WasmValidator } from './wasm-bridge';

export class ShapefileValidator {
  private wasmValidator: WasmValidator;

  constructor() {
    this.wasmValidator = new WasmValidator();
  }

  /**
   * Validate shapefile structure
   */
  validateStructure(
    structure: ShapefileStructure,
    components: { dbf?: File; shx?: File; prj?: File }
  ): Array<{
    type: string;
    message: string;
    details?: Record<string, unknown>;
  }> {
    const issues: Array<{
      type: string;
      message: string;
      details?: Record<string, unknown>;
    }> = [];

    // Validate file code using WebAssembly
    try {
      this.wasmValidator.validateFileCode(structure.shapeHeader.fileCode);
    } catch (error) {
      issues.push({
        type: 'INVALID_FILE_CODE',
        message: 'Invalid shapefile format: incorrect file code',
        details: { fileCode: structure.shapeHeader.fileCode }
      });
    }

    // Check shape type
    if (structure.shapeHeader.shapeType === ShapeType.NULL) {
      issues.push({
        type: 'NULL_SHAPE_TYPE',
        message: 'Shapefile contains null shapes'
      });
    }

    // Check for missing DBF
    if (!structure.dbfHeader) {
      issues.push({
        type: 'MISSING_DBF',
        message: 'DBF file not found or could not be parsed'
      });
    }

    return issues;
  }
}
