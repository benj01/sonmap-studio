import { FileGroup, ProcessedFile, ProcessedFiles } from '@/components/files/types';
import { FileTypeUtil } from '@/components/files/utils/file-types';
import { LogManager } from '@/core/logging/log-manager';
import { ParserFactory } from './parser-factory';

const SOURCE = 'FileProcessor';
const logManager = LogManager.getInstance();

const logger = {
  info: (message: string, data?: any) => {
    logManager.info(SOURCE, message, data);
  },
  warn: (message: string, error?: any) => {
    logManager.warn(SOURCE, message, error);
  },
  error: (message: string, error?: any) => {
    logManager.error(SOURCE, message, error);
  }
};

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
   */
  static async groupFiles(files: File[]): Promise<FileGroup[]> {
    logger.info('Starting file grouping', {
      fileCount: files.length,
      files: files.map(f => ({ name: f.name, type: f.type }))
    });
    
    const groups: FileGroup[] = [];
    const remainingFiles = new Set(files);
    
    // First pass: identify main files
    for (const file of files) {
      if (FileTypeUtil.isMainGeoFile(file.name)) {
        logger.info('Found main geo file', { 
          fileName: file.name,
          type: FileTypeUtil.getExtension(file.name)
        });
        const group: FileGroup = {
          mainFile: file,
          companions: []
        };
        groups.push(group);
        remainingFiles.delete(file);
      } else {
        logger.info('Skipping non-main file', { fileName: file.name });
      }
    }

    // Second pass: match companions with their main files
    for (const group of groups) {
      const config = FileTypeUtil.getConfigForFile(group.mainFile.name);
      const baseFileName = group.mainFile.name.replace(/\.[^.]+$/, '');
      
      logger.info('Looking for companions', {
        mainFile: group.mainFile.name,
        fileType: FileTypeUtil.getExtension(group.mainFile.name),
        config: config?.companionFiles?.map(c => c.extension),
        baseFileName
      });

      if (config?.companionFiles) {
        for (const companion of Array.from(remainingFiles)) {
          const companionExt = FileTypeUtil.getExtension(companion.name);
          const companionBase = companion.name.replace(/\.[^.]+$/, '');

          const matchingCompanionConfig = config.companionFiles.find(c => 
            c.extension.toLowerCase() === companionExt.toLowerCase()
          );

          if (companionBase === baseFileName && matchingCompanionConfig) {
            logger.info('Found matching companion', {
              mainFile: group.mainFile.name,
              companion: companion.name,
              extension: companionExt,
              required: matchingCompanionConfig.required
            });
            group.companions.push(companion);
            remainingFiles.delete(companion);
          }
        }
      }
    }

    logger.info('File grouping complete', {
      groupCount: groups.length,
      groups: groups.map(g => ({
        mainFile: g.mainFile.name,
        fileType: FileTypeUtil.getExtension(g.mainFile.name),
        companionCount: g.companions.length,
        companions: g.companions.map(c => c.name)
      }))
    });

    return groups;
  }

  /**
   * Process a main file and its companions
   */
  static async processFiles(mainFile: File, companions: File[]): Promise<ProcessedFiles> {
    logger.info('Processing file group', {
      mainFile: mainFile.name,
      companions: companions.map(c => c.name)
    });

    const processedMain = await this.processFile(mainFile);
    const processedCompanions: ProcessedFile[] = [];

    for (const companion of companions) {
      const processed = await this.processFile(companion);
      processedCompanions.push(processed);
    }

    logger.info('File processing complete', {
      mainFile: {
        name: processedMain.file.name,
        isValid: processedMain.isValid,
        error: processedMain.error
      },
      companions: processedCompanions.map(c => ({
        name: c.file.name,
        isValid: c.isValid,
        error: c.error
      }))
    });

    return {
      main: processedMain,
      companions: processedCompanions
    };
  }

  /**
   * Process a single file
   */
  private static async processFile(file: File): Promise<ProcessedFile> {
    try {
      logger.info('Processing individual file', { fileName: file.name });
      const config = FileTypeUtil.getConfigForFile(file.name);
      let isValid = true;
      let error: string | undefined;

      if (FileTypeUtil.isMainGeoFile(file.name)) {
        try {
          const parser = ParserFactory.createParser(file.name);
          const buffer = await file.arrayBuffer();
          isValid = await parser.validate(buffer);
          if (!isValid) {
            error = 'File content validation failed';
            logger.warn('File content validation failed', { fileName: file.name });
          }
        } catch (e) {
          isValid = false;
          error = e instanceof Error ? e.message : 'Validation error';
          logger.error('File validation error', {
            fileName: file.name,
            error: error
          });
        }
      } else {
        // Check if this is a companion file
        const mainExt = FileTypeUtil.getExtension(file.name);
        const companionConfig = FileTypeUtil.getAllConfigs()
          .flatMap(c => c.companionFiles)
          .find(c => c.extension.toLowerCase() === mainExt.toLowerCase());

        if (companionConfig?.validateContent) {
          try {
            logger.info('Validating companion file content', { 
              fileName: file.name,
              extension: mainExt
            });
            isValid = await companionConfig.validateContent(file);
            if (!isValid) {
              error = 'File content validation failed';
              logger.warn('Companion file content validation failed', { fileName: file.name });
            }
          } catch (e) {
            isValid = false;
            error = e instanceof Error ? e.message : 'Validation error';
            logger.error('Companion file validation error', {
              fileName: file.name,
              error: error
            });
          }
        }
      }

      if (config?.maxSize && file.size > config.maxSize) {
        isValid = false;
        error = `File size exceeds maximum allowed size of ${config.maxSize} bytes`;
        logger.warn('File size validation failed', {
          fileName: file.name,
          size: file.size,
          maxSize: config.maxSize
        });
      }

      return {
        file,
        type: FileTypeUtil.getMimeType(file.name),
        size: file.size,
        isValid,
        error
      };
    } catch (e) {
      logger.error('File processing error', {
        fileName: file.name,
        error: e instanceof Error ? e.message : 'Unknown error'
      });
      throw new FileProcessingError(
        e instanceof Error ? e.message : 'Failed to process file',
        'PROCESSING_ERROR'
      );
    }
  }
} 