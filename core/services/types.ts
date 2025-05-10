/**
 * File group tracking types
 */

export type FileStatus = 'pending' | 'validating' | 'uploading' | 'processing' | 'complete' | 'error';
export type FileGroupStatus = 'incomplete' | 'ready' | 'processing' | 'complete' | 'error';
export type ProcessingStage = 'none' | 'validation' | 'upload' | 'import' | 'conversion';

export interface ValidationError {
  timestamp: Date;
  message: string;
  code: string;
}

export interface ValidationWarning {
  timestamp: Date;
  message: string;
  code: string;
}

export interface ValidationResult {
  isValid: boolean;
  timestamp: Date;
  error?: {
    message: string;
    code: string;
  };
}

export interface ProcessingError {
  timestamp: Date;
  message: string;
  code: string;
}

export interface EnhancedFile extends File {
  groupId: string;
  role: 'main' | 'companion';
  status: FileStatus;
  processingProgress: number;
  uploadProgress: number;
  validationResult?: ValidationResult;
}

export interface ValidationState {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  missingCompanions: string[];
  lastValidated: Date;
}

export interface ProcessingMetadata {
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  attempts: number;
  errors: ProcessingError[];
  currentStage: ProcessingStage;
}

export interface FileRelationships {
  sourceFileId?: string;
  derivedFiles: string[];
  linkedGroups: string[];
}

export interface FileGroupState {
  id: string;
  mainFile: EnhancedFile | null;
  companions: EnhancedFile[];
  status: FileGroupStatus;
  validationState: {
    isValid: boolean;
    lastValidated: Date | undefined;
    errors: ValidationError[];
    warnings: ValidationWarning[];
  };
  processingMetadata: {
    startTime: Date | undefined;
    endTime: Date | undefined;
    duration: number;
    currentStage: ProcessingStage;
    attempts: number;
    errors: ProcessingError[];
  };
} 