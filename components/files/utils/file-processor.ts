import { FileGroup, ProcessedFile, ProcessedFiles } from '../types';
import { isMainGeoFile, getExtension, getConfigForFile, getMimeType, FileTypeConfig } from './file-types';
import { dbLogger } from '../../../utils/logging/dbLogger';
import { isMatchingCompanion } from './validation';
import { isDebugEnabled } from '@/utils/logging/debugFlags';

const LOG_SOURCE = 'FileProcessor';

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
 * Validate companion files against a file type configuration
 */
export async function validateCompanions(config: FileTypeConfig, files: File[]): Promise<{
  valid: File[];
  missing: string[];
}> {
  const valid: File[] = [];
  const missing: string[] = [];

  // Check each required companion file type
  for (const companionConfig of config.companionFiles) {
    const companion = files.find(f => 
      f.name.toLowerCase().endsWith(companionConfig.extension.toLowerCase())
    );

    if (companion) {
      // Validate size
      if (companion.size > companionConfig.maxSize) {
        throw new FileProcessingError(
          `Companion file ${companion.name} exceeds maximum size of ${companionConfig.maxSize} bytes`,
          'FILE_TOO_LARGE'
        );
      }

      // Custom validation if configured
      if (companionConfig.validateContent) {
        const isValid = await companionConfig.validateContent(companion);
        if (!isValid) {
          throw new FileProcessingError(
            `Companion file ${companion.name} failed content validation`,
            'INVALID_CONTENT'
          );
        }
      }

      valid.push(companion);
    } else if (companionConfig.required) {
      missing.push(companionConfig.extension);
    }
  }

  return { valid, missing };
}

/**
 * Utility functions for processing files and their companions
 */

export async function groupFiles(files: File[]): Promise<FileGroup[]> {
  if (isDebugEnabled('FileProcessor')) {
    await dbLogger.debug('Starting file grouping', {
      fileCount: files.length,
      files: files.map(f => ({ name: f.name, type: f.type })),
      LOG_SOURCE
    });
  }
  const groups: FileGroup[] = [];
  const remainingFiles = new Set(files);
  // First pass: identify main files
  for (const file of files) {
    if (isMainGeoFile(file.name)) {
      if (isDebugEnabled('FileProcessor')) {
        await dbLogger.debug('Found main geo file', { 
          fileName: file.name,
          type: getExtension(file.name)
        }, { LOG_SOURCE });
      }
      const group: FileGroup = {
        mainFile: file,
        companions: []
      };
      groups.push(group);
      remainingFiles.delete(file);
    } else {
      if (isDebugEnabled('FileProcessor')) {
        await dbLogger.debug('Skipping non-main file', { fileName: file.name }, { LOG_SOURCE });
      }
    }
  }
  // Second pass: match companions with their main files
  for (const group of groups) {
    const config = getConfigForFile(group.mainFile.name);
    const baseFileName = group.mainFile.name.replace(/\.[^.]+$/, '');
    if (isDebugEnabled('FileProcessor')) {
      await dbLogger.debug('Looking for companions', {
        mainFile: group.mainFile.name,
        fileType: getExtension(group.mainFile.name),
        config: config?.companionFiles?.map(c => c.extension),
        baseFileName,
        remainingFiles: Array.from(remainingFiles).map(f => f.name)
      }, { LOG_SOURCE });
    }
    if (config?.companionFiles) {
      // First, find all required companions
      const requiredConfigs = config.companionFiles.filter(c => c.required);
      const requiredExtensions = new Set(requiredConfigs.map(c => c.extension.toLowerCase()));
      const foundRequiredCompanions = new Map<string, File>();

      // Check each remaining file against all required extensions
      for (const file of remainingFiles) {
        const companionExt = getExtension(file.name).toLowerCase();
        if (requiredExtensions.has(companionExt)) {
          const isMatching = await isMatchingCompanion(group.mainFile.name, file, companionExt);
          if (isMatching) {
            foundRequiredCompanions.set(companionExt, file);
            if (isDebugEnabled('FileProcessor')) {
              await dbLogger.debug('Found required companion', {
                mainFile: group.mainFile.name,
                companion: file.name,
                extension: companionExt
              }, { LOG_SOURCE });
            }
          }
        }
      }

      // Check if we found all required companions
      const missingRequired = Array.from(requiredExtensions).filter(ext => !foundRequiredCompanions.has(ext));
      if (missingRequired.length > 0) {
        await dbLogger.warn('Missing required companions', {
          mainFile: group.mainFile.name,
          missing: missingRequired
        }, { LOG_SOURCE });
        throw new FileProcessingError(`Missing required companion files: ${missingRequired.join(', ')}`, 'MISSING_REQUIRED_COMPANIONS');
      }

      // Add found required companions to the group and remove from remaining files
      for (const [, file] of foundRequiredCompanions) {
        group.companions.push(file);
        remainingFiles.delete(file);
      }

      // Now process optional companions
      const optionalConfigs = config.companionFiles.filter(c => !c.required);
      for (const companionConfig of optionalConfigs) {
        const matchingCompanion = Array.from(remainingFiles).find(file => 
          isMatchingCompanion(group.mainFile.name, file, companionConfig.extension)
        );
        if (matchingCompanion) {
          if (isDebugEnabled('FileProcessor')) {
            await dbLogger.debug('Found optional companion', {
              mainFile: group.mainFile.name,
              companion: matchingCompanion.name,
              extension: companionConfig.extension
            }, { LOG_SOURCE });
          }
          group.companions.push(matchingCompanion);
          remainingFiles.delete(matchingCompanion);
        }
      }
    }
  }
  if (isDebugEnabled('FileProcessor')) {
    await dbLogger.debug('File grouping complete', {
      groupCount: groups.length,
      groups: groups.map(g => ({
        mainFile: g.mainFile.name,
        fileType: getExtension(g.mainFile.name),
        companionCount: g.companions.length,
        companions: g.companions.map(c => c.name)
      })),
      LOG_SOURCE
    });
  }
  return groups;
}

