import {
  getConfigForFile,
  getRequiredCompanions,
  getExtension
} from './file-types';
import type { FileGroup, CompanionFileConfig } from '../types';
import { dbLogger } from '../../../utils/logging/dbLogger';

const LOG_SOURCE = 'FileValidator';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Utility functions for file validation
 */

export async function validateGroup(group: FileGroup): Promise<void> {
  // Validate main file
  const mainConfig = getConfigForFile(group.mainFile.name);
  if (!mainConfig) {
    throw new ValidationError(`Unsupported file type: ${group.mainFile.name}`);
  }
  if (group.mainFile.size > mainConfig.maxSize) {
    throw new ValidationError(
      `File ${group.mainFile.name} exceeds maximum size of ${mainConfig.maxSize} bytes`
    );
  }
  // Get required companions
  const requiredCompanions = getRequiredCompanions(group.mainFile.name);
  const missingCompanions = requiredCompanions.filter((ext: string) => 
    !group.companions.some((file: File) => 
      getExtension(file.name).toLowerCase() === ext.toLowerCase()
    )
  );
  if (missingCompanions.length > 0) {
    throw new ValidationError(
      `Missing required companion files: ${missingCompanions.join(', ')}`
    );
  }
  // Validate each companion
  for (const companion of group.companions) {
    const companionExt = getExtension(companion.name).toLowerCase();
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

export function validateFileSize(file: File, maxSize: number): void {
  if (file.size > maxSize) {
    throw new ValidationError(
      `File ${file.name} exceeds maximum size of ${maxSize} bytes`
    );
  }
}

export function validateFileExtension(fileName: string, allowedExtensions: string[]): void {
  const extension = getExtension(fileName);
  if (!allowedExtensions.includes(extension.toLowerCase())) {
    throw new ValidationError(
      `Invalid file extension: ${extension}. Allowed extensions: ${allowedExtensions.join(', ')}`
    );
  }
}

export function validateCompanions(mainFileName: string, companions: File[], requiredExtensions: string[]): void {
  const baseFileName = mainFileName.replace(/\.[^.]+$/, '');
  const missingCompanions = requiredExtensions.filter(ext => 
    !companions.some(file => {
      const fileBase = file.name.replace(/\.[^.]+$/, '');
      const fileExt = getExtension(file.name);
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

export async function isMatchingCompanion(mainFileName: string, companionFile: File, companionExtension: string): Promise<boolean> {
  const mainBase = mainFileName.replace(/\.[^.]+$/, '');
  const companionBase = companionFile.name.replace(/\.[^.]+$/, '');
  const companionExt = getExtension(companionFile.name);
  const matches = companionBase.toLowerCase() === mainBase.toLowerCase() && 
         companionExt.toLowerCase() === companionExtension.toLowerCase();
  await dbLogger.debug('Matching companion check', {
    mainFile: mainFileName,
    companion: companionFile.name,
    mainBase: mainBase.toLowerCase(),
    companionBase: companionBase.toLowerCase(),
    companionExt: companionExt.toLowerCase(),
    requiredExt: companionExtension.toLowerCase(),
    matches
  }, { source: LOG_SOURCE });
  return matches;
} 