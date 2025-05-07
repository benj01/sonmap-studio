import { FileGroup, ProcessedFile, ProcessedFiles } from '../types';
import { FileTypeUtil } from './file-types';
import { dbLogger } from '../../../utils/logging/dbLogger';
import { FileValidator } from './validation';

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
 * Utility functions for processing files and their companions
 */

export async function groupFiles(files: File[]): Promise<FileGroup[]> {
  await dbLogger.debug('Starting file grouping', {
    fileCount: files.length,
    files: files.map(f => ({ name: f.name, type: f.type })),
    LOG_SOURCE
  });
  const groups: FileGroup[] = [];
  const remainingFiles = new Set(files);
  // First pass: identify main files
  for (const file of files) {
    if (FileTypeUtil.isMainGeoFile(file.name)) {
      await dbLogger.debug('Found main geo file', { 
        fileName: file.name,
        type: FileTypeUtil.getExtension(file.name)
      }, { LOG_SOURCE });
      const group: FileGroup = {
        mainFile: file,
        companions: []
      };
      groups.push(group);
      remainingFiles.delete(file);
    } else {
      await dbLogger.debug('Skipping non-main file', { fileName: file.name }, { LOG_SOURCE });
    }
  }
  // Second pass: match companions with their main files
  for (const group of groups) {
    const config = FileTypeUtil.getConfigForFile(group.mainFile.name);
    const baseFileName = group.mainFile.name.replace(/\.[^.]+$/, '');
    await dbLogger.debug('Looking for companions', {
      mainFile: group.mainFile.name,
      fileType: FileTypeUtil.getExtension(group.mainFile.name),
      config: config?.companionFiles?.map(c => c.extension),
      baseFileName,
      remainingFiles: Array.from(remainingFiles).map(f => f.name)
    }, { LOG_SOURCE });
    if (config?.companionFiles) {
      // Process each required companion type
      for (const companionConfig of config.companionFiles) {
        // Find a matching companion file using case-insensitive comparison
        const matchingCompanion = Array.from(remainingFiles).find(file => 
          FileValidator.isMatchingCompanion(group.mainFile.name, file, companionConfig.extension)
        );
        if (matchingCompanion) {
          await dbLogger.debug('Found matching companion', {
            mainFile: group.mainFile.name,
            companion: matchingCompanion.name,
            extension: companionConfig.extension,
            required: companionConfig.required
          }, { LOG_SOURCE });
          group.companions.push(matchingCompanion);
          remainingFiles.delete(matchingCompanion);
        } else if (companionConfig.required) {
          await dbLogger.warn('Missing required companion', {
            mainFile: group.mainFile.name,
            extension: companionConfig.extension,
            required: true,
            remainingFiles: Array.from(remainingFiles).map(f => f.name)
          }, { LOG_SOURCE });
        }
      }
      // Check for missing required companions
      try {
        const requiredExtensions = config.companionFiles
          .filter(c => c.required)
          .map(c => c.extension);
        FileValidator.validateCompanions(group.mainFile.name, group.companions, requiredExtensions);
      } catch (error) {
        if (error instanceof Error) {
          await dbLogger.warn('Missing required companion files', {
            mainFile: group.mainFile.name,
            error: error.message
          }, { LOG_SOURCE });
          throw new FileProcessingError(error.message, 'MISSING_REQUIRED_COMPANIONS');
        }
        throw error;
      }
    }
  }
  await dbLogger.debug('File grouping complete', {
    groupCount: groups.length,
    groups: groups.map(g => ({
      mainFile: g.mainFile.name,
      fileType: FileTypeUtil.getExtension(g.mainFile.name),
      companionCount: g.companions.length,
      companions: g.companions.map(c => c.name)
    })),
    LOG_SOURCE
  });
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
    const config = FileTypeUtil.getConfigForFile(file.name);
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
      type: FileTypeUtil.getMimeType(file.name),
      size: file.size,
      isValid,
      error
    };
  } catch (err) {
    await dbLogger.error('Error processing file', { fileName: file.name, error: err instanceof Error ? err.message : err }, { LOG_SOURCE });
    return {
      file,
      type: FileTypeUtil.getMimeType(file.name),
      size: file.size,
      isValid: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
} 