import { dbLogger } from '@/utils/logging/dbLogger';
import { FileGroup, ProcessedFiles, CompanionFileConfig } from '@/components/files/types';
import { getConfigForFile, FileTypeConfig } from '@/components/files/utils/file-types';
import { FileProcessingError, validateCompanions } from '@/components/files/utils/file-processor';
import { isMainGeoFile } from '@/components/files/utils/file-types';
import { 
  FileGroupState, 
  FileStatus, 
  EnhancedFile,
  ValidationResult,
  ProcessingError
} from './types';

const LOG_SOURCE = 'FileGroupProcessor';

export class FileGroupProcessor {
  private groups: Map<string, FileGroupState> = new Map();
  private processingQueue: string[] = [];
  private isProcessing = false;

  constructor(
    private readonly onStateChange?: (groupId: string, state: FileGroupState) => void,
    private readonly onError?: (error: Error, groupId?: string) => void
  ) {}

  /**
   * Add a new file group for processing
   */
  async addGroup(files: File[]): Promise<string> {
    const groupId = crypto.randomUUID();
    const mainFile = files.find(f => isMainGeoFile(f.name));

    if (!mainFile) {
      throw new FileProcessingError('No main file found in group', 'MISSING_MAIN_FILE');
    }

    const group: FileGroupState = {
      id: groupId,
      mainFile: {
        ...mainFile,
        groupId,
        role: 'main',
        status: 'pending',
        processingProgress: 0,
        uploadProgress: 0
      } as EnhancedFile,
      companions: files
        .filter(f => f !== mainFile)
        .map(f => ({
          ...f,
          groupId,
          role: 'companion',
          status: 'pending',
          processingProgress: 0,
          uploadProgress: 0
        } as EnhancedFile)),
      status: 'incomplete',
      validationState: {
        isValid: false,
        lastValidated: undefined,
        errors: [],
        warnings: []
      },
      processingMetadata: {
        startTime: undefined,
        endTime: undefined,
        duration: 0,
        currentStage: 'none',
        attempts: 0,
        errors: []
      }
    };

    this.groups.set(groupId, group);
    this.processingQueue.push(groupId);

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue().catch(error => {
        const processError = error instanceof Error ? error : new Error(String(error));
        this.onError?.(processError);
      });
    }

    return groupId;
  }

  /**
   * Get the current state of a file group
   */
  getGroupState(groupId: string): FileGroupState | undefined {
    return this.groups.get(groupId);
  }

  /**
   * Remove a file group and its associated files
   */
  removeGroup(groupId: string): void {
    const group = this.groups.get(groupId);
    if (group) {
      // Clean up any resources
      this.groups.delete(groupId);
      // Remove from queue if present
      const queueIndex = this.processingQueue.indexOf(groupId);
      if (queueIndex !== -1) {
        this.processingQueue.splice(queueIndex, 1);
      }
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.processingQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.processingQueue.length > 0) {
        const groupId = this.processingQueue[0];
        const group = this.groups.get(groupId);

        if (!group) {
          this.processingQueue.shift();
          continue;
        }

        try {
          await this.processGroup(group);
          this.processingQueue.shift();
        } catch (error) {
          const processError = error instanceof Error ? error : new Error(String(error));
          await dbLogger.error('Failed to process group', {
            groupId,
            error: processError
          }, { LOG_SOURCE });

          // Update group state
          group.status = 'error';
          group.processingMetadata.errors.push({
            timestamp: new Date(),
            message: processError.message,
            code: processError instanceof FileProcessingError ? processError.code : 'UNKNOWN_ERROR'
          });

          // Notify listeners
          this.onStateChange?.(groupId, group);
          this.onError?.(processError, groupId);

          // Remove from queue
          this.processingQueue.shift();
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async processGroup(group: FileGroupState): Promise<void> {
    try {
      // Update state
      group.status = 'processing';
      group.processingMetadata.startTime = new Date();
      group.processingMetadata.attempts++;
      this.onStateChange?.(group.id, group);

      // Validate files
      await this.validateGroup(group);

      // Process main file if it exists
      if (group.mainFile) {
        await this.processMainFile(group);

        // Process companions
        await this.processCompanionFiles(group);

        // Mark as complete
        group.status = 'complete';
        group.processingMetadata.endTime = new Date();
        group.processingMetadata.duration = 
          group.processingMetadata.endTime.getTime() - 
          group.processingMetadata.startTime.getTime();

        this.onStateChange?.(group.id, group);

        await dbLogger.info('Group processing complete', {
          groupId: group.id,
          duration: group.processingMetadata.duration,
          attempts: group.processingMetadata.attempts
        }, { LOG_SOURCE });
      } else {
        throw new FileProcessingError('No main file found in group', 'MISSING_MAIN_FILE');
      }

    } catch (error) {
      const processError = error instanceof Error ? error : new Error(String(error));
      await dbLogger.error('Group processing failed', {
        groupId: group.id,
        error: processError
      }, { LOG_SOURCE });
      throw processError;
    }
  }

  private async validateGroup(group: FileGroupState): Promise<void> {
    try {
      if (!group.mainFile) {
        throw new FileProcessingError('No main file found', 'MISSING_MAIN_FILE');
      }

      group.processingMetadata.currentStage = 'validation';
      this.onStateChange?.(group.id, group);

      const config = getConfigForFile(group.mainFile.name);
      if (!config) {
        throw new FileProcessingError(`No config found for ${group.mainFile.name}`, 'CONFIG_NOT_FOUND');
      }

      // Validate main file
      await this.validateFile(group.mainFile, config);

      // Validate companions
      for (const companion of group.companions) {
        const companionConfig = config.companionFiles.find(c => 
          companion.name.toLowerCase().endsWith(c.extension.toLowerCase())
        );
        if (companionConfig) {
          await this.validateFile(companion, config, companionConfig);
        }
      }

      // Update validation state
      group.validationState.isValid = true;
      group.validationState.lastValidated = new Date();

      await dbLogger.info('Group validation complete', {
        groupId: group.id,
        isValid: true
      }, { LOG_SOURCE });

    } catch (error) {
      const processError = error instanceof Error ? error : new Error(String(error));
      group.validationState.isValid = false;
      group.validationState.errors.push({
        timestamp: new Date(),
        message: processError.message,
        code: processError instanceof FileProcessingError ? processError.code : 'VALIDATION_ERROR'
      });
      throw processError;
    }
  }

  private async processMainFile(group: FileGroupState): Promise<void> {
    if (!group.mainFile) {
      throw new FileProcessingError('No main file found', 'MISSING_MAIN_FILE');
    }

    try {
      const file = group.mainFile;
      file.status = 'processing';
      this.onStateChange?.(group.id, group);

      // Process file (implement specific processing logic here)
      // This is where you'd handle different file types differently

      file.status = 'complete';
      file.processingProgress = 100;
      this.onStateChange?.(group.id, group);

    } catch (error) {
      const processError = error instanceof Error ? error : new Error(String(error));
      if (group.mainFile) {
        group.mainFile.status = 'error';
      }
      throw processError;
    }
  }

  private async processCompanionFiles(group: FileGroupState): Promise<void> {
    if (!group.mainFile) {
      throw new FileProcessingError('No main file found', 'MISSING_MAIN_FILE');
    }

    try {
      for (const companion of group.companions) {
        companion.status = 'processing';
        this.onStateChange?.(group.id, group);

        // Process companion file (implement specific processing logic here)
        // This is where you'd handle different companion file types differently

        companion.status = 'complete';
        companion.processingProgress = 100;
        this.onStateChange?.(group.id, group);
      }
    } catch (error) {
      const processError = error instanceof Error ? error : new Error(String(error));
      throw processError;
    }
  }

  private async validateFile(
    file: EnhancedFile, 
    config: FileTypeConfig, 
    companionConfig?: CompanionFileConfig
  ): Promise<void> {
    const maxSize = companionConfig?.maxSize || config.maxSize;

    // Check file size
    if (file.size > maxSize) {
      throw new FileProcessingError(
        `File ${file.name} exceeds maximum size of ${maxSize} bytes`,
        'FILE_TOO_LARGE'
      );
    }

    // Check MIME type if specified
    const mimeType = companionConfig?.mimeType || config.mimeType;
    if (mimeType && file.type !== mimeType) {
      throw new FileProcessingError(
        `Invalid MIME type for ${file.name}. Expected ${mimeType}, got ${file.type}`,
        'INVALID_MIME_TYPE'
      );
    }

    // Run custom validation if configured
    if (companionConfig?.validateContent) {
      const isValid = await companionConfig.validateContent(file);
      if (!isValid) {
        throw new FileProcessingError(
          `File ${file.name} failed content validation`,
          'INVALID_CONTENT'
        );
      }
    }
  }
} 