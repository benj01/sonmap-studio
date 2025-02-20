/**
 * Configuration for companion files
 */
export interface CompanionFileConfig {
  extension: string;
  description: string;
  required: boolean;
  maxSize: number;
}

/**
 * Configuration for a file type
 */
export interface FileTypeConfig {
  mainExtension: string;
  description: string;
  mimeType: string;
  maxSize: number;
  companionFiles: CompanionFileConfig[];
  validateContent?: (file: File) => Promise<boolean>;
}

/**
 * Group of related files (main file and its companions)
 */
export interface FileGroup {
  mainFile: File;
  companions: File[];
}

/**
 * Upload progress tracking
 */
export interface UploadProgress {
  total: number;
  current: number;
  files: Map<string, number>;
}

/**
 * Processed file information
 */
export interface ProcessedFile {
  file: File;
  type: string;
  size: number;
  isValid: boolean;
  error?: string;
}

/**
 * Group of processed files
 */
export interface ProcessedFiles {
  main: ProcessedFile;
  companions: ProcessedFile[];
}

/**
 * Uploaded file information
 */
export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  relatedFiles?: Record<string, {
    name: string;
    size: number;
  }>;
} 