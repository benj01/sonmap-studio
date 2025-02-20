import { FileGroup, ProcessedFile, ProcessedFiles } from '../types';
import { FileTypeUtil } from './file-types';

/**
 * Custom error for file processing
 */
export class FileProcessingError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'FileProcessingError';
  }
}

/**
 * Utility class for processing files and their companions
 */
export class FileProcessor {
  /**
   * Group files into main files and their companions
   * @param files Array of files to process
   * @returns Array of file groups
   */
  static async groupFiles(files: File[]): Promise<FileGroup[]> {
    const groups: FileGroup[] = [];
    const remainingFiles = new Set(files);
    
    // First pass: identify main files
    for (const file of files) {
      if (FileTypeUtil.isMainGeoFile(file.name)) {
        const group: FileGroup = {
          mainFile: file,
          companions: []
        };
        groups.push(group);
        remainingFiles.delete(file);
      }
    }

    // Second pass: match companions with their main files
    for (const group of groups) {
      const requiredCompanions = FileTypeUtil.getRequiredCompanions(group.mainFile.name);
      const baseFileName = group.mainFile.name.replace(/\.[^.]+$/, '');

      for (const companion of Array.from(remainingFiles)) {
        const companionExt = FileTypeUtil.getExtension(companion.name);
        const companionBase = companion.name.replace(/\.[^.]+$/, '');

        if (companionBase === baseFileName && requiredCompanions.includes(companionExt)) {
          group.companions.push(companion);
          remainingFiles.delete(companion);
        }
      }
    }

    return groups;
  }

  /**
   * Process a main file and its companions
   * @param mainFile Main file to process
   * @param companions Array of companion files
   * @returns ProcessedFiles object
   */
  static async processFiles(mainFile: File, companions: File[]): Promise<ProcessedFiles> {
    const processedMain = await this.processFile(mainFile);
    const processedCompanions: ProcessedFile[] = [];

    for (const companion of companions) {
      const processed = await this.processFile(companion);
      processedCompanions.push(processed);
    }

    return {
      main: processedMain,
      companions: processedCompanions
    };
  }

  /**
   * Process a single file
   * @param file File to process
   * @returns ProcessedFile object
   */
  private static async processFile(file: File): Promise<ProcessedFile> {
    try {
      const config = FileTypeUtil.getConfigForFile(file.name);
      let isValid = true;
      let error: string | undefined;

      if (config?.validateContent) {
        try {
          isValid = await config.validateContent(file);
          if (!isValid) {
            error = 'File content validation failed';
          }
        } catch (e) {
          isValid = false;
          error = e instanceof Error ? e.message : 'Validation error';
        }
      }

      if (config?.maxSize && file.size > config.maxSize) {
        isValid = false;
        error = `File size exceeds maximum allowed size of ${config.maxSize} bytes`;
      }

      return {
        file,
        type: FileTypeUtil.getMimeType(file.name),
        size: file.size,
        isValid,
        error
      };
    } catch (e) {
      throw new FileProcessingError(
        e instanceof Error ? e.message : 'Failed to process file',
        'PROCESSING_ERROR'
      );
    }
  }
} 