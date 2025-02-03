import { GeoFileUpload, ProcessingError, ProcessingErrorType } from '../processors/base/types';
import { LogManager } from '../logging/log-manager';

interface FileGroup {
  mainFile: File | null;
  companions: Map<string, File>;
}

/**
 * Utility for reading and grouping geo data files
 */
export class GeoFileReader {
  private static readonly logger = LogManager.getInstance();
  private static readonly LOG_SOURCE = 'GeoFileReader';

  /**
   * Create a GeoFileUpload from a FileList
   */
  public static async createUpload(files: FileList): Promise<GeoFileUpload> {
    this.logger.debug(this.LOG_SOURCE, 'Creating upload from files', {
      count: files.length,
      names: Array.from(files).map(f => f.name)
    });

    // Group files by base name
    const groups = this.groupFiles(files);
    
    // Find the main file group (should only be one)
    const mainGroup = this.findMainGroup(groups);
    
    if (!mainGroup) {
      throw new ProcessingError(
        'No valid main file found in selection',
        ProcessingErrorType.MISSING_FILE
      );
    }

    // Read file data
    const upload = await this.createUploadFromGroup(mainGroup);
    
    this.logger.debug(this.LOG_SOURCE, 'Created upload object', {
      mainFile: upload.mainFile.name,
      companions: Object.keys(upload.companions),
      sizes: {
        main: upload.mainFile.size,
        companions: Object.fromEntries(
          Object.entries(upload.companions).map(([ext, file]) => [ext, file.size])
        )
      }
    });

    return upload;
  }

  /**
   * Group files by base name
   */
  private static groupFiles(files: FileList): Map<string, FileGroup> {
    const groups = new Map<string, FileGroup>();

    for (const file of Array.from(files)) {
      const { baseName, extension } = this.splitFileName(file.name);
      
      // Get or create group
      let group = groups.get(baseName);
      if (!group) {
        group = { mainFile: null, companions: new Map() };
        groups.set(baseName, group);
      }

      // Add file to group
      if (this.isMainFile(extension)) {
        group.mainFile = file;
      } else {
        group.companions.set(extension.toLowerCase(), file);
      }
    }

    return groups;
  }

  /**
   * Find the main file group
   */
  private static findMainGroup(groups: Map<string, FileGroup>): FileGroup | null {
    // If only one group, use it
    if (groups.size === 1) {
      return Array.from(groups.values())[0];
    }

    // Find group with main file
    for (const [baseName, group] of groups) {
      if (group.mainFile) {
        this.logger.debug(this.LOG_SOURCE, 'Found main file group', { baseName });
        return group;
      }
    }

    return null;
  }

  /**
   * Create a GeoFileUpload from a file group
   */
  private static async createUploadFromGroup(group: FileGroup): Promise<GeoFileUpload> {
    if (!group.mainFile) {
      throw new ProcessingError(
        'No main file in group',
        ProcessingErrorType.MISSING_FILE
      );
    }

    // Read main file data
    const mainData = await group.mainFile.arrayBuffer();
    
    // Read companion file data
    const companions: GeoFileUpload['companions'] = {};
    for (const [ext, file] of group.companions) {
      const data = await file.arrayBuffer();
      companions[ext] = {
        name: file.name,
        data,
        type: file.type || this.getMimeType(ext),
        size: file.size
      };
    }

    return {
      mainFile: {
        name: group.mainFile.name,
        data: mainData,
        type: group.mainFile.type || this.getMimeType(this.getExtension(group.mainFile.name)),
        size: group.mainFile.size
      },
      companions
    };
  }

  /**
   * Split a filename into base name and extension
   */
  private static splitFileName(fileName: string): { baseName: string; extension: string } {
    const lastDot = fileName.lastIndexOf('.');
    if (lastDot === -1) {
      return { baseName: fileName, extension: '' };
    }
    return {
      baseName: fileName.substring(0, lastDot),
      extension: fileName.substring(lastDot).toLowerCase()
    };
  }

  /**
   * Check if a file is a main geo data file
   */
  private static isMainFile(extension: string): boolean {
    const mainExtensions = ['.shp', '.geojson', '.json', '.kml', '.gpx'];
    return mainExtensions.includes(extension.toLowerCase());
  }

  /**
   * Get MIME type for file extension
   */
  private static getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      '.shp': 'application/x-shapefile',
      '.dbf': 'application/x-dbf',
      '.shx': 'application/x-shx',
      '.prj': 'text/plain',
      '.geojson': 'application/geo+json',
      '.json': 'application/json',
      '.kml': 'application/vnd.google-earth.kml+xml',
      '.gpx': 'application/gpx+xml'
    };
    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  }

  /**
   * Get extension from filename
   */
  private static getExtension(fileName: string): string {
    const lastDot = fileName.lastIndexOf('.');
    return lastDot === -1 ? '' : fileName.substring(lastDot).toLowerCase();
  }
} 