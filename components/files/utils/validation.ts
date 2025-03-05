import { FileTypeUtil } from './file-types';
import type { FileGroup, CompanionFileConfig } from '../types';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class FileValidator {
  /**
   * Validate a group of files
   * @param group FileGroup to validate
   * @throws ValidationError if validation fails
   */
  static validateGroup(group: FileGroup): void {
    // Validate main file
    const mainConfig = FileTypeUtil.getConfigForFile(group.mainFile.name);
    if (!mainConfig) {
      throw new ValidationError(`Unsupported file type: ${group.mainFile.name}`);
    }

    if (group.mainFile.size > mainConfig.maxSize) {
      throw new ValidationError(
        `File ${group.mainFile.name} exceeds maximum size of ${mainConfig.maxSize} bytes`
      );
    }

    // Get required companions
    const requiredCompanions = FileTypeUtil.getRequiredCompanions(group.mainFile.name);
    const missingCompanions = requiredCompanions.filter(ext => 
      !group.companions.some((file: File) => 
        FileTypeUtil.getExtension(file.name).toLowerCase() === ext.toLowerCase()
      )
    );

    if (missingCompanions.length > 0) {
      throw new ValidationError(
        `Missing required companion files: ${missingCompanions.join(', ')}`
      );
    }

    // Validate each companion
    for (const companion of group.companions) {
      const companionExt = FileTypeUtil.getExtension(companion.name).toLowerCase();
      const companionConfig = mainConfig.companionFiles.find(
        (config: CompanionFileConfig) => config.extension.toLowerCase() === companionExt
      );

      if (!companionConfig) {
        throw new ValidationError(`Invalid companion file: ${companion.name}`);
      }

      if (companion.size > companionConfig.maxSize) {
        throw new ValidationError(
          `Companion file ${companion.name} exceeds maximum size of ${companionConfig.maxSize} bytes`
        );
      }
    }
  }

  /**
   * Validate file size
   * @param file File to validate
   * @param maxSize Maximum allowed size in bytes
   * @throws ValidationError if file is too large
   */
  static validateFileSize(file: File, maxSize: number): void {
    if (file.size > maxSize) {
      throw new ValidationError(
        `File ${file.name} exceeds maximum size of ${maxSize} bytes`
      );
    }
  }

  /**
   * Validate file extension
   * @param fileName File name to validate
   * @param allowedExtensions Array of allowed extensions (with dot)
   * @throws ValidationError if extension is not allowed
   */
  static validateFileExtension(fileName: string, allowedExtensions: string[]): void {
    const extension = FileTypeUtil.getExtension(fileName);
    if (!allowedExtensions.includes(extension.toLowerCase())) {
      throw new ValidationError(
        `Invalid file extension: ${extension}. Allowed extensions: ${allowedExtensions.join(', ')}`
      );
    }
  }

  /**
   * Validate companion files with case-insensitive matching
   * @param mainFileName Main file name
   * @param companions Array of companion files
   * @param requiredExtensions Array of required extensions
   * @throws ValidationError if required companions are missing
   */
  static validateCompanions(mainFileName: string, companions: File[], requiredExtensions: string[]): void {
    const baseFileName = mainFileName.replace(/\.[^.]+$/, '');
    
    const missingCompanions = requiredExtensions.filter(ext => 
      !companions.some(file => {
        const fileBase = file.name.replace(/\.[^.]+$/, '');
        const fileExt = FileTypeUtil.getExtension(file.name);
        
        return fileBase.toLowerCase() === baseFileName.toLowerCase() && 
               fileExt.toLowerCase() === ext.toLowerCase();
      })
    );

    if (missingCompanions.length > 0) {
      throw new ValidationError(
        `Missing required companion files: ${missingCompanions.join(', ')}`
      );
    }
  }

  /**
   * Check if a file matches a companion configuration
   * @param mainFileName Main file name
   * @param companionFile Potential companion file
   * @param companionExtension Required companion extension
   * @returns boolean indicating if the file is a matching companion
   */
  static isMatchingCompanion(mainFileName: string, companionFile: File, companionExtension: string): boolean {
    const mainBase = mainFileName.replace(/\.[^.]+$/, '');
    const companionBase = companionFile.name.replace(/\.[^.]+$/, '');
    const companionExt = FileTypeUtil.getExtension(companionFile.name);

    const matches = companionBase.toLowerCase() === mainBase.toLowerCase() && 
           companionExt.toLowerCase() === companionExtension.toLowerCase();
           
    console.log('Matching companion check:', {
      mainFile: mainFileName,
      companion: companionFile.name,
      mainBase: mainBase.toLowerCase(),
      companionBase: companionBase.toLowerCase(),
      companionExt: companionExt.toLowerCase(),
      requiredExt: companionExtension.toLowerCase(),
      matches
    });
    
    return matches;
  }
} 