import { ValidationError } from '../../../../errors/types';
import { ShapefileProcessorOptions } from '../types';

export interface ComponentFiles {
  dbf?: File;
  shx?: File;
  prj?: File;
}

/**
 * Handles shapefile component file management and validation
 */
export class FileHandler {
  private options: ShapefileProcessorOptions;

  constructor(options: ShapefileProcessorOptions = {}) {
    this.options = options;
  }

  /**
   * Find and validate component files (.dbf, .shx, .prj)
   */
  async findComponentFiles(file: File): Promise<ComponentFiles> {
    console.debug('[DEBUG] Finding component files for:', file.name);
    
    // Validate main file
    if (!file.name.toLowerCase().endsWith('.shp')) {
      throw new ValidationError(
        'Invalid file: Must be a .shp file',
        'INVALID_FILE_TYPE',
        undefined,
        { fileName: file.name }
      );
    }

    // Get component files from options or file object
    const components = this.getComponentFiles(file);

    // Validate required components
    this.validateRequiredComponents(components);

    return components;
  }

  /**
   * Get component files from options or file object
   */
  private getComponentFiles(file: File): ComponentFiles {
    // Check if related files are provided in options
    const relatedFiles = this.options?.relatedFiles;
    if (relatedFiles) {
      console.debug('[DEBUG] Found related files in options:', {
        hasDbf: !!relatedFiles.dbf,
        hasShx: !!relatedFiles.shx,
        hasPrj: !!relatedFiles.prj
      });
      
      const components = {
        dbf: relatedFiles.dbf,
        shx: relatedFiles.shx,
        prj: relatedFiles.prj
      };
      
      this.logMissingComponents(components);
      return components;
    }

    // Check for companion files attached to the file object
    const companionFiles = (file as any).relatedFiles;
    if (companionFiles) {
      console.debug('[DEBUG] Found companion files on file object:', 
        Object.keys(companionFiles).map(ext => ({ ext, type: companionFiles[ext]?.type }))
      );
      
      const components = {
        dbf: companionFiles['.dbf'],
        shx: companionFiles['.shx'],
        prj: companionFiles['.prj']
      };
      
      this.logMissingComponents(components);
      return components;
    }

    console.warn('[WARN] No companion files found for shapefile:', file.name);
    return {};
  }

  /**
   * Log warnings for missing components
   */
  private logMissingComponents(components: ComponentFiles): void {
    if (!components.dbf) {
      console.warn('[WARN] Missing DBF file in shapefile set');
    }
    if (!components.shx) {
      console.warn('[WARN] Missing SHX file in shapefile set');
    }
  }

  /**
   * Validate required component files
   */
  private validateRequiredComponents(components: ComponentFiles): void {
    if (!components.dbf || !components.shx) {
      const missing = [];
      if (!components.dbf) missing.push('.dbf');
      if (!components.shx) missing.push('.shx');
      
      throw new ValidationError(
        `Missing required companion files: ${missing.join(', ')}`,
        'MISSING_COMPANION_FILES',
        undefined,
        { missing }
      );
    }
  }

  /**
   * Read file as ArrayBuffer
   */
  async readFileBuffer(file: File): Promise<ArrayBuffer> {
    try {
      return await file.arrayBuffer();
    } catch (error) {
      throw new ValidationError(
        `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
        'FILE_READ_ERROR',
        undefined,
        { fileName: file.name }
      );
    }
  }
}
