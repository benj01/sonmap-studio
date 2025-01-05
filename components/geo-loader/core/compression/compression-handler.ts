import JSZip from 'jszip';
import { ValidationError } from '../errors/types';

export interface CompressedFile {
  name: string;
  path: string;
  size: number;
  data: Blob | ArrayBuffer;
}

export interface CompressionOptions {
  // Maximum size of compressed file (default: 1GB)
  maxCompressedSize?: number;
  // Maximum number of files in archive (default: 1000)
  maxFileCount?: number;
  // List of allowed file extensions
  allowedExtensions?: string[];
  // Whether to preserve directory structure
  preserveStructure?: boolean;
  // Maximum depth of directory structure
  maxDepth?: number;
}

/**
 * Handles compressed file processing
 */
export class CompressionHandler {
  private static readonly DEFAULT_OPTIONS: Required<CompressionOptions> = {
    maxCompressedSize: 1024 * 1024 * 1024, // 1GB
    maxFileCount: 1000,
    allowedExtensions: ['.shp', '.dbf', '.shx', '.prj', '.dxf', '.csv'],
    preserveStructure: true,
    maxDepth: 5
  };

  private options: Required<CompressionOptions>;

  constructor(options: CompressionOptions = {}) {
    this.options = { ...CompressionHandler.DEFAULT_OPTIONS, ...options };
  }

  /**
   * Process a compressed file
   */
  async processCompressedFile(
    file: File,
    progressCallback?: (progress: number) => void
  ): Promise<CompressedFile[]> {
    // Validate file size
    if (file.size > this.options.maxCompressedSize) {
      throw new ValidationError(
        `File size exceeds maximum allowed size of ${this.options.maxCompressedSize} bytes`,
        'COMPRESSED_FILE_TOO_LARGE',
        undefined,
        { fileSize: file.size, maxSize: this.options.maxCompressedSize }
      );
    }

    try {
      // Load zip file
      const zip = new JSZip();
      const zipData = await zip.loadAsync(file, {
        checkCRC32: true,
        onProgress: (metadata) => {
          progressCallback?.(metadata.percent / 100);
        }
      });

      // Get all files
      const files: CompressedFile[] = [];
      let fileCount = 0;

      for (const [path, zipEntry] of Object.entries(zipData.files)) {
        // Skip directories
        if (zipEntry.dir) {
          continue;
        }

        // Check file count
        fileCount++;
        if (fileCount > this.options.maxFileCount) {
          throw new ValidationError(
            `Archive contains more than ${this.options.maxFileCount} files`,
            'TOO_MANY_FILES',
            undefined,
            { fileCount, maxCount: this.options.maxFileCount }
          );
        }

        // Check directory depth
        const depth = path.split('/').length - 1;
        if (depth > this.options.maxDepth) {
          throw new ValidationError(
            `Directory depth exceeds maximum of ${this.options.maxDepth}`,
            'DIRECTORY_TOO_DEEP',
            undefined,
            { path, depth, maxDepth: this.options.maxDepth }
          );
        }

        // Check file extension
        const ext = path.toLowerCase().slice(path.lastIndexOf('.'));
        if (!this.options.allowedExtensions.includes(ext)) {
          continue; // Skip unsupported files
        }

        // Get file data
        const data = await zipEntry.async('blob');
        
        files.push({
          name: path.split('/').pop()!,
          path: this.options.preserveStructure ? path : path.split('/').pop()!,
          size: data.size,
          data
        });

        // Update progress
        progressCallback?.((fileCount / Object.keys(zipData.files).length) * 100);
      }

      if (files.length === 0) {
        throw new ValidationError(
          'No supported files found in archive',
          'NO_SUPPORTED_FILES'
        );
      }

      return files;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(
        `Failed to process compressed file: ${error instanceof Error ? error.message : String(error)}`,
        'COMPRESSION_PROCESSING_ERROR',
        undefined,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Group related files together (e.g., shapefile components)
   */
  groupRelatedFiles(files: CompressedFile[]): Map<string, CompressedFile[]> {
    const groups = new Map<string, CompressedFile[]>();

    for (const file of files) {
      const baseName = file.name.slice(0, file.name.lastIndexOf('.'));
      const group = groups.get(baseName) || [];
      group.push(file);
      groups.set(baseName, group);
    }

    return groups;
  }

  /**
   * Check if a file is a supported compressed file
   */
  static isCompressedFile(file: File): boolean {
    return file.name.toLowerCase().endsWith('.zip');
  }

  /**
   * Update compression options
   */
  setOptions(options: Partial<CompressionOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get current options
   */
  getOptions(): Required<CompressionOptions> {
    return { ...this.options };
  }
}