export async function processFiles(mainFile: File, companions: File[]): Promise<ProcessedFiles> {
  await dbLogger.info('Processing file group', {
    mainFile: mainFile.name,
    companions: companions.map(c => c.name)
  }, { LOG_SOURCE });
  const processedMain = await processFile(mainFile);
  const processedCompanions: ProcessedFile[] = [];
  for (const companion of companions) {
    const processed = await processFile(companion);
    processedCompanions.push(processed);
  }
  await dbLogger.info('File processing complete', {
    mainFile: {
      name: processedMain.file.name,
      isValid: processedMain.isValid,
      error: processedMain.error
    },
    companions: processedCompanions.map(c => ({
      name: c.file.name,
      isValid: c.isValid,
      error: c.error
    })),
    LOG_SOURCE
  });
  return {
    main: processedMain,
    companions: processedCompanions
  };
}

export async function processFile(file: File): Promise<ProcessedFile> {
  try {
    await dbLogger.info('Processing individual file', { fileName: file.name }, { LOG_SOURCE });
    const config = getConfigForFile(file.name);
    let isValid = true;
    let error: string | undefined;
    if (config?.validateContent) {
      try {
        await dbLogger.info('Validating file content', { fileName: file.name }, { LOG_SOURCE });
        isValid = await config.validateContent(file);
        if (!isValid) {
          error = 'File content validation failed';
          await dbLogger.warn('File content validation failed', { fileName: file.name }, { LOG_SOURCE });
        }
      } catch (e) {
        isValid = false;
        error = e instanceof Error ? e.message : 'Validation error';
        await dbLogger.error('File validation error', {
          fileName: file.name,
          error: error
        }, { LOG_SOURCE });
      }
    }
    if (config?.maxSize && file.size > config.maxSize) {
      isValid = false;
      error = `File exceeds maximum size of ${config.maxSize} bytes`;
      await dbLogger.warn('File size exceeds maximum', { fileName: file.name, maxSize: config.maxSize }, { LOG_SOURCE });
    }
    return {
      file,
      type: getMimeType(file.name),
      size: file.size,
      isValid,
      error
    };
  } catch (err) {
    await dbLogger.error('Error processing file', { fileName: file.name, error: err instanceof Error ? err.message : err }, { LOG_SOURCE });
    return {
      file,
      type: getMimeType(file.name),
      size: file.size,
      isValid: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
} 