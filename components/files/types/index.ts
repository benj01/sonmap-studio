/**
 * Configuration for companion files
 */
export interface CompanionFileConfig {
  extension: string;
  description: string;
  required: boolean;
  maxSize: number;
  mimeType?: string;
  validateContent?: (file: File) => Promise<boolean>;
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

/**
 * Project file information from database
 */
export interface ProjectFile {
  id: string;                    // uuid
  project_id: string;           // uuid
  name: string;                 // text
  file_type: string;           // text
  size: number;                // bigint
  storage_path: string;         // text
  uploaded_by?: string;         // uuid, nullable
  uploaded_at: string;          // timestamp with time zone
  metadata?: Record<string, any>;  // jsonb, default '{}'
  source_file_id?: string;     // uuid, nullable
  is_imported?: boolean;       // boolean, default false
  import_metadata?: Record<string, any>;  // jsonb, nullable
  is_shapefile_component?: boolean; // boolean, default false
  main_file_id?: string;      // uuid, nullable
  component_type?: 'shp' | 'shx' | 'dbf' | 'prj' | 'qmd'; // text, nullable with check constraint
  // Runtime-only properties (not in database)
  importedFiles?: ProjectFile[];
  companions?: ProjectFile[];
  source_file?: ProjectFile;   // Populated by join
  imported_file?: ProjectFile; // Populated by join
}

/**
 * Result of a file upload operation
 */
export interface FileUploadResult {
  id: string;
  name: string;
  size: number;
  type: string;
  relatedFiles?: Record<string, {
    name: string;
    size: number;
  }>;
} 